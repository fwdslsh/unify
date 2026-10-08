/**
 * §34 — `extends`: building on a template without copying it.
 * EXT-01 … EXT-07.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4). The git
 * source is a real bare repository reached over file://, cloned by the
 * author's own git, exactly as §19.9 fetches it; nothing reaches the network.
 * Every run that could fetch gets its own XDG_CACHE_HOME, so the user's cache
 * is never read or written.
 */
import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 60_000;

const page = (title, body, head = "") =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} page.">${head}</head><body>${body}</body></html>\n`;
const md = (title, body) => `---\ntitle: ${title}\ndescription: ${title} page.\n---\n# ${title}\n\n${body}\n`;

/** A template laid out the way init lays one out (§19.4): site/ beside the files the build must never read. */
const TEMPLATE = {
  "site/_layout.html":
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· Tpl</title><link rel="stylesheet" href="/assets/style.css"></head>' +
    '<body><include src="/_includes/nav.html"></include><main><slot></slot></main><footer>template footer</footer></body></html>\n',
  "site/_includes/nav.html": '<nav>template nav <a href="/index.html">home</a> <a href="/about.html">about</a></nav>\n',
  "site/assets/style.css": "@import url(\"theme.css\");\nbody { margin: 0; }\n",
  "site/assets/theme.css": ":root { --accent: teal; }\n",
  "site/index.html": page("Template home", "<h1>Template home</h1>"),
  "site/about.html": page("About", "<h1>About</h1><p>from the template</p>"),
  "site/_examples/post.md": md("Example", "never published"),
  // Never read by a build that extends this template (§34.1).
  "unify.yaml": "pretty-urls: true\ngenerate: scripts/gen.mjs\n",
  "scripts/gen.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync(process.argv[3] + "/generated.html", "<!doctype html><title>g</title><h1>g</h1>");\n',
  "README.md": "# The template\n",
};

/** The site: Markdown under docs/, with three files of its own that replace the template's. */
const SITE = {
  "docs/index.md": md("Home", "Read [the guide](guide/start.html#next) or [about](about.html)."),
  "docs/guide/start.md": md("Start", "Back [home](../index.html).\n\n## Next\n\nDone."),
  "docs/_includes/nav.html": '<nav>site nav <a href="/index.html">home</a> <a href="/guide/start.html">start</a> <a href="/about.html">about</a></nav>\n',
  "docs/assets/theme.css": ":root { --accent: rebeccapurple; }\n",
};

function expectExit(r, code, what) {
  if (r.exit !== code) throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
}
const read = (...p) => readFileSync(join(...p), "utf8");

