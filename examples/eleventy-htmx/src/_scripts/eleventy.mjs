// _scripts/eleventy.mjs — the whole Eleventy adapter, run by unify as
//
//     unify build -s src -o dist --generate _scripts/eleventy.mjs
//
// unify runs this file itself, once, before it scans the source tree. The contract is
// three arguments and a working directory (conformance-spec §33.2) — argv[2] is the
// absolute source root, argv[3] is the absolute overlay directory unify made for this one
// build, argv[4] is the absolute path to a read-only generator-context.json snapshot of
// unify's own effective settings, and cwd is the source root. There is nothing to import
// from unify, no object passed in, and no return value read.
//
// Everything written into the overlay joins the build as ordinary source: composed into
// src/_layout.html by the normal discovery walk, reference-checked, collision-checked
// against the authored tree, and published inside the same transaction. unify knows
// nothing about Eleventy, and Eleventy knows nothing about unify.
//
// There is no try/catch, and that is deliberate. If Eleventy throws, the top-level await
// rejects, the process exits non-zero with Eleventy's own message on stderr, and unify
// reports problem P29 located at this file — quoting that message and leaving the previous
// dist/ untouched. Catching it could only make the report less specific.

import Eleventy from "@11ty/eleventy";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// P29's second fix line is "run it directly to see its full output", so this file has to
// be runnable with no arguments — otherwise following that advice dies on argv[3] with a
// TypeError about paths[0] that has nothing to do with the bug being diagnosed. Under
// unify both arguments are always supplied and these defaults never apply. The standalone
// fallback is a temporary directory rather than somewhere under src/, so the rule that
// Eleventy never writes into the source tree holds on every path through this file.
const sourceRoot = process.argv[2] ?? process.cwd();
const generatedDir = process.argv[3] ?? mkdtempSync(join(tmpdir(), "eleventy-preview-"));
if (!process.argv[3]) console.log(`standalone run: writing a preview overlay into ${generatedDir}`);

// argv[4] is generator-context.json — a versioned snapshot of the same effective settings
// unify's own build is about to apply, read once, straight off disk, with no import from
// unify. The `?.` guards any run with no fourth argument: the standalone run above, and
// unify releases before 0.9.0 (this example's package.json pins one until 0.9.0 is
// published), which predate the context file. Under unify 0.9.0+ argv[4] is always
// supplied and the guard never fires.
const context = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], "utf8")) : null;

// cwd is the source root (§33.2), so this is the same file Eleventy's data
// cascade reads as `site`.
const site = JSON.parse(readFileSync("_data/site.json", "utf8"));

// The four views both paginations run over: the "all" view, then one per topic declared in
// site.json. Adding a topic there adds a page and a fragment, with no edit here.
const views = [
  { slug: "all", label: "All releases", blurb: "Every Redpoll release, newest first." },
  ...site.topics,
];

// "." — Eleventy's input directory must be RELATIVE to the working directory. An absolute
// path still honours every permalink, computed or static, but it silently stops directory
// data files (<dir>/<dir>.json and friends) from resolving — which is exactly what makes
// that mistake hard to spot: nothing errors, and every template that needs no directory
// data keeps working.
// generatedDir — Eleventy writes straight into unify's overlay. Nothing is written into
// the source tree, so `unify audit` stays read-only and a failed build leaves no debris.
const eleventy = new Eleventy(".", generatedDir, {
  // markdownTemplateEngine and keys.layout have no UserConfig setter and can only be set
  // from a config *file*. It lives under _11ty/ so it never ships, and is named by an
  // absolute path because Eleventy's auto-discovery would look in cwd — the source root,
  // where an eleventy.config.mjs would ship into dist/.
  configPath: join(sourceRoot, "_11ty", "eleventy.config.mjs"),
  config(cfg) {
    // Defensive, and a no-op in this tree as it stands: there is no src/.gitignore, so
    // removing this line changes nothing today. Put one there — or move the example's own
    // .gitignore inside src/ — and every collection empties silently: no error, and an
    // empty release list on every page. Cheaper to keep than to rediscover.
    cfg.setUseGitIgnore(false);
    // Markdown (the release notes, read as data) and Eleventy's own .11ty.js templates,
    // and nothing else. Eleventy's default formats include `html`, so without this line
    // the authored .html pages are entered into the template set as well — belt-and-braces
    // on top of the global `permalink: false` below, which is what actually keeps them
    // unwritten. Removing this line produces a byte-identical overlay; it is here so the
    // two tools stay separated by configuration rather than by one setting's side effect.
    cfg.setTemplateFormats(["md", "11ty.js"]);
    // The release notes belong to unify: Eleventy reads them into the collection and
    // writes none of them. The three templates opt back in with their own permalink.
    cfg.addGlobalData("permalink", false);
    cfg.addGlobalData("views", views);
    // The site's own base URL, exactly as unify is about to publish it — null when
    // --base-url is absent. view-page.11ty.js uses it to render an absolute og:url; with
    // no --base-url the meta tag is omitted rather than pointing at a relative address.
    cfg.addGlobalData("baseUrl", context?.site.baseUrl ?? null);
    // One collection, newest first. notes/*.md is the only data source in the example.
    cfg.addCollection("releases", (api) =>
      [...api.getFilteredByGlob("notes/*.md")].sort((a, b) => b.date - a.date));
  },
});

await eleventy.write();
