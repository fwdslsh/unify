/**
 * `unify init [template]` — offline scaffolding (conformance-spec §19).
 *
 * The previous implementation fetched templates from a GitHub repository
 * that did not exist, so step one of the golden path failed with a network
 * error before anything else about the product could matter. The replacement
 * makes that class of failure structurally impossible: every built-in
 * template is a plain object of `{relativePath: content}` data
 * (src/templates/snapshot.js, generated from the real project directories
 * under templates/<name>/ by scripts/sync-templates.mjs), reached from this
 * file by an ordinary static `import` chain rooted at src/cli.js. `bun build --compile` bundles a single-file executable by
 * tracing imports, not by reading the filesystem at run time — there is no
 * `fs.readFileSync` anywhere in src/templates/**, so there is nothing for a
 * compiled binary's lack of a real "next to the script" directory to break.
 * This was verified directly: `bun build --compile ./src/cli.js --outfile
 * /tmp/unify-bin` followed by running the compiled binary's `init` command
 * from an empty directory with no source checkout in reach (see the
 * implementation report for the transcript).
 *
 * §19.5 — **a file's content is a string OR raw bytes.** The one binary a
 * template ships is the share image whose real pixel dimensions §19.2 item
 * 4 makes it declare, and every raster format is binary; an SVG would have
 * kept the map textual and would not have done the job, because the social
 * crawlers `og:image` exists for do not render one. The constraint above is
 * unchanged by it: the bytes are a base64 literal in the snapshot module,
 * decoded at import time, never a file read relative to `import.meta.url`.
 * `writeFileSync` takes a string or a `Uint8Array` and writes each verbatim,
 * so the two kinds of content need no branch here — only this paragraph.
 *
 * Five templates, one primitive set each (SCF-01): one `<include>` (the
 * nav), the automatic `_layout.html`, one named slot with a fallback
 * (`footer`) plus one page that fills it, one `data-layout="none"` page
 * (`404.html`), and the underscore convention (`_includes/`, and `_scripts/`
 * for `blog`). The one line `init` writes into `unify.yaml` of its own is
 * `template:` — the record §19.10 describes.
 *
 * §19.9 — the positional may also name a template OUTSIDE the registry: a
 * directory, a git repository, or an npm package (src/cli/template-source.js
 * tells the forms apart and fetches them). Whatever the source, it arrives
 * here as the same two `{relativePath: content}` maps a built-in is, so the
 * refusals below — "writes nothing" over files and implied directories,
 * §19.4's project-root collision — hold for every source through one code
 * path. An external template ships what it ships: `ROOT_FILES` is the
 * registry's, not a floor every template is raised to.
 *
 * `--audit` (§19.9) gates the scaffold the way `build --audit` gates a
 * publish: once the files are on disk, `unify audit --strict` runs over the
 * new project, with its own `unify.yaml`, and a finding or a problem removes
 * everything this command wrote — exit 1, the audit's own code, and the
 * report says why. §19.3 promises every built-in passes that gate; the flag
 * is how an author holds a template somebody else wrote to the same bar.
 */

import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Reporter, UsageError } from "../../core/diagnostics.js";
import { contains, toRelative } from "../../core/paths.js";
import { TEMPLATES } from "../../templates/index.js";
import { configPath, configTemplate } from "../options.js";
import { saveEntries, writeConfig } from "../save-config.js";
import { resolveSettings } from "../settings.js";
import { classifyTemplateSource, fetchTemplate, pinSource } from "../template-source.js";

const DEFAULT_TEMPLATE = "default";

