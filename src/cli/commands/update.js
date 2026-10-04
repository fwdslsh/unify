/**
 * `unify update [template]` — bring a later version of the project's template
 * in, without touching what the site owns (conformance-spec §19.10).
 *
 * `init` leaves a record (`unify.template.json`: the source, the revision, a
 * hash of every file the template provided). This command fetches the
 * template again — the recorded source, or the one named on the command line
 * to move to a different version or address — and decides, file by file, by
 * comparing THREE things: what the template provided last time (the recorded
 * hash), what it provides now, and what is on disk.
 *
 *   template unchanged                      → nothing, whatever the site did to it
 *   site unchanged, template changed        → update
 *   site already has the new content        → nothing (recorded as current)
 *   both changed, or site removed it        → CONFLICT: kept as is, reported
 *   new in the template, absent locally     → add
 *   new in the template, present locally    → CONFLICT (the site got there first)
 *   gone from the template, site unchanged  → remove
 *   gone from the template, site changed    → CONFLICT: kept, reported
 *   matched by the template's `owned` list  → never written, removed or reported
 *                                             (added once if absent: a seed the
 *                                             site does not have yet)
 *
 * A conflict is never resolved here, and there is no flag that resolves it:
 * the site's bytes stay, the line names the file and why, and the exit code
 * is 1 so a script sees it. The baseline hash of a conflicting file is kept
 * from the old record, so the conflict stays visible on every run until the
 * site takes the template's version (then it reads "current") or the template
 * stops changing it.
 *
 * Nothing the template ships is executed: `npm pack --ignore-scripts`, a bare
 * `git clone`, and plain file writes. Every write is temp-then-rename beside
 * its target; every target is checked before the first write — a symlink, or
 * a path whose directory resolves outside the project, is refused as a
 * conflict rather than followed. A fetch that fails writes nothing, because
 * it happens first. `--dry-run` prints the same change set and writes nothing,
 * not even the record.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { UsageError } from "../../core/diagnostics.js";
import { contains, isExcluded, toRelative } from "../../core/paths.js";
import { TEMPLATES } from "../../templates/index.js";
import { buildRecord, hashContent, readRecord, RECORD_FILE, sourceKey, writeRecord } from "../template-record.js";
import { classifyTemplateSource, fetchTemplate } from "../template-source.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {{dryRun: boolean}} context.settings
 * @param {string|undefined} context.template - the positional: a template source to move to; else the recorded one
 * @param {boolean} [context.adopt] - record the named template without changing files
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {string} [context.projectRoot]
 * @returns {Promise<number>} 0 applied or nothing to do; 1 conflicts; usage faults throw (2)
 */
