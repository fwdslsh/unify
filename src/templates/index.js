/**
 * The template registry — `unify init [template]` (conformance-spec §19).
 *
 * Every template is a plain object mapping a source-root-relative path to
 * its file content — **a string or raw bytes** (§19.5) — built entirely
 * from data reachable by static `import` from src/cli.js. The two files
 * that land at the *project* root rather than the source root (§19.4's
 * AGENTS.md and DEPLOY.md) are deliberately not here: they are the same for
 * every template and every key of these maps is source-root-relative, so
 * they live in src/templates/shared.js's `ROOT_FILES` and `init` writes
 * them beside whichever template was chosen. That is what "compiled into
 * the binary" means in
 * practice: `bun build --compile` bundles by tracing imports, not by reading
 * the filesystem at run time, and a compiled single-file executable has no
 * real sibling files on disk to read — so nothing under this directory does
 * `fs.readFileSync(new URL(..., import.meta.url))` or any other filesystem
 * lookup relative to its own module location. See src/cli/commands/init.js
 * for the one place these maps are turned into files on disk, and its
 * docstring for how this was verified against an actual `--compile` build.
 */
import { TEMPLATE_BASE_FILES } from "./shared.js";
import { files as basic } from "./basic.js";
import { files as blog } from "./blog.js";
import { files as defaultTemplate } from "./default.js";
import { files as docs } from "./docs.js";
import { files as portfolio } from "./portfolio.js";

/**
 * §19.2 requires the share image (item 4) and `robots.txt` (item 5) of
 * EVERY template, and neither takes anything from the template that ships
 * it. Merging them here makes that structural rather than five separate
 * acts of remembering — §19.3's whole finding is that when each template
 * was written separately, each shipped its own gaps. The template's own
 * keys are applied second and win, so a template that wants a different
 * `robots.txt` writes one and nothing is taken away.
 *
 * The map's SHAPE is unchanged by this: a value is still one template's
 * complete `{source-root-relative path: content}` map — what a test reads
 * from `TEMPLATES[name]` is exactly what `init` writes into the source root
 * — and `content` is a string OR raw bytes (§19.5; the share image is the
 * one binary).
 *
 * @param {Record<string, string|Uint8Array>} files
 * @returns {Record<string, string|Uint8Array>}
 */
function template(files) {
  return { ...TEMPLATE_BASE_FILES, ...files };
}

/**
 * @type {Record<string, Record<string, string|Uint8Array>>}
 * Key order is the order `unify --help`-style listings should offer them in.
 */
export const TEMPLATES = {
  default: template(defaultTemplate),
  basic: template(basic),
  blog: template(blog),
  docs: template(docs),
  portfolio: template(portfolio),
};
