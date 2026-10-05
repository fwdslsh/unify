/**
 * `unify update [template]` — bring a later version of the project's template
 * in, without touching what the site owns (conformance-spec §19.10).
 *
 * The whole record is ONE line in unify.yaml, written by `init`:
 *
 *     template: https://github.com/acme/templates/shop#3f9c2e1a…
 *
 * — the source, pinned to the version that was fetched (a git commit, an npm
 * version, unify's own version for a built-in, the commit of the repository a
 * directory sits in). Nothing is stored about files: no hash list, no copy of
 * the old template. This command fetches the template TWICE — at the recorded
 * version, which is the BASELINE the site started from, and at its latest (or
 * at the version named on the command line) — and decides file by file from
 * three things: the baseline, the new version, and what is on disk. That is how
 * a version-control merge finds its base, and it is why the record is pinned.
 *
 *   template unchanged                      → nothing, whatever the site did to it
 *   site unchanged, template changed        → update
 *   site already has the new content        → nothing
 *   both changed, or site removed it        → CONFLICT: kept as is, reported
 *   new in the template, absent locally     → add
 *   new in the template, present locally    → CONFLICT (the site got there first)
 *   gone from the template, site unchanged  → remove
 *   gone from the template, site changed    → CONFLICT: kept, reported
 *   listed under `owned:` in unify.yaml     → never written, removed or reported
 *                                             (added once if absent: a seed the
 *                                             site does not have yet)
 *
 * A conflict is never resolved here, and there is no flag that resolves it:
 * the site's bytes stay, the line names the file and why, and the exit code
 * is 1 so a script sees it. The record advances to the new version only when
 * a run ends with no conflict, so conflicts stay visible run after run until
 * the site takes the template's version, or claims the file for good by
 * listing it under `owned:`.
 *
 * A record with no pin — a directory that was not a clean git checkout when
 * it was scaffolded — has no baseline to fetch. The command then compares
 * two ways rather than three: a file that differs from the template is a
 * conflict, since nothing can say which side changed it; nothing is ever
 * removed. The report says so.
 *
 * Nothing the template ships is executed: `npm pack --ignore-scripts`, a bare
 * `git clone`, and plain file writes. Every write is temp-then-rename beside
 * its target; every target is checked before the first write — a symlink, or
 * a path whose directory resolves outside the project, is refused as a
 * conflict rather than followed. The fetches happen first, so a source that
 * cannot be reached writes nothing. `--dry-run` prints the same change set and
 * writes nothing, not even the record.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { UsageError } from "../../core/diagnostics.js";
import { contains, isExcluded, toRelative } from "../../core/paths.js";
import { TEMPLATES } from "../../templates/index.js";
import { configPath } from "../options.js";
import { saveEntries, writeConfig } from "../save-config.js";
import { classifyTemplateSource, fetchTemplate, isPinned, pinSource, unpinned } from "../template-source.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {{dryRun: boolean, template?: string, recordedTemplate?: string, owned: string[], configDir: string}} context.settings
 * @param {string|undefined} context.template - the positional (or --template): a source to move to; else the recorded one, unpinned
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {string} [context.projectRoot]
 * @returns {Promise<number>} 0 applied or nothing to do; 1 conflicts; usage faults throw (2)
 */