export async function update({ sourceRoot, settings, template, adopt = false, reporter, projectRoot = process.cwd() }) {
  const record = readRecord(projectRoot);

  if (adopt) {
    if (template === undefined) throw new UsageError("--adopt needs the template to adopt", ["run it as: unify update --adopt <template source>"]);
    const fetched = await fetchTemplate(classifyTemplateSource(template, Object.keys(TEMPLATES), projectRoot), template);
    if (!settings.dryRun) writeRecord(projectRoot, buildRecord(fetched));
    reporter.summary(`${settings.dryRun ? "would record" : "recorded"} ${template}${fetched.revision ? ` at ${fetched.revision}` : ""} in ${RECORD_FILE}; no file was changed`);
    reporter.summary("next: unify update — it compares the project against this version");
    return 0;
  }

  if (record === null) {
    throw new UsageError(`no ${RECORD_FILE} at ${projectRoot}: this project has no recorded template`, [
      "unify init writes the record (0.11.1 and later); for a project scaffolded earlier, or whose record was removed, adopt the template at the version it was scaffolded from: unify update --adopt <source>",
      "the source is what init was given: a built-in name, a directory, a git URL (with #ref for the version), or an npm package (with @version)",
    ]);
  }

  const label = template ?? record.source;
  const fetched = await fetchTemplate(classifyTemplateSource(label, Object.keys(TEMPLATES), projectRoot), label);

  // ---- the plan -----------------------------------------------------------
  const incoming = new Map(); // key → content
  for (const [rel, content] of Object.entries(fetched.files)) incoming.set(sourceKey(fetched.sourceDir, rel), content);
  for (const [rel, content] of Object.entries(fetched.rootFiles)) incoming.set(rel, content);

  /** Where a template-relative key lives in THIS project. */
  const locate = (key, sourceDir) => {
    if (sourceDir === null) return join(sourceRoot, ...key.split("/"));
    return key.startsWith(`${sourceDir}/`) ? join(sourceRoot, ...key.slice(sourceDir.length + 1).split("/")) : join(projectRoot, ...key.split("/"));
  };
  const roots = [resolve(projectRoot), resolve(sourceRoot)];
  const shown = (abs) => toRelative(projectRoot, abs) || ".";

  const plan = { update: [], add: [], remove: [], conflict: [], current: [], owned: 0 };
  const nextHashes = {};
  const keys = new Set([...Object.keys(record.files), ...incoming.keys()]);
  for (const key of [...keys].sort()) {
    if (key.split("/").includes("..")) { plan.conflict.push([key, "the path escapes the project"]); continue; }
    const oldHash = record.files[key];
    const content = incoming.get(key);
    const newHash = content === undefined ? undefined : hashContent(content);
    const abs = locate(key, content === undefined ? record.sourceDir : fetched.sourceDir);
    const local = localState(abs, roots);

    if (local.fault) { plan.conflict.push([key, local.fault]); if (oldHash) nextHashes[key] = oldHash; continue; }

    // §19.10 — site-owned: written once when absent, otherwise the site's.
    if (isExcluded(key, fetched.owned)) {
      if (content !== undefined) nextHashes[key] = newHash;
      if (content !== undefined && local.hash === null) plan.add.push([key, abs, content]);
      else plan.owned++;
      continue;
    }

    if (oldHash === undefined) {
      // new in the template
      if (local.hash === null) { plan.add.push([key, abs, content]); nextHashes[key] = newHash; }
      else if (local.hash === newHash) { plan.current.push(key); nextHashes[key] = newHash; }
      else plan.conflict.push([key, "exists locally and is not the template's file"]);
    } else if (content === undefined) {
      // gone from the template
      if (local.hash === null) continue; // already gone
      if (local.hash === oldHash) plan.remove.push([key, abs]);
      else { plan.conflict.push([key, "removed from the template, changed locally"]); nextHashes[key] = oldHash; }
    } else if (newHash === oldHash) {
      nextHashes[key] = oldHash; // template unchanged: the site's business
    } else if (local.hash === oldHash) {
      plan.update.push([key, abs, content]); nextHashes[key] = newHash;
    } else if (local.hash === newHash) {
      plan.current.push(key); nextHashes[key] = newHash;
    } else {
      plan.conflict.push([key, local.hash === null ? "removed locally, changed in the template" : "changed locally and in the template"]);
      nextHashes[key] = oldHash;
    }
  }

  // ---- the report ---------------------------------------------------------
  const would = settings.dryRun ? "would " : "";
  for (const [key, abs] of plan.update) reporter.summary(`${would}update ${shown(abs)}${shown(abs) === key ? "" : ` (${key})`}`);
  for (const [key, abs] of plan.add) reporter.summary(`${would}add ${shown(abs)}${shown(abs) === key ? "" : ` (${key})`}`);
  for (const [key, abs] of plan.remove) reporter.summary(`${would}remove ${shown(abs)}${shown(abs) === key ? "" : ` (${key})`}`);
  for (const [key, why] of plan.conflict) reporter.summary(`conflict ${key}: ${why} — kept as is`);

  const changes = plan.update.length + plan.add.length + plan.remove.length;
  const at = fetched.revision ? ` at ${fetched.revision}` : "";
  if (changes === 0 && plan.conflict.length === 0) {
    reporter.summary(`update: nothing to do — ${label}${at} is already applied${plan.owned ? ` (${plan.owned} site-owned file(s) left alone)` : ""}`);
  } else {
    reporter.summary(
      `update: ${would}${plan.update.length} updated, ${plan.add.length} added, ${plan.remove.length} removed, ${plan.conflict.length} conflict(s)` +
        `${plan.owned ? `, ${plan.owned} site-owned left alone` : ""} — ${label}${at}`,
    );
  }
  if (plan.conflict.length > 0) {
    reporter.summary("a conflict keeps the site's bytes: review each file, take the template's version or keep yours, then run unify update again");
  }

  // ---- apply --------------------------------------------------------------
  if (!settings.dryRun) {
    for (const [, abs, content] of [...plan.update, ...plan.add]) {
      mkdirSync(dirname(abs), { recursive: true });
      const tmp = `${abs}.unify-tmp-${randomUUID()}`;
      writeFileSync(tmp, content);
      renameSync(tmp, abs);
    }
    for (const [, abs] of plan.remove) rmSync(abs, { force: true });
    writeRecord(projectRoot, {
      ...record,
      source: label,
      revision: fetched.revision,
      sourceDir: fetched.sourceDir,
      owned: fetched.owned,
      files: nextHashes,
    });
  }
  return plan.conflict.length > 0 ? 1 : 0;
}

/**
 * What is on disk at a template file's place: its hash, null when absent, or
 * a fault that makes the path untouchable — a symlink (never followed, never
 * replaced), or a directory that resolves outside the project.
 * @param {string} abs
 * @param {string[]} roots - the project root and the source root
 * @returns {{hash: string|null, fault?: string}}
 */
function localState(abs, roots) {
  let dir = dirname(abs);
  while (!existsSync(dir)) dir = dirname(dir);
  const real = realpathSync(dir);
  if (!roots.some((root) => contains(root, real))) return { hash: null, fault: "its directory resolves outside the project" };
  if (!existsSync(abs) && !isSymlink(abs)) return { hash: null };
  if (isSymlink(abs)) return { hash: null, fault: "it is a symlink" };
  if (!lstatSync(abs).isFile()) return { hash: null, fault: "it is not a regular file" };
  return { hash: hashContent(readFileSync(abs)) };
}

/** @param {string} abs */
function isSymlink(abs) {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}
