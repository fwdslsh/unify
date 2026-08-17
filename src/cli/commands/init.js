/**
 * `unify init [template]` — offline scaffolding (conformance-spec §19).
 *
 * The v0.6 command fetched templates from a GitHub repository that did not
 * exist, so step one of the golden path failed with a network error before
 * anything else about the product could matter. The replacement makes that
 * class of failure structurally impossible: every template
 * (src/templates/*.js) is a plain object of `{relativePath: content}` string
 * data, reached from this file by an ordinary static `import` chain rooted
 * at src/cli.js. `bun build --compile` bundles a single-file executable by
 * tracing imports, not by reading the filesystem at run time — there is no
 * `fs.readFileSync` anywhere in src/templates/**, so there is nothing for a
 * compiled binary's lack of a real "next to the script" directory to break.
 * This was verified directly: `bun build --compile ./src/cli.js --outfile
 * /tmp/unify-bin` followed by running the compiled binary's `init` command
 * from an empty directory with no source checkout in reach (see the
 * implementation report for the transcript).
 *
 * Five templates, one primitive set each (SCF-01): one `<include>` (the
 * nav), the automatic `_layout.html`, one named slot with a fallback
 * (`footer`) plus one page that fills it, one `data-layout="none"` page
 * (`404.html`), and the underscore convention (`_includes/`, and `_scripts/`
 * for `blog`). `init` never writes `unify.yaml` — nothing here does.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { UsageError } from "../../core/diagnostics.js";
import { toRelative } from "../../core/paths.js";
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
 * @returns {Promise<number>}
 */
export async function init({ sourceRoot, sourceDefaulted, template, reporter }) {
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

  // §19 doesn't say what happens when the target already has files; the
  // conservative, spec-silent-safe default is to refuse rather than risk
  // clobbering something the author wrote (see the implementation report).
  const collisions = Object.keys(files)
    .map((relPath) => join(target, ...relPath.split("/")))
    .filter((absPath) => existsSync(absPath));

  if (collisions.length > 0) {
    throw new UsageError(
      `init refused: ${collisions.length} file(s) already exist in ${toRelative(process.cwd(), target) || "."}`,
      [
        `remove ${toRelative(process.cwd(), collisions[0])} (first of ${collisions.length}), or scaffold into an empty directory`,
      ],
    );
  }

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(target, ...relPath.split("/"));
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content);
  }

  const shown = toRelative(process.cwd(), target) || ".";
  reporter.summary(`scaffolded ${name} (${Object.keys(files).length} files) into ${shown}`);
  reporter.summary("next: unify dev");
  return 0;
}