/** The author's own tool, run as §19.9 runs it. @returns {string} stdout */
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A bare repository holding a template (TEMPLATE unless named), and the commit it is at. */
function templateRepo(files = TEMPLATE) {
  const work = mkTmp();
  writeTree(work, files);
  git(work, "init", "-q", "-b", "main");
  git(work, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-A");
  git(work, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "template");
  const sha = git(work, "rev-parse", "HEAD");
  const bare = `${work}.git`;
  git(work, "clone", "-q", "--bare", work, bare);
  return { bare, sha };
}

// ------------------------------------------------------------- EXT-01/03/02

test("EXT-01/EXT-03 — a directory template sits beneath the site: its layout, includes, assets and pages fill the gaps, and the site's own files win", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "tpl"), TEMPLATE);
  // The saved key is relative to unify.yaml's directory.
  writeTree(join(tmp, "proj"), { ...SITE, "unify.yaml": "source: docs\nextends: ../tpl\n" });
  const proj = join(tmp, "proj");

  const r = await runCli(["build", "--strict"], proj);
  expectExit(r, 0, "a site extending a directory template");
  const index = read(proj, "dist", "index.html");
  // The site's index.md replaced the template's index.html (same output path).
  if (!index.includes("<h1 id=\"home\">Home</h1>") && !index.includes(">Home</h1>")) throw new Error(`index.md is the home page:\n${index}`);
  if (index.includes("Template home")) throw new Error("the template's index.html must be left out");
  // The template's layout wraps the site's page; the site's nav replaces the template's.
  if (!index.includes("template footer")) throw new Error("the template's _layout.html wraps the site's pages");
  if (!index.includes("site nav") || index.includes("template nav")) throw new Error("the site's _includes/nav.html wins");
  // A template page the site has nothing at publishes, composed with the same layout and nav.
  const about = read(proj, "dist", "about.html");
  if (!about.includes("from the template") || !about.includes("site nav")) throw new Error(`the template's about.html publishes with the site's nav:\n${about}`);
  // Assets: the template's stylesheet, the site's theme.
  if (!read(proj, "dist", "assets", "style.css").includes("margin: 0")) throw new Error("the template's stylesheet publishes");
  if (!read(proj, "dist", "assets", "theme.css").includes("rebeccapurple")) throw new Error("the site's theme.css wins");
  // Nested Markdown with relative links and anchors resolves as anywhere else.
  if (!index.includes('href="/guide/start.html#next"') && !index.includes('href="guide/start.html#next"')) throw new Error(`the nested link and anchor survive:\n${index}`);
  // Nothing outside the template's source tree reaches the output: no _examples, no README, no generator output,
  // and the template's own pretty-urls: true was not adopted.
  const top = readdirSync(join(proj, "dist")).sort();
  for (const name of ["_examples", "README.html", "generated.html", "about"]) {
    if (top.includes(name)) throw new Error(`${name} must not be in dist/: ${top.join(", ")}`);
  }
  if (existsSync(join(proj, "dist", "guide", "start", "index.html"))) throw new Error("the template's unify.yaml must not be read");

  // The flag is relative to the working directory, and --exclude reaches template pages.
  const flag = await runCli(["build", "-s", "proj/docs", "-o", "proj/out", "--extends", "tpl", "--exclude", "_*", "--exclude", "about.html", "--strict"], tmp);
  expectExit(flag, 1, "the site links to about.html, which --exclude left out");
  if (!/about\.html does not resolve/.test(flag.stdout + flag.stderr)) throw new Error(`an excluded template page is absent like any excluded page:\n${flag.stdout}${flag.stderr}`);

  // --save-config writes a directory source relative to the file it saves into (here the source root's).
  writeFileSync(join(proj, "docs", "unify.yaml"), "# saved here\n");
  const saved = await runCli(["build", "-s", "proj/docs", "-o", "proj/out2", "--extends", "tpl", "--save-config"], tmp);
  expectExit(saved, 0, "--save-config with a directory --extends");
  if (!read(proj, "docs", "unify.yaml").includes("extends: ../../tpl\n")) throw new Error(`saved relative to the file:\n${read(proj, "docs", "unify.yaml")}`);
  const again = await runCli(["build", "-o", "out3", "--strict"], join(proj, "docs"));
  expectExit(again, 0, "the saved line, read from the file's own directory");
  covers("EXT-01", "EXT-03");
}, TEST_MS);

test("EXT-02 — only the template's source tree is read: its unify.yaml, generator and root files never reach the build, and template: is not extends", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "tpl"), TEMPLATE);
  writeTree(tmp, {
    "site/index.html": page("Home", '<h1>Home</h1><a href="/about.html">about</a>'),
    // A scaffold record names a template; no build reads it (§19.10), extends is a separate key.
    "unify.yaml": "extends: tpl\ntemplate: blog\n",
  });
  const r = await runCli(["build", "--dry-run", "--strict"], tmp);
  expectExit(r, 0, "a site extending a template that ships a generator and a unify.yaml");
  if (/generated/.test(r.stdout.replace(/generated \(--[a-z-]+\)/g, ""))) throw new Error(`the template's generator must not run:\n${r.stdout}`);
  if (/about\/index\.html/.test(r.stdout)) throw new Error(`the template's pretty-urls: true must not be adopted:\n${r.stdout}`);
  if (/blog|posts/.test(r.stdout)) throw new Error(`template: is the update record, never built:\n${r.stdout}`);
  if (/README/.test(r.stdout)) throw new Error(`root files are not template material:\n${r.stdout}`);
  covers("EXT-02");
}, TEST_MS);

