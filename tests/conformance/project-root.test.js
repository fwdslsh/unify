/**
 * §4.5 — the project root as the last root of the resolution namespace.
 * INC-14 (includes), LAY-17 (layouts).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4). Every tree
 * here puts content in `site/` and build material beside it, which is the
 * repository shape the rule exists for.
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const page = (title, body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} page."></head><body>${body}</body></html>\n`;
const layout = (label, body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· ${label}</title></head><body>${body}<main><slot></slot></main></body></html>\n`;

function expectExit(r, code, what) {
  if (r.exit !== code) throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
}

// ------------------------------------------------------------------- INC-14

test("INC-14 — an include beside package.json resolves, relative paths inside it count from its own place, and it never publishes", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "includes/nav.html": '<nav>root nav</nav><include src="./icons.html"></include>',
    "includes/icons.html": "<span>icons</span>",
    "README.md": "# Not a page\n",
    "unify.yaml": "source: site\n",
  });
  writeTree(join(tmp, "site"), {
    "index.html": page("Home", '<include src="/includes/nav.html"></include><h1>Home</h1>'),
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 0, "an include resolved from the project root");
  const html = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!html.includes("root nav")) throw new Error("the project-root fragment was spliced");
  if (!html.includes("<span>icons</span>")) throw new Error("a relative include inside a project-root fragment resolves from that fragment");
  const dist = readdirSync(join(tmp, "dist"));
  if (dist.includes("includes") || dist.includes("README.html") || dist.includes("README.md") || dist.includes("unify.yaml")) {
    throw new Error(`nothing at the project root publishes: ${dist.join(", ")}`);
  }
  covers("INC-14");
}, TEST_MS);

test("INC-14 — the source tree wins a tie, and a path no root holds is still include-not-found", async () => {
  const tmp = mkTmp();
  writeTree(tmp, { "includes/nav.html": "<nav>root nav</nav>", "unify.yaml": "source: site\n" });
  writeTree(join(tmp, "site"), {
    "includes/nav.html": "<nav>site nav</nav>",
    "index.html": page("Home", '<include src="/includes/nav.html"></include><h1>Home</h1>'),
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 0, "both trees hold the include");
  const html = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!html.includes("site nav") || html.includes("root nav")) throw new Error("the source tree's file must win");

  writeTree(join(tmp, "site"), { "index.html": page("Home", '<include src="/includes/missing.html"></include><h1>Home</h1>') });
  const missing = await runCli(["build", "-o", "dist"], tmp);
  expectExit(missing, 1, "an include no root holds");
  if (!/include not found/.test(missing.stdout + missing.stderr)) throw new Error(`the ordinary not-found shape:\n${missing.stderr}`);
  covers("INC-14");
}, TEST_MS);

// ------------------------------------------------------------------- LAY-17

test("LAY-17 — a _layout.html beside package.json is the root layout when the source tree has none; the source tree's wins otherwise", async () => {
  const tmp = mkTmp();
  writeTree(tmp, { "_layout.html": layout("Root", "<p>root chrome</p>"), "unify.yaml": "source: site\n" });
  writeTree(join(tmp, "site"), {
    "index.html": page("Home", "<h1>Home</h1>"),
    "blog/post.html": page("Post", "<h1>Post</h1>"),
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 0, "a project-root layout");
  for (const f of ["index.html", "blog/post.html"]) {
    const html = readFileSync(join(tmp, "dist", f), "utf8");
    if (!html.includes("root chrome") || !html.includes("· Root")) throw new Error(`${f} did not get the project-root layout`);
  }
  if (existsSync(join(tmp, "dist", "_layout.html"))) throw new Error("a project-root layout never publishes");

  // A section layout in the source tree is nearer, and a root layout in the
  // source tree wins the tie at the top.
  writeTree(join(tmp, "site"), { "blog/_layout.html": layout("Blog", "<p>blog chrome</p>") });
  const r2 = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r2, 0, "nearest wins");
  if (!readFileSync(join(tmp, "dist", "blog/post.html"), "utf8").includes("blog chrome")) throw new Error("the nearer source layout wins for its section");
  if (!readFileSync(join(tmp, "dist", "index.html"), "utf8").includes("root chrome")) throw new Error("the project-root layout still serves the top");

  writeTree(join(tmp, "site"), { "_layout.html": layout("Site", "<p>site chrome</p>") });
  const r3 = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r3, 0, "source tree wins the tie");
  const home = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!home.includes("site chrome") || home.includes("root chrome")) throw new Error("the source tree's _layout.html must win");
  covers("LAY-17");
}, TEST_MS);

test("LAY-17 — an explicit layout path resolves from the project root, for HTML and Markdown pages", async () => {
  const tmp = mkTmp();
  writeTree(tmp, { "includes/base.html": layout("Base", "<p>base chrome</p>"), "unify.yaml": "source: site\n" });
  writeTree(join(tmp, "site"), {
    "index.html": page("Home", "<h1>Home</h1>").replace("<body>", '<body data-layout="/includes/base.html">'),
    "about.md": "---\ntitle: About\ndescription: About page.\nlayout: /includes/base.html\n---\n# About\n",
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 0, "explicit layouts at the project root");
  for (const f of ["index.html", "about.html"]) {
    if (!readFileSync(join(tmp, "dist", f), "utf8").includes("base chrome")) throw new Error(`${f} did not get /includes/base.html`);
  }
  covers("LAY-17");
}, TEST_MS);
