/**
 * `unify update [template]` — fetch the project's template again and copy its
 * changed files over the project, after showing the list and asking
 * (conformance-spec §19.10).
 *
 * The whole record is ONE line in unify.yaml, written by `init`:
 *
 *     template: https://github.com/acme/templates/shop
 *
 * — the source as it was typed. Nothing is stored about files or versions.
 * This command fetches that source (or the one named on the command line,
 * which then replaces the line) through init's own resolver and compares
 * every file the template ships with the project's copy at the same place:
 *
 *   absent in the project     → add
 *   the same bytes            → nothing
 *   different bytes           → overwrite — listed, and confirmed first
 *
 * Nothing is removed, and nothing outside the template's paths is visited.
 * The confirmation is the protection for local edits: every file that would
 * be overwritten is listed, and the command waits for `y` on stdin unless
 * `--yes` was passed. Anything else writes nothing and exits 1. `--dry-run`
 * prints the same list and never asks or writes.
 *
 * Nothing the template ships is executed: `npm pack --ignore-scripts`, a bare
 * `git clone`, and plain file writes. Every write is temp-then-rename beside
 * its target; every target is checked before the first write — a symlink, or
 * a path whose directory resolves outside the project, is skipped and
 * reported rather than followed. The fetch happens first, so a source that
 * cannot be reached writes nothing.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { UsageError } from "../../core/diagnostics.js";
import { contains, toRelative } from "../../core/paths.js";
import { TEMPLATES } from "../../templates/index.js";
import { configPath } from "../options.js";
import { saveEntries, writeConfig } from "../save-config.js";
import { classifyTemplateSource, fetchTemplate, recordSource } from "../template-source.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {{dryRun: boolean, yes: boolean, template?: string, recordedTemplate?: string}} context.settings
 * @param {string|undefined} context.template - the positional (or --template): a source to move to; else the recorded one
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {string} [context.projectRoot]
 * @param {NodeJS.ReadableStream} [context.stdin] - where the answer to the prompt is read from
 * @returns {Promise<number>} 0 applied or nothing to do; 1 declined; usage faults throw (2)
 */
export async function update({ sourceRoot, settings, template, reporter, projectRoot = process.cwd(), stdin = process.stdin }) {
  const { path: configFile } = configPath(sourceRoot, projectRoot);
  const configDir = dirname(configFile);
  const explicit = template ?? settings.template;
  const label = explicit ?? settings.recordedTemplate;
  if (label === undefined) throw noRecord(projectRoot, toRelative(projectRoot, configFile) || "unify.yaml");

  // The recorded line was written relative to unify.yaml's directory (a
  // directory template); one typed now resolves from the working directory.
  const source = classifyTemplateSource(label, Object.keys(TEMPLATES), explicit === undefined ? configDir : projectRoot);
  const fetched = await fetchTemplate(source, label);
  const record = explicit === undefined ? label : recordSource(source, label, configDir);

  // ---- the list -------------------------------------------------------------
  // The template's site/ lands in the source root, the rest at the project
  // root — the same two places init put them.
  const targets = [
    ...Object.entries(fetched.files).map(([rel, content]) => [rel, join(sourceRoot, ...rel.split("/")), content]),
    ...Object.entries(fetched.rootFiles).map(([rel, content]) => [rel, join(projectRoot, ...rel.split("/")), content]),
  ];
  const roots = [resolve(projectRoot), resolve(sourceRoot)];
  const shown = (abs) => toRelative(projectRoot, abs) || ".";

  const plan = { overwrite: [], add: [], skip: [] };
  for (const [rel, abs, content] of targets) {
    if (rel.split("/").includes("..")) { plan.skip.push([rel, "the path escapes the project"]); continue; }
    const local = localState(abs, roots);
    if (local.fault) plan.skip.push([shown(abs), local.fault]);
    else if (local.hash === null) plan.add.push([abs, content]);
    else if (local.hash !== hashOf(abs, content)) plan.overwrite.push([abs, content]);
  }
  for (const list of [plan.overwrite, plan.add, plan.skip]) list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // ---- the report -----------------------------------------------------------
  const would = settings.dryRun ? "would " : "";
  for (const [abs] of plan.overwrite) reporter.summary(`${would}overwrite ${shown(abs)}`);
  for (const [abs] of plan.add) reporter.summary(`${would}add ${shown(abs)}`);
  for (const [name, why] of plan.skip) reporter.summary(`skip ${name}: ${why}`);
  const skipped = plan.skip.length === 0 ? "" : `, ${plan.skip.length} skipped`;
  const changes = plan.overwrite.length + plan.add.length;
  if (changes === 0) reporter.summary(`update: nothing to do — ${label} is already applied${skipped}`);
  else if (settings.dryRun) reporter.summary(`update: would overwrite ${plan.overwrite.length}, add ${plan.add.length}${skipped} — ${label}`);
  if (settings.dryRun) return 0;

  // ---- the question ---------------------------------------------------------
  // Only an overwrite loses something, so only an overwrite asks. End of input
  // is a no: a script that means yes says --yes.
  if (plan.overwrite.length > 0 && !settings.yes) {
    const ok = await confirm(`overwrite ${plan.overwrite.length} file(s)? [y/N] `, stdin, reporter.stderr);
    if (!ok) {
      reporter.summary("update: nothing written — answer y, or pass --yes to overwrite without asking");
      return 1;
    }
  }

  // ---- apply ----------------------------------------------------------------
  for (const [abs, content] of [...plan.overwrite, ...plan.add]) {
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = `${abs}.unify-tmp-${randomUUID()}`;
    writeFileSync(tmp, content);
    renameSync(tmp, abs);
  }
  if (changes > 0) reporter.summary(`update: overwrote ${plan.overwrite.length}, added ${plan.add.length}${skipped} — ${label}`);
  // The record is written back after the copy (a template's unify.yaml has no
  // template: line of its own), and follows a source named on the command line.
  if (changes > 0 || explicit !== undefined) {
    if (!existsSync(configFile)) writeFileSync(configFile, "");
    writeConfig(configFile, saveEntries({ template: record }));
  }
  return 0;
}