/**
 * @param {object} context
 * @param {string} context.sourceRoot - resolved per the shared --source rule
 *   (src/cli.js): an explicit --source, else src/ if it exists, else cwd
 * @param {boolean} context.sourceDefaulted - true only when nothing chose the
 *   source root (no --source, no unify.yaml key, no src/) — the exact
 *   "fresh project" state this command exists to fix by creating src/
 * @param {string|undefined} context.template - the positional argument: a
 *   built-in name, a directory, a git URL, or `npm:<spec>` (§19.9)
 * @param {boolean} [context.audit] - §19.9's `--audit`: scaffold only if the
 *   result passes `unify audit --strict`
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {string} [context.projectRoot] - §19.4's project root: **the working
 *   directory the command ran in**, which is where AGENTS.md and DEPLOY.md
 *   land. A parameter rather than a bare `process.cwd()` call for the same
 *   reason `resolveSource(flag, cwd)` and `cleanRefusalReason(out, src, cwd)`
 *   take one — a test may name a directory without moving the process into it
 * @returns {Promise<number>}
 */
export async function init({ sourceRoot, sourceDefaulted, template, reporter, audit = false, projectRoot = process.cwd() }) {
  // §19.9 — four forms, told apart by shape (template-source.js). A built-in
  // name wins over a directory of the same name in the working directory:
  // `unify init blog` means the registry's blog, and `./blog` names the
  // directory.
  const label = template ?? DEFAULT_TEMPLATE;
  const source = classifyTemplateSource(label, Object.keys(TEMPLATES), projectRoot);
  // §19.4/§19.6/§19.8 — a built-in's source tree and project-root files
  // (AGENTS.md, DEPLOY.md, the all-commented unify.yaml, the blog's
  // scripts/gen.mjs) come from the registry; every other source is fetched
  // and read into the same two maps (§19.9).
  const fetched = await fetchTemplate(source, label);
  const { files, rootFiles } = fetched;

  // An explicit --source (or an already-existing site/ or src/, which
  // resolveSource treats the same way) names the scaffold target directly,
  // matching how --source is read everywhere else. The defaulted case —
  // nothing on the command line or in unify.yaml, and no site/ yet — is
  // exactly the "my-site/ with no site/" starting point product-spec §2
  // describes, and init's job there is to create site/ under it, not to
  // scaffold into the project root.
  const target = sourceDefaulted ? join(sourceRoot, "site") : sourceRoot;

  // §19.4 — two files scaffold at the PROJECT ROOT, deliberately outside the
  // source root so that neither can publish: AGENTS.md (product-spec §6.7's
  // repository-local guidance) and DEPLOY.md (the deployment recipe §19.2's
  // items 4 and 7 both defer to). "Project root" has one answer and it is not
  // a guess: the working directory the command ran in. In the fresh-project
  // case that directory *is* the project root and `src/` is created beneath
  // it, so the two land side by side; where --source names a directory
  // explicitly, unify does not infer a project root from it, because walking
  // to a parent would write outside the tree the author named — the one thing
  // a scaffolding command must never do. They land where the author was
  // standing, which is a place they chose.
  //
  // They are the only writes whose paths are NOT source-root-relative, which
  // is why they come from their own map (TEMPLATE_ROOT_FILES, or a template's
  // own files beside its site/) instead of a key of the source map: every key
  // of that map ships from inside the source root, so spelling a project-root
  // file there could only mean an escape (`../`) out of the tree init was told
  // to write into.

  // §19.4, second half — **where the two coincide, `init` refuses rather than
  // scaffold.** When the working directory IS the source root (`--source .`),
  // or sits inside it (`--source ..` from a subdirectory), the placement rule
  // above and its "neither can publish" property cannot both hold: the pair
  // lands in the tree the build scans, carries no underscore (§4.2) and is not
  // on §4.3's never-shipped list, so both compose as Markdown pages and
  // publish — and `unify audit --strict` then reports description-missing and
  // page-orphan on two files unify itself wrote, breaking §19.3's second
  // guarantee on a scaffold the author has not touched. Refusing is the one
  // repair a scaffolding command actually has: inferring a parent is what
  // §19.4 rules out, renaming defeats the files' purpose, and §4.3 is literal
  // and would make AGENTS.md unpublishable on every site. This is `init`'s
  // rule alone — `unify build --source .` on a tree the author arranged that
  // way is untouched.
  //
  // §19.9 — the rule is about the project-root files, so a template that has
  // none (a bare source tree) has nothing to refuse over.
  const rootNames = Object.keys(rootFiles);
  if (rootNames.length > 0 && contains(target, projectRoot)) {
    const same = resolve(target) === resolve(projectRoot);
    const named = rootNames.slice(0, 2).join(" and ") + (rootNames.length > 2 ? ` (and ${rootNames.length - 2} more)` : "");
    throw new UsageError(
      `init refused: the project root ${same ? "and the source root are the same directory" : "is inside the source root"}, ` +
        `so ${named} would land inside the site and publish`,
      ["run unify init from the parent directory, or pass --source with a subdirectory such as --source site"],
    );
  }

  const writes = [
    ...Object.entries(files).map(([relPath, content]) => [join(target, ...relPath.split("/")), content]),
    ...Object.entries(rootFiles).map(([relPath, content]) => [join(projectRoot, ...relPath.split("/")), content]),
  ];

  // §19 doesn't say what happens when the target already has files; the
  // conservative, spec-silent-safe default is to refuse rather than risk
  // clobbering something the author wrote (see the implementation report).
  // §19.4 puts the project-root pair under the same refusal: an AGENTS.md the
  // author already wrote is exactly the file this must not overwrite.
  const collisions = writes.map(([absPath]) => absPath).filter((absPath) => existsSync(absPath));

  // "Writes nothing" has to cover the directories the writes IMPLY, not only
  // the leaf paths. A plain file sitting where a template needs a directory
  // (`src/posts` as a file, in the blog template) passed the leaf check, and
  // the loop below then died at `mkdirSync` with Node's own EEXIST/ENOTDIR —
  // after nine files had already landed, leaving a half-written scaffold that
  // the leaf check itself then refused to complete on every later run. One
  // pre-write pass over the ancestors restores the sentence, in the same
  // message shape, and CLAUDE.md's bar for an error path: located, and naming
  // a fix.
  //
  // The same pass records which directories do NOT exist yet: those are the
  // ones `--audit`'s rollback may remove, and the only ones — a directory
  // that was there before init ran is the author's, whatever is left in it.
  const blockedDirs = [];
  const createdDirs = [];
  const checked = new Set();
  for (const [absPath] of writes) {
    // Up to the filesystem root, not just to the target: `--source src` where
    // `src` is itself a plain file is the same fault one level higher, and an
    // ancestor already checked has had its own ancestors checked with it, so
    // the Set makes the whole pass linear in the number of distinct directories.
    for (let dir = dirname(absPath); !checked.has(dir); dir = dirname(dir)) {
      checked.add(dir);
      if (!existsSync(dir)) createdDirs.push(dir);
      else if (!statSync(dir).isDirectory()) blockedDirs.push(dir);
      if (dirname(dir) === dir) break;
    }
  }

  if (blockedDirs.length > 0) {
    const named = [...new Set(blockedDirs.map((absPath) => toRelative(projectRoot, absPath) || absPath))].sort();
    throw new UsageError(
      `init refused: ${named.length} path(s) the template needs as a directory already exist as files: ${named.join(", ")}`,
      [`remove ${named[0]}, or scaffold into an empty directory`],
    );
  }

  if (collisions.length > 0) {
    // Name the files, not a directory. Since §19.4 the write set spans TWO
    // directories — the source root and the project root — so "already exist
    // in <source root>" was a false sentence for exactly the collision that
    // section added: an author's own AGENTS.md, which is not in the source
    // root at all. §14.1's wording is prose; where a diagnostic points is not.
    const named = collisions.map((absPath) => toRelative(projectRoot, absPath) || absPath).sort();
    const listed = named.slice(0, 3).join(", ") + (named.length > 3 ? `, and ${named.length - 3} more` : "");
    throw new UsageError(`init refused: ${named.length} file(s) already exist: ${listed}`, [
      `remove ${named[0]}, or scaffold into an empty directory`,
    ]);
  }

  for (const [absPath, content] of writes) {
    mkdirSync(dirname(absPath), { recursive: true });
    // A string is written as UTF-8, a Uint8Array verbatim (§19.5).
    writeFileSync(absPath, content);
  }

  // §19.10 — the record: ONE line in unify.yaml, `template: <source>` pinned
  // to the version just fetched, which `unify update` fetches again as its
  // baseline. The file is the template's own copy when it shipped one (just
  // written above), else the project's existing one, else a fresh
  // all-commented file at the project root — in every case the file §18
  // says unify.yaml is, upserted the way `--save-config` upserts. Its prior
  // bytes are kept so the audit gate below can put them back.
  const { path: configFile } = configPath(target, projectRoot);
  const priorConfig = existsSync(configFile) ? readFileSync(configFile) : null;
  if (priorConfig === null) writeFileSync(configFile, configTemplate());
  const pinned = pinSource(source, fetched.revision, label, dirname(configFile));
  writeConfig(configFile, saveEntries({ template: pinned }));
  const restoreConfig = () => (priorConfig === null ? rmSync(configFile, { force: true }) : writeFileSync(configFile, priorConfig));

  const shown = toRelative(projectRoot, target) || ".";
  const atRoot = rootNames.length === 0 ? "" : `, ${rootNames.length === 2 ? rootNames.join(" and ") : rootNames.join(", ")} at the project root`;
  reporter.summary(`scaffolded ${label} (${writes.length} files): ${Object.keys(files).length} into ${shown}${atRoot}`);
  reporter.summary(`recorded template: ${pinned} in ${toRelative(projectRoot, configFile) || "unify.yaml"} — unify update brings in its later versions`);

  if (audit) {
    // §19.9 — the gate. The project is resolved exactly as a later `unify
    // audit --strict` run from the project root would resolve it: its own
    // unify.yaml (the blog's `generate:`, the docs template's `catalog:
    // true`) read from the source root else the project root, every relative
    // path in it against the file. Nothing from this command's own flags
    // carries over but --strict, which §19.3's guarantee is stated under.
    const { settings } = resolveSettings({ command: "audit", source: target, strict: true }, projectRoot);
    const auditReporter = new Reporter({ strict: true, stderr: reporter.stderr, stdout: reporter.stdout });
    const context = {
      sourceRoot: target, output: resolve(projectRoot, settings.output), settings,
      reporter: auditReporter, sourceDefaulted: false, command: "audit",
    };
    let code;
    try {
      code = await (await import("./audit.js")).audit(context);
    } catch (error) {
      restoreConfig();
      rollback(writes, createdDirs);
      throw error;
    }
    if (code !== 0) {
      restoreConfig();
      rollback(writes, createdDirs);
      reporter.summary(`--audit: ${label} did not audit clean, so nothing was scaffolded`);
      return code;
    }
  }

  reporter.summary("next: unify dev");
  return 0;
}

/**
 * §19.9 — undo a scaffold the audit gate rejected: every file this run
 * wrote (unify.yaml's prior bytes are restored by the caller first), then
 * every directory it created, deepest first and only while empty.
 * A directory that existed before init ran is never touched, and a file the
 * audit left behind inside a created one (there is none — audit writes
 * nothing — but the rule is stated, not assumed) keeps its directory.
 * @param {Array<[string, unknown]>} writes
 * @param {string[]} createdDirs
 */
function rollback(writes, createdDirs) {
  for (const [absPath] of writes) rmSync(absPath, { force: true });
  for (const dir of [...createdDirs].sort((a, b) => b.length - a.length)) {
    try {
      rmdirSync(dir);
    } catch {
      // not empty, or already gone with its parent — either way it stays
    }
  }
}
