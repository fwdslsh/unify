/**
 * The template registry — `unify init [template]` (conformance-spec §19).
 *
 * Every template is a plain object mapping a source-root-relative path to
 * its file content (a string), built entirely from data reachable by static
 * `import` from src/cli.js. That is what "compiled into the binary" means in
 * practice: `bun build --compile` bundles by tracing imports, not by reading
 * the filesystem at run time, and a compiled single-file executable has no
 * real sibling files on disk to read — so nothing under this directory does
 * `fs.readFileSync(new URL(..., import.meta.url))` or any other filesystem
 * lookup relative to its own module location. See src/cli/commands/init.js
 * for the one place these maps are turned into files on disk, and its
 * docstring for how this was verified against an actual `--compile` build.
 */
import { files as basic } from "./basic.js";
import { files as blog } from "./blog.js";
import { files as defaultTemplate } from "./default.js";
import { files as docs } from "./docs.js";
import { files as portfolio } from "./portfolio.js";

/**
 * @type {Record<string, Record<string, string>>}
 * Key order is the order `unify --help`-style listings should offer them in.
 */
export const TEMPLATES = {
  default: defaultTemplate,
  basic,
  blog,
  docs,
  portfolio,
};