export async function update({ sourceRoot, settings, template, reporter, projectRoot = process.cwd() }) {
  const builtIns = Object.keys(TEMPLATES);
  const recorded = settings.recordedTemplate;
  const explicit = template ?? settings.template;
  const { path: configFile } = configPath(sourceRoot, projectRoot);
  const configDir = dirname(configFile);
  if (recorded === undefined && explicit === undefined) throw noRecord(projectRoot, toRelative(projectRoot, configFile) || "unify.yaml", builtIns);

  // ---- the two fetches ------------------------------------------------------
  // The baseline: the recorded source at its pinned version. A record that
  // carries no pin has no baseline, and the comparison below is two-way.
  const recordedSource = recorded === undefined ? null : classifyTemplateSource(recorded, builtIns, configDir);
  const baseline = recordedSource !== null && isPinned(recordedSource) ? await fetchTemplate(recordedSource, recorded) : null;
  // The new version: what was named, else the recorded source without its pin.
  const label = explicit ?? recorded;
  const newSource = explicit !== undefined ? classifyTemplateSource(explicit, builtIns, projectRoot) : unpinned(recordedSource);
  const fetched = await fetchTemplate(newSource, label);

  // ---- the plan -------------------------------------------------------------
  /** A template's files by template-relative key (`site/index.html`, `AGENTS.md`). */
  const keyed = (tpl) => {
    const map = new Map();
    for (const [rel, content] of Object.entries(tpl.files)) map.set(tpl.sourceDir === null ? rel : `${tpl.sourceDir}/${rel}`, content);
    for (const [rel, content] of Object.entries(tpl.rootFiles)) map.set(rel, content);
    return map;
  };
  const incoming = keyed(fetched);
  const base = baseline === null ? new Map() : keyed(baseline);

  /** Where a template-relative key lives in THIS project. */
  const locate = (key, sourceDir) => {
    if (sourceDir === null) return join(sourceRoot, ...key.split("/"));
    return key.startsWith(`${sourceDir}/`) ? join(sourceRoot, ...key.slice(sourceDir.length + 1).split("/")) : join(projectRoot, ...key.split("/"));
  };
  const roots = [resolve(projectRoot), resolve(sourceRoot)];
  const shown = (abs) => toRelative(projectRoot, abs) || ".";

  const plan = { update: [], add: [], remove: [], conflict: [], owned: 0 };
  const keys = new Set([...base.keys(), ...incoming.keys()]);
  for (const key of [...keys].sort()) {
    if (key.split("/").includes("..")) { plan.conflict.push([key, "the path escapes the project"]); continue; }
    const content = incoming.get(key);
    const abs = locate(key, content === undefined ? baseline.sourceDir : fetched.sourceDir);
    const oldHash = base.has(key) ? hashOf(abs, base.get(key)) : undefined;
    const newHash = content === undefined ? undefined : hashOf(abs, content);
    const local = localState(abs, roots);
    if (local.fault) { plan.conflict.push([key, local.fault]); continue; }

    // §19.10 — site-owned, by unify.yaml's `owned:` (paths relative to that
    // file, --exclude's grammar): written once when absent, otherwise the
    // site's and never mentioned.
    if (isExcluded(toRelative(configDir, abs), settings.owned)) {
      if (content !== undefined && local.hash === null) plan.add.push([key, abs, content]);
      else plan.owned++;
      continue;
    }

    if (oldHash === undefined) {
      // new in the template — or, with no baseline, every file in it
      if (content === undefined) continue;
      if (local.hash === null) plan.add.push([key, abs, content]);
      else if (local.hash !== newHash) {
        plan.conflict.push([key, baseline === null ? "differs from the template, which has no earlier version to compare against" : "exists locally and is not the template's file"]);
      }
    } else if (content === undefined) {
      // gone from the template
      if (local.hash === null) continue; // already gone
      if (local.hash === oldHash) plan.remove.push([key, abs]);
      else plan.conflict.push([key, "removed from the template, changed locally"]);
    } else if (newHash === oldHash) {
      // template unchanged: the site's business
    } else if (local.hash === oldHash) {
      plan.update.push([key, abs, content]);
    } else if (local.hash !== newHash) {
      plan.conflict.push([key, local.hash === null ? "removed locally, changed in the template" : "changed locally and in the template"]);
    }
  }

  // ---- the report -----------------------------------------------------------
  const would = settings.dryRun ? "would " : "";
  const named = (key, abs) => `${shown(abs)}${shown(abs) === key ? "" : ` (${key})`}`;
  for (const [key, abs] of plan.update) reporter.summary(`${would}update ${named(key, abs)}`);
  for (const [key, abs] of plan.add) reporter.summary(`${would}add ${named(key, abs)}`);
  for (const [key, abs] of plan.remove) reporter.summary(`${would}remove ${named(key, abs)}`);
  for (const [key, why] of plan.conflict) reporter.summary(`conflict ${key}: ${why} — kept as is`);

  const pinned = pinSource(newSource, fetched.revision, label, configDir);
  const changes = plan.update.length + plan.add.length + plan.remove.length;
  const alone = plan.owned ? ` (${plan.owned} site-owned file(s) left alone)` : "";
  if (baseline === null) {
    reporter.summary(`${label} has no recorded version to compare against${recordedSource?.kind === "dir" ? " (it was not a clean git checkout when scaffolded)" : ""}: a file that differs is a conflict, and nothing is removed`);
  }
  if (changes === 0 && plan.conflict.length === 0) {
    reporter.summary(`update: nothing to do — ${pinned} is already applied${alone}`);
  } else {
    reporter.summary(`update: ${would}${plan.update.length} updated, ${plan.add.length} added, ${plan.remove.length} removed, ${plan.conflict.length} conflict(s)${alone} — ${pinned}`);
  }
  if (plan.conflict.length > 0) {
    reporter.summary(
      `a conflict keeps the site's bytes${recorded === undefined ? "" : `, and unify.yaml stays at template: ${recorded}`}: take the template's version, ` +
        "or keep yours and list the file under owned: in unify.yaml, then run unify update again",
    );
  }

  // ---- apply ----------------------------------------------------------------
  if (!settings.dryRun) {
    for (const [, abs, content] of [...plan.update, ...plan.add]) {
      mkdirSync(dirname(abs), { recursive: true });
      const tmp = `${abs}.unify-tmp-${randomUUID()}`;
      writeFileSync(tmp, content);
      renameSync(tmp, abs);
    }
    for (const [, abs] of plan.remove) rmSync(abs, { force: true });
    // The record advances only when the project fully reflects the new
    // version; otherwise the old line is put back (a rewritten unify.yaml
    // carries the template's copy of it, or none).
    const line = plan.conflict.length === 0 ? pinned : recorded;
    if (line !== undefined) {
      if (!existsSync(configFile)) writeFileSync(configFile, "");
      writeConfig(configFile, saveEntries({ template: line }));
    }
  }
  return plan.conflict.length > 0 ? 1 : 0;
}