// ------------------------------------------------------------------- EXT-04

test("EXT-04 — a template overlapping the source root or the output directory is a usage error; two template files at one output path are P12", async () => {
  const tmp = mkTmp();
  writeTree(tmp, { "site/index.html": page("Home", "<h1>Home</h1>"), "site/sub/x.html": page("X", "<h1>X</h1>") });
  for (const [what, args] of [
    ["inside the source root", ["--extends", "site/sub"]],
    ["holding the source root", ["--extends", "."]],
    ["holding the output directory", ["-o", "site2/out", "--extends", "site2"]],
  ]) {
    writeTree(tmp, { "site2/out/stale.txt": "x", "site2/a.txt": "a" });
    const r = await runCli(["build", ...args], tmp);
    expectExit(r, 2, `a template ${what}`);
    if (!/extends: .* overlaps/.test(r.stderr)) throw new Error(`${what}: the usage error names the overlap:\n${r.stderr}`);
  }

  writeTree(join(tmp, "tpl"), { "site/_layout.html": TEMPLATE["site/_layout.html"], "site/_includes/nav.html": "<nav>n</nav>", "site/a.md": md("A", "a"), "site/a.html": page("A", "<h1>A</h1>") });
  const clash = await runCli(["build", "--extends", "tpl"], tmp);
  expectExit(clash, 1, "two template files producing a.html");
  if (!/a\.html \(template\)/.test(clash.stdout + clash.stderr) || !/a\.md \(template\)/.test(clash.stdout + clash.stderr)) {
    throw new Error(`P12 names both template files as template files:\n${clash.stdout}${clash.stderr}`);
  }
  covers("EXT-04");
}, TEST_MS);

// --------------------------------------------------------------- EXT-05/06

test("EXT-05/EXT-06 — a pinned git commit is fetched once into the cache and built offline after; an unpinned ref is never cached and an unreachable one writes nothing", async () => {
  const { bare, sha } = templateRepo();
  const tmp = mkTmp();
  const cache = join(tmp, "cache");
  const env = { XDG_CACHE_HOME: cache };
  writeTree(tmp, { ...SITE, "unify.yaml": `source: docs\nextends: file://${bare}#${sha}\n` });

  const first = await runCli(["build", "--strict"], tmp, env);
  expectExit(first, 0, "a pinned git template");
  const entries = readdirSync(join(cache, "unify", "templates")).filter((n) => !n.startsWith("."));
  if (entries.length !== 1) throw new Error(`one cache entry for one pinned source: ${entries.join(", ")}`);
  const entry = join(cache, "unify", "templates", entries[0]);
  if (!existsSync(join(entry, "_layout.html")) || existsSync(join(entry, "unify.yaml")) || existsSync(join(entry, "README.md"))) {
    throw new Error(`the cache holds the template's source tree and nothing else: ${readdirSync(entry).join(", ")}`);
  }
  const built = read(tmp, "dist", "index.html");

  // The repository is gone: the cache answers, offline.
  rmSync(bare, { recursive: true, force: true });
  const offline = await runCli(["build", "--strict"], tmp, env);
  expectExit(offline, 0, "the same pinned template, with its repository gone");
  if (read(tmp, "dist", "index.html") !== built) throw new Error("a build from the cache is byte-identical");

  // An unpinned ref is fetched, never cached — and unreachable now, it is a usage error that writes nothing.
  writeFileSync(join(tmp, "unify.yaml"), `source: docs\nextends: file://${bare}#main\n`);
  writeFileSync(join(tmp, "dist", "marker.txt"), "previous output");
  const gone = await runCli(["build", "--strict", "--clean"], tmp, env);
  expectExit(gone, 2, "an unreachable unpinned template");
  if (!/git clone failed/.test(gone.stderr)) throw new Error(`the tool's own failure, as a usage error:\n${gone.stderr}`);
  if (read(tmp, "dist", "marker.txt") !== "previous output" || read(tmp, "dist", "index.html") !== built) throw new Error("a failed fetch leaves the previous output untouched");
  if (readdirSync(join(cache, "unify", "templates")).filter((n) => !n.startsWith(".")).length !== 1) throw new Error("an unpinned source is never cached");
  covers("EXT-05", "EXT-06");
}, TEST_MS);

