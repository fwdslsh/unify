/**
 * `unify init [template]` — offline scaffolding (conformance-spec §19).
 *
 * The previous implementation fetched templates from a GitHub repository
 * that did not exist, so step one of the golden path failed with a network
 * error before anything else about the product could matter. The replacement
 * makes that class of failure structurally impossible: every template
 * (src/templates/*.js) is a plain object of `{relativePath: content}` data,
 * reached from this file by an ordinary static `import` chain rooted at
 * src/cli.js. `bun build --compile` bundles a single-file executable by
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
 * unchanged by it: the bytes are a base64 literal in src/templates/shared.js
 * decoded at scaffold time, never a file read relative to `import.meta.url`.
 * `writeFileSync` takes a string or a `Uint8Array` and writes each verbatim,
 * so the two kinds of content need no branch here — only this paragraph.
 *
 * Five templates, one primitive set each (SCF-01): one `<include>` (the
 * nav), the automatic `_layout.html`, one named slot with a fallback
 * (`footer`) plus one page that fills it, one `data-layout="none"` page
 * (`404.html`), and the underscore convention (`_includes/`, and `_scripts/`
 * for `blog`). `init` never writes `unify.yaml` — nothing here does.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { UsageError } from "../../core/diagnostics.js";
import { contains, toRelative } from "../../core/paths.js";
import { ROOT_FILES } from "../../templates/shared.js";
import { TEMPLATES } from "../../templates/index.js";

const DEFAULT_TEMPLATE = "default";

/**
 * @param {object} context
 * @param {string} context.sourceRoot - resolved per the shared --source rule
 *   (src/cli.js): an explicit --source, else src/ if it exists, else cwd
 * @param {boolean} context.sourceDefaulted - true only when nothing chose the
 *   source root (no --source, no unify.yaml key, no src/) — the exact
 *   "fresh project" state this command exists to fix by creating src/
 * @param {string|undefined} context.template - the positional argument
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {string} [context.projectRoot] - §19.4's project root: **the working
 *   directory the command ran in**, which is where AGENTS.md and DEPLOY.md
 *   land. A parameter rather than a bare `process.cwd()` call for the same
 *   reason `resolveSource(flag, cwd)` and `cleanRefusalReason(out, src, cwd)`
 *   take one — a test may name a directory without moving the process into it
 * @returns {Promise<number>}
 */
export async function init({ sourceRoot, sourceDefaulted, template, reporter, projectRoot = process.cwd() }) {
  const name = template ?? DEFAULT_TEMPLATE;
  const files = TEMPLATES[name];
  if (!files) {
    throw new UsageError(`unknown template: ${name}`, [`choose one of: ${Object.keys(TEMPLATES).join(", ")}`]);
  }

  // An explicit --source (or an already-existing src/, which resolveSource
  // treats the same way) names the scaffold target directly, matching how
  // --source is read everywhere else. The defaulted case — nothing on the
  // command line or in unify.yaml, and no src/ yet — is exactly the "my-site/
  // with no src/" starting point product-spec §2 describes, and init's job
  // there is to create src/ under it, not to scaffold into the project root.
  const target = sourceDefaulted ? join(sourceRoot, "src") : sourceRoot;

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
  // is why they come from their own map (src/templates/shared.js's ROOT_FILES)
  // instead of a per-template key: every key of a template's map ships from
  // inside the source root, so spelling a project-root file there could only
  // mean an escape (`../`) out of the tree init was told to write into.

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
  if (contains(target, projectRoot)) {
    const same = resolve(target) === resolve(projectRoot);
    throw new UsageError(
      `init refused: the project root ${same ? "and the source root are the same directory" : "is inside the source root"}, ` +
        `so ${Object.keys(ROOT_FILES).join(" and ")} would publish as pages`,
      ["run unify init from the parent directory, or pass --source with a subdirectory such as --source src"],
    );
  }

  const writes = [
    ...Object.entries(files).map(([relPath, content]) => [join(target, ...relPath.split("/")), content]),
    ...Object.entries(ROOT_FILES).map(([relPath, content]) => [join(projectRoot, ...relPath.split("/")), content]),
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
  const blockedDirs = [];
  const checked = new Set();
  for (const [absPath] of writes) {
    // Up to the filesystem root, not just to the target: `--source src` where
    // `src` is itself a plain file is the same fault one level higher, and an
    // ancestor already checked has had its own ancestors checked with it, so
    // the Set makes the whole pass linear in the number of distinct directories.
    for (let dir = dirname(absPath); !checked.has(dir); dir = dirname(dir)) {
      checked.add(dir);
      if (existsSync(dir) && !statSync(dir).isDirectory()) blockedDirs.push(dir);
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

  const shown = toRelative(projectRoot, target) || ".";
  const rootNames = Object.keys(ROOT_FILES);
  reporter.summary(
    `scaffolded ${name} (${writes.length} files): ${Object.keys(files).length} into ${shown}, ` +
      `${rootNames.join(" and ")} at the project root`,
  );
  reporter.summary("next: unify dev");
  return 0;
}
