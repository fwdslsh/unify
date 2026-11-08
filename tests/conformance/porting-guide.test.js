/**
 * `porting-guide.test.js` — every literal in `docs/guides/porting-an-existing-site.md`
 * (issue #156).
 *
 * The guide claims that every literal in it is tested, so, as in
 * `social-metadata.test.js` and `generator-recipes.test.js`, the literals are
 * EXTRACTED FROM THE DOCUMENT rather than retyped here: the table rows are
 * read out of the guide's own Markdown table, the mixed-site tree is built
 * from the tree listing's `file → address` arrows, the `--dry-run` lines are
 * the guide's own fenced block, and the URL check runs the guide's script
 * against a real `unify audit --format json` report. A row the engine stops
 * honouring fails here, in the sentence that promised it.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 60_000;
const DOC = readFileSync(join(ROOT, "docs", "guides", "porting-an-existing-site.md"), "utf8");

/** The `## heading` section's text, up to the next `## `. */
function section(heading) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`no section "${heading}" in the guide`);
  const end = DOC.indexOf("\n## ", start + 1);
  return DOC.slice(start, end < 0 ? DOC.length : end);
}
/** The nth fenced block (any language) in a section. */
function fence(heading, n) {
  const blocks = [...section(heading).matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (!blocks[n]) throw new Error(`section "${heading}" has no fenced block ${n}`);
  return blocks[n];
}
/** The guide's table, as rows of trimmed cells with the backticks removed. */
function tableRows(heading) {
  return section(heading)
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .map((l) => l.slice(1, -1).split("|").map((c) => c.trim().replace(/`/g, "")));
}

const page = (title) =>
  `<!doctype html>\n<html lang="en">\n<head><title>${title}</title><meta name="description" content="The ${title} page."></head>\n` +
  `<body><main><h1>${title}</h1></main></body>\n</html>\n`;
const md = (title) => `---\ntitle: ${title}\ndescription: The ${title} page.\n---\n\n# ${title}\n`;
const LAYOUT = '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>— Acme</title></head>\n<body><main><slot></slot></main></body>\n</html>\n';

/** `site/` holding every source file the guide's tree listing names (`file → address`). */
function mixedSite() {
  const tree = { "_layout.html": LAYOUT };
  for (const m of fence("A mixed site", 1).matchAll(/([\w./-]+\.(?:html|md))\s+→\s+(\S+)/g)) {
    const [, file] = m;
    if (file === "_layout.html") continue;
    tree[file] = file.endsWith(".md") ? md(file) : page(file);
  }
  return tree;
}
/** The dry-run report's `(address)` for each source file, from the report's own rows. */
function addresses(stdout) {
  const out = new Map();
  for (const m of stdout.matchAll(/^write dist\/\S+ \((\S+)\) ← (\S+)/gm)) out.set(m[2], m[1]);
  return out;
}

test("the rule's table: each live URL is answered by the source file the row names, in both builds", async () => {
  const rows = tableRows("The rule");
  if (rows.length !== 6) throw new Error(`expected the six table rows, found ${rows.length}`);
  for (const [url, plain, pretty] of rows) {
    for (const [flag, cell] of [[[], plain], [["--pretty-urls"], pretty]]) {
      // "none" cells and the "never both" collision are asserted below.
      const files = cell.split(/, or | or |, /).map((c) => c.trim()).filter((c) => /^[\w./-]+\.(html|md)$/.test(c));
      for (const file of files) {
        const tmp = mkTmp();
        const tree = { "_layout.html": LAYOUT, "index.html": page("Home") };
        tree[file] = file.endsWith(".md") ? md(file) : page(file);
        writeTree(join(tmp, "site"), tree);
        const r = await runCli(["build", "--dry-run", ...flag], tmp);
        if (r.exit !== 0) throw new Error(`${file} ${flag.join(" ")}:\n${r.stderr}`);
        const got = addresses(r.stdout).get(file);
        if (got !== url) throw new Error(`row "${url}" ${flag.join(" ") || "plain"}: ${file} publishes at ${got}, the guide says ${url}`);
      }
    }
  }
  // The "none" cells: under --pretty-urls no source file answers to a .html address.
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), { "_layout.html": LAYOUT, "index.html": page("Home"), "about.html": page("About") });
  const pretty = await runCli(["build", "--dry-run", "--pretty-urls"], tmp);
  if (addresses(pretty.stdout).get("about.html") !== "/about/") throw new Error(pretty.stdout);
  // "never both": about.html and about/index.html collide under the flag.
  const both = mkTmp();
  writeTree(join(both, "site"), { "_layout.html": LAYOUT, "index.html": page("Home"), "about.html": page("About"), "about/index.html": page("About 2") });
  const collide = await runCli(["build", "--dry-run", "--pretty-urls"], both);
  if (collide.exit !== 1 || !/about\/index\.html/.test(collide.stderr)) throw new Error(`expected a collision:\n${collide.stderr}`);
  covers("URL-05", "COL-01");
}, TEST_MS);

test("the mixed site: the tree listing's addresses are the dry-run's, and the quoted rows are printed verbatim", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), mixedSite());
  const r = await runCli(["build", "--dry-run"], tmp);
  if (r.exit !== 0) throw new Error(r.stderr);
  const got = addresses(r.stdout);
  for (const m of fence("A mixed site", 1).matchAll(/([\w./-]+\.(?:html|md))\s+→\s+(\S+)/g)) {
    const [, file, url] = m;
    if (file === "_layout.html") continue;
    if (got.get(file) !== url) throw new Error(`${file} publishes at ${got.get(file)}, the tree says ${url}`);
  }
  const listed = fence("A mixed site", 0).split(/\s+/).filter(Boolean).sort();
  const published = [...got.values()].sort();
  if (JSON.stringify(listed) !== JSON.stringify(published)) throw new Error(`live list ${listed} vs published ${published}`);
  for (const line of fence("A mixed site", 2).trimEnd().split("\n")) {
    if (!r.stdout.includes(line)) throw new Error(`dry-run row not printed verbatim:\n${line}\n--- got ---\n${r.stdout}`);
  }
  covers("DRY-01", "URL-05");
}, TEST_MS);