test("EXT-06 — a directory template is read where it is, so an edit to it shows on the next build", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "tpl"), TEMPLATE);
  writeTree(tmp, { ...SITE, "unify.yaml": "source: docs\nextends: tpl\n" });
  expectExit(await runCli(["build"], tmp, { XDG_CACHE_HOME: join(tmp, "cache") }), 0, "first build");
  writeFileSync(join(tmp, "tpl", "site", "about.html"), page("About", "<h1>About</h1><p>edited</p>"));
  expectExit(await runCli(["build"], tmp, { XDG_CACHE_HOME: join(tmp, "cache") }), 0, "second build");
  if (!read(tmp, "dist", "about.html").includes("edited")) throw new Error("the edit shows");
  if (existsSync(join(tmp, "cache", "unify"))) throw new Error("a directory source is never copied into the cache");
  covers("EXT-06");
}, TEST_MS);

// ------------------------------------------------------------------- EXT-07

test("EXT-07 — what comes from the template is named as the template's: --dry-run rows, diagnostics, and audit findings", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "tpl"), TEMPLATE);
  writeTree(tmp, { ...SITE, "unify.yaml": "source: docs\nextends: tpl\n" });

  const dry = await runCli(["build", "--dry-run"], tmp);
  expectExit(dry, 0, "dry run");
  for (const row of [
    "← about.html (template) + _layout.html (template)",
    "← index.md + _layout.html (template)",
    "← assets/style.css (template)",
    "← assets/theme.css\n",
  ]) {
    if (!dry.stdout.includes(row)) throw new Error(`--dry-run marks the template's files, and only those (${JSON.stringify(row)}):\n${dry.stdout}`);
  }

  // A fault inside a template file is located where that file is.
  writeFileSync(join(tmp, "tpl", "site", "about.html"), page("About", '<h1>About</h1><include src="/_includes/missing.html"></include>'));
  const bad = await runCli(["build"], tmp);
  expectExit(bad, 1, "a broken include in a template page");
  if (!/^tpl\/site\/about\.html:\d+: problem: include not found/m.test(bad.stdout + bad.stderr)) throw new Error(`a directory template's file is named by its path:\n${bad.stdout}${bad.stderr}`);
  writeFileSync(join(tmp, "tpl", "site", "about.html"), TEMPLATE["site/about.html"]);

  // An orphaned template page: marked, and the fix names --exclude, not a rename.
  writeTree(tmp, {
    "docs/_includes/nav.html": '<nav><a href="/index.html">home</a> <a href="/guide/start.html">start</a></nav>\n',
    "docs/index.md": md("Home", "Read [the guide](guide/start.html#next)."),
  });
  const audit = await runCli(["audit"], tmp);
  if (!/^about\.html \(template\): incomplete: .*\[page-orphan\]\n {2}fix: .*exclude: about\.html/m.test(audit.stdout)) {
    throw new Error(`audit marks a template page and names --exclude:\n${audit.stdout}${audit.stderr}`);
  }

  // A fetched template's file is named by the source as written, then its path inside the template.
  const { bare, sha } = templateRepo({
    ...TEMPLATE,
    "site/_layout.html": TEMPLATE["site/_layout.html"].replace("<footer>", '<include src="/_includes/missing.html"></include><footer>'),
  });
  const source = `file://${bare}#${sha}`;
  writeFileSync(join(tmp, "unify.yaml"), `source: docs\nextends: ${source}\n`);
  const fetched = await runCli(["build"], tmp, { XDG_CACHE_HOME: join(tmp, "cache") });
  expectExit(fetched, 1, "a fetched template whose layout includes a missing file");
  if (!new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/_layout\\.html:\\d+: problem: include not found`, "m").test(fetched.stdout + fetched.stderr)) {
    throw new Error(`a fetched template's file is named by the source and its path:\n${fetched.stdout}${fetched.stderr}`);
  }
  covers("EXT-07");
}, TEST_MS);
