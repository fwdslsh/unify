// _scripts/eleventy.mjs — the whole Eleventy adapter, run by unify as
//
//     unify build -s src -o dist --generate _scripts/eleventy.mjs
//
// unify runs this file itself, once, before it scans the source tree. The contract is two
// arguments and a working directory (conformance-spec §33.2) — argv[2] is the absolute
// source root, argv[3] is the absolute overlay directory unify made for this one build,
// and cwd is the source root. There is nothing to import from unify, no object passed in,
// and no return value read.
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
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir] = process.argv;

// cwd is the source root (§33.2), so this is the same file Eleventy's data
// cascade reads as `site`.
const site = JSON.parse(readFileSync("_data/site.json", "utf8"));

// The four views both paginations run over: the "all" view, then one per topic declared in
// site.json. Adding a topic there adds a page and a fragment, with no edit here.
const views = [
  { slug: "all", label: "All releases", blurb: "Every Redpoll release, newest first." },
  ...site.topics,
];

// "." — Eleventy's input directory must be RELATIVE to cwd. An absolute path silently
// disables directory data files and permalinks rather than erroring.
// generatedDir — Eleventy writes straight into unify's overlay. Nothing is written into
// the source tree, so `unify audit` stays read-only and a failed build leaves no debris.
const eleventy = new Eleventy(".", generatedDir, {
  // markdownTemplateEngine and keys.layout have no UserConfig setter and can only be set
  // from a config *file*. It lives under _11ty/ so it never ships, and is named by an
  // absolute path because Eleventy's auto-discovery would look in cwd — the source root,
  // where an eleventy.config.mjs would ship into dist/.
  configPath: join(sourceRoot, "_11ty", "eleventy.config.mjs"),
  config(cfg) {
    // A .gitignore at the source root would otherwise empty every collection.
    cfg.setUseGitIgnore(false);
    // Markdown (the release notes, read as data) and Eleventy's own .11ty.js templates,
    // and nothing else. Without this Eleventy also claims the authored .html pages and
    // rewrites them on top of the source tree.
    cfg.setTemplateFormats(["md", "11ty.js"]);
    // The release notes belong to unify: Eleventy reads them into the collection and
    // writes none of them. The three templates opt back in with their own permalink.
    cfg.addGlobalData("permalink", false);
    cfg.addGlobalData("views", views);
    // One collection, newest first. notes/*.md is the only data source in the example.
    cfg.addCollection("releases", (api) =>
      [...api.getFilteredByGlob("notes/*.md")].sort((a, b) => b.date - a.date));
  },
});

await eleventy.write();