test("Markdown or HTML: blog/hello.md answers to the .html address plain and the directory address pretty", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), { "_layout.html": LAYOUT, "index.html": page("Home").replace("<h1>Home</h1>", '<h1>Home</h1><a href="blog/hello.md">md</a> <a href="blog/hello.html">html</a>'), "blog/hello.md": md("Hello") });
  const plain = await runCli(["build", "--dry-run"], tmp);
  if (plain.exit !== 0 || addresses(plain.stdout).get("blog/hello.md") !== "/blog/hello.html") throw new Error(plain.stdout + plain.stderr);
  const pretty = await runCli(["build", "--dry-run", "--pretty-urls"], tmp);
  if (pretty.exit !== 0 || addresses(pretty.stdout).get("blog/hello.md") !== "/blog/hello/") throw new Error(pretty.stdout + pretty.stderr);
  covers("MD-01", "URL-05");
}, TEST_MS);

test("check every live URL: the guide's script passes on the full list and names what a build does not publish", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), mixedSite());
  writeTree(join(tmp, "scripts"), { "check-urls.mjs": fence("Check every live URL", 0) });
  const sh = fence("Check every live URL", 1).trim().split("\n");
  // Line 1: `unify audit --format json --base-url https://acme.example/ > audit.json`
  const auditArgs = sh[0].split(" > ")[0].split(" ").slice(1);
  const base = auditArgs[auditArgs.indexOf("--base-url") + 1];
  const audit = await runCli(auditArgs, tmp);
  writeFileSync(join(tmp, "audit.json"), audit.stdout);
  const live = fence("A mixed site", 0).split(/\s+/).filter(Boolean).map((p) => new URL(p, base).href);
  writeFileSync(join(tmp, "urls.txt"), `${live.join("\n")}\n`);
  // Line 2: `node scripts/check-urls.mjs audit.json urls.txt`
  const [bin, ...args] = sh[1].split(" ");
  const ok = spawnSync(bin, args, { cwd: tmp, encoding: "utf8" });
  if (ok.status !== 0 || !ok.stdout.includes(`${live.length} of ${live.length} addresses published`)) throw new Error(ok.stdout + ok.stderr);
  writeFileSync(join(tmp, "urls.txt"), `${live.join("\n")}\n${base}old-page.html\n`);
  const missing = spawnSync(bin, args, { cwd: tmp, encoding: "utf8" });
  if (missing.status !== 1 || !missing.stdout.includes(`missing: ${base}old-page.html`)) throw new Error(missing.stdout + missing.stderr);
  covers("AUD-01");
}, TEST_MS);