/**
 * §19.10 — a project with no `template:` line has nothing to update from, and
 * nothing is guessed. The fix names the line to add; a `unify.template.json`
 * left by 0.11.2 gets its own line, composed from what it recorded.
 * @param {string} projectRoot
 * @param {string} configShown
 * @param {string[]} builtIns
 */
function noRecord(projectRoot, configShown, builtIns) {
  const fixes = [
    `add the line unify init writes, pinned to the version this project was scaffolded from: template: <git url>#<commit>, template: <npm name>@<version>, or template: <built-in>@<unify version>`,
    "or name the template now: unify update <source> — with no recorded version to compare against, every file that differs is kept as a conflict",
  ];
  const legacy = join(projectRoot, "unify.template.json");
  if (existsSync(legacy)) {
    try {
      const { source, revision } = JSON.parse(readFileSync(legacy, "utf8"));
      const pinned = pinSource(unpinned(classifyTemplateSource(String(source), builtIns, projectRoot)), revision ?? null, String(source), projectRoot);
      fixes.unshift(`unify.template.json is 0.11.2's record: add  template: ${pinned}  to ${configShown} and delete that file`);
    } catch {
      fixes.unshift("unify.template.json is 0.11.2's record; its source and revision are the template: line to add, then delete that file");
    }
  }
  return new UsageError(`no template recorded in ${configShown}: this project has nothing to update from`, fixes);
}

/**
 * A content hash, with one normalization: `unify.yaml`'s own `template:` line
 * is unify's, not the template's or the site's, so it never counts as a
 * change on either side.
 * @param {string} abs - the file's place in the project (its name decides)
 * @param {Uint8Array|string} content
 */
function hashOf(abs, content) {
  let bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  if (basename(abs) === "unify.yaml") {
    bytes = Buffer.from(bytes.toString("utf8").split(/\r?\n/).filter((line) => !/^template:/.test(line)).join("\n"), "utf8");
  }
  return createHash("sha256").update(bytes).digest("hex");
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
  return { hash: hashOf(abs, readFileSync(abs)) };
}

/** @param {string} abs */
function isSymlink(abs) {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}