/**
 * One question on stderr, one line from stdin: `y` or `yes` is a yes, anything
 * else — a blank line, `n`, end of input — is a no.
 * @param {string} question
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @returns {Promise<boolean>}
 */
function confirm(question, input, output) {
  output.write(question);
  return new Promise((done) => {
    const rl = createInterface({ input });
    let settled = false;
    const settle = (answer) => {
      if (settled) return;
      settled = true;
      rl.close();
      done(answer);
    };
    rl.once("line", (line) => settle(/^y(es)?$/i.test(line.trim())));
    rl.once("close", () => settle(false));
  });
}

/**
 * §19.10 — a project with no `template:` line has nothing to update from, and
 * nothing is guessed. The fix names the line to add; a `unify.template.json`
 * left by 0.11.2 to 0.11.4 gets its own line, composed from the source it recorded.
 * @param {string} projectRoot
 * @param {string} configShown
 */
function noRecord(projectRoot, configShown) {
  const fixes = [
    "add the line unify init writes: template: <source> — the built-in name, directory, git URL or npm package this project was scaffolded from",
    "or name the template now: unify update <source>, which records it",
  ];
  const legacy = join(projectRoot, "unify.template.json");
  if (existsSync(legacy)) {
    try {
      const { source } = JSON.parse(readFileSync(legacy, "utf8"));
      fixes.unshift(`unify.template.json is the 0.11.2–0.11.4 record: add  template: ${String(source)}  to ${configShown} and delete that file`);
    } catch {
      fixes.unshift("unify.template.json is the 0.11.2–0.11.4 record; its source is the template: line to add, then delete that file");
    }
  }
  return new UsageError(`no template recorded in ${configShown}: this project has nothing to update from`, fixes);
}

/**
 * A content hash, with one normalization: `unify.yaml`'s own `template:` line
 * is unify's, not the template's or the site's, so it never counts as a
 * difference — nor does the commented `# template:` line it took the place of
 * in the file init writes.
 * @param {string} abs - the file's place in the project (its name decides)
 * @param {Uint8Array|string} content
 */
function hashOf(abs, content) {
  let bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  if (basename(abs) === "unify.yaml") {
    bytes = Buffer.from(bytes.toString("utf8").split(/\r?\n/).filter((line) => !/^#?\s*template:/.test(line)).join("\n"), "utf8");
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
