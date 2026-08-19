/**
 * `<meta http-equiv="refresh">` as a URL and as a redirect — URL-13, REF-09,
 * MAN-12, AUD-13.
 *
 * The shape this file pins is the one a redirect stub has always had and
 * nothing ever looked at: a page whose entire content is a URL. §11 did not
 * rewrite it, so a layout-authored redirect meant a different page on every
 * page that consumed it; §12 did not check it, so one naming a deleted page
 * shipped with a green build; and §24 could not see a cycle of them.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

/** A complete page (§4.4 requires a whole document), with an optional head/body extra. */
const page = (name, { head = "", body = "" } = {}) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="The ${name} page of the example site.">
${head}
</head>
<body>
${body}
<main><h1>${name}</h1><p>Words about ${name}.</p></main>
</body>
</html>
`;

const refresh = (content) => `<meta http-equiv="refresh" content="${content}">`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectIncludes(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

function expectExcludes(haystack, needle, what) {
  if (haystack.includes(needle)) throw new Error(`${what}: expected NOT to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

/** The `content` value of every refresh meta in one emitted file. */
function refreshContents(file) {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/<meta http-equiv="refresh" content="([^"]*)"/g)].map((m) => m[1]);
}

/** The finding ids the audit report declares. */
const ids = (stdout) => [...stdout.matchAll(/\[([a-z0-9-]+)\]$/gm)].map((m) => m[1]);

/** Every finding id reported against one source path. */
function idsFor(stdout, file) {
  return [...stdout.matchAll(/^(\S+): \w+: .*\[([a-z0-9-]+)\]$/gm)]
    .filter((m) => m[1] === file).map((m) => m[2]).sort();
}

// --------------------------------------------------------------------- §12

test("REF-09 — a refresh naming a page this build never emitted blocks the publish", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", { body: '<nav><a href="/old.html">Old</a></nav>' }),
    "src/old.html": page("Old", { head: refresh("0; url=/gone.html") }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 1, "a broken redirect target");
  expectIncludes(r.stderr, "src/old.html:", "the diagnostic names the page that wrote the redirect");
  expectIncludes(r.stderr, "/gone.html does not resolve to any emitted file", "P13's message");
  if (existsSync(join(dir, "dist"))) throw new Error("a problem must leave dist/ unwritten (§15)");
  covers("REF-09");
}, TEST_MS);

test("REF-09 — the grammar's accepted and unread spellings all build clean", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    // Every one of these resolves, declines to declare a URL, or declares one
    // this grammar deliberately does not read — so a correct site must publish.
    "src/index.html": page("Home", {
      body: '<nav><a href="/quoted.html">a</a> <a href="/comma.html">b</a> <a href="/self.html">c</a>'
        + ' <a href="/bare.html">d</a> <a href="/empty.html">e</a> <a href="/target.html">f</a></nav>',
    }),
    "src/quoted.html": page("Quoted", { head: refresh("0; URL='/target.html'") }),
    "src/comma.html": page("Comma", { head: refresh("600,url=/target.html") }),
    "src/self.html": page("Self", { head: refresh("5") }),
    "src/bare.html": page("Bare", { head: refresh("0; /target.html") }),
    "src/empty.html": page("Empty", { head: refresh("0; url=") }),
    "src/target.html": page("Target"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 0, "every accepted spelling resolves and every unread one is skipped");
  // The quotes are the grammar's, not the URL's: they must not survive into the
  // value §12 resolved, or a quoted target would have been checked as a path.
  expectIncludes(readFileSync(join(dir, "dist", "quoted.html"), "utf8"), "URL='/target.html'",
    "the author's own bytes ship untouched");
  covers("REF-09");
}, TEST_MS);

test("REF-09 — neither the keyword's case nor the delay is an escape from the check", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", { body: '<nav><a href="/shout.html">a</a> <a href="/slow.html">b</a></nav>' }),
    "src/shout.html": page("Shout", { head: refresh("0; URL=/gone.html") }),
    "src/slow.html": page("Slow", { head: refresh("600; url=/also-gone.html") }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 1, "an uppercase keyword and a delayed redirect are both checked");
  expectIncludes(r.stderr, "/gone.html does not resolve to any emitted file", "the uppercase URL= spelling");
  expectIncludes(r.stderr, "/also-gone.html does not resolve to any emitted file", "the 600-second redirect");
  covers("REF-09");
}, TEST_MS);

test("REF-09 — an element spelling two readings of one content attribute is reported, never crashed on", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    // Nonsense markup no consumer acts on — but it reaches §11 from a layout,
    // where the metas' reading and the refresh reading would both rewrite the
    // same value. Two overlapping edits are a fatal with no file and no line.
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Site</title>
<meta http-equiv="refresh" name="twitter:image" content="0;url=card.png">
</head>
<body><main></main></body>
</html>
`,
    "src/index.html": page("Home"),
    "src/card.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 1, "the compound value is reported as the URL-valued meta it also claims to be");
  expectIncludes(r.stderr, "does not resolve to any emitted file", "a located §12 problem");
  if (/applyEdits|at [\w.]+ \(/.test(r.stderr)) {
    throw new Error(`§14 has no unlocated-fatal category:\n${r.stderr}`);
  }
  covers("REF-09");
}, TEST_MS);

// -------------------------------------------------------------------- §11

/**
 * The provenance fixture, verified against the real CLI before this test
 * existed: one authored redirect in a layout, and a `target.html` beside BOTH
 * consuming pages, so the wrong answer resolves too and only the emitted bytes
 * can tell the two apart.
 */
const provenanceSite = {
  "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Site</title>
${refresh("0; url=target.html")}
</head>
<body><main></main></body>
</html>
`,
  "src/index.html": page("Home", { body: '<nav><a href="/deep/page.html">Deep</a></nav>' }),
  "src/deep/page.html": page("Deep"),
  "src/target.html": page("Target"),
  "src/deep/target.html": page("Deep Target"),
};

test("URL-13 — a layout's relative refresh is re-rooted at the layout, not at each page", async () => {
  const dir = mkTmp();
  writeTree(dir, provenanceSite);
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 0, "the provenance site builds");
  for (const out of ["index.html", "deep/page.html"]) {
    const got = refreshContents(join(dir, "dist", out));
    if (got.length !== 1 || got[0] !== "0; url=/target.html") {
      throw new Error(`${out}: expected one refresh reading "0; url=/target.html", got ${JSON.stringify(got)}`);
    }
  }
  covers("URL-13");
}, TEST_MS);

test("URL-13 — --pretty-urls retargets a refresh, and --base-url prefixes the path and not the origin", async () => {
  const dir = mkTmp();
  writeTree(dir, provenanceSite);

  const pretty = await runCli(["build", "-s", "src", "-o", "pretty", "--pretty-urls"], dir);
  expectExit(pretty, 0, "the pretty build");
  const prettyGot = refreshContents(join(dir, "pretty", "index.html"));
  if (prettyGot[0] !== "0; url=/target/") {
    throw new Error(`--pretty-urls: expected "0; url=/target/", got ${JSON.stringify(prettyGot)}`);
  }

  const based = await runCli(["build", "-s", "src", "-o", "based", "--base-url", "https://example.com/repo/"], dir);
  expectExit(based, 0, "the subpath build");
  const basedGot = refreshContents(join(dir, "based", "index.html"));
  if (basedGot[0] !== "0; url=/repo/target.html") {
    throw new Error(`--base-url: expected "0; url=/repo/target.html", got ${JSON.stringify(basedGot)}`);
  }
  // A redirect is fetched by the browser that already has the page, so it takes
  // the path prefix and never the origin — unlike a canonical or an og: value.
  expectExcludes(basedGot[0], "https://example.com", "the origin is never prepended to a refresh");
  covers("URL-13");
}, TEST_MS);

// -------------------------------------------------------------- §20.11/§24.4

/**
 * One site, one `audit` run, every shape the loop finding must and must not
 * see: self, a two-page cycle, a body-placed redirect, a delayed one, a hop
 * that terminates, a second part the grammar declines to read, and a page
 * declaring two refreshes where only the first counts.
 */
const loopSite = {
  "src/index.html": page("Home", {
    body: '<nav><a href="/self.html">a</a> <a href="/bare.html">b</a> <a href="/a.html">c</a>'
      + ' <a href="/b.html">d</a> <a href="/body.html">e</a> <a href="/slow.html">f</a>'
      + ' <a href="/hop.html">g</a> <a href="/unread.html">h</a> <a href="/two.html">i</a>'
      + ' <a href="/target.html">j</a></nav>',
  }),
  "src/self.html": page("Self", { head: refresh("0; url=/self.html") }),
  "src/bare.html": page("Bare", { head: refresh("0") }),
  "src/a.html": page("A", { head: refresh("0; url=/b.html") }),
  "src/b.html": page("B", { head: refresh("0; url=a.html") }),
  "src/body.html": page("Body", { body: refresh("0; url=/body.html") }),
  "src/slow.html": page("Slow", { head: refresh("30; url=/slow.html") }),
  "src/hop.html": page("Hop", { head: refresh("0; url=/target.html") }),
  "src/unread.html": page("Unread", { head: refresh("0; /unread.html") }),
  "src/two.html": page("Two", { head: `${refresh("0; url=/target.html")}\n${refresh("0; url=/two.html")}` }),
  "src/target.html": page("Target"),
};

test("MAN-12/AUD-13 — every immediate cycle reports, and nothing else does", async () => {
  const dir = mkTmp();
  writeTree(dir, loopSite);
  const r = await runCli(["audit", "-s", "src"], dir);
  expectExit(r, 0, "findings never block without --strict");

  const looping = ["a.html", "b.html", "bare.html", "body.html", "self.html"];
  for (const f of looping) {
    if (!idsFor(r.stdout, f).includes("redirect-loop")) {
      throw new Error(`expected a redirect-loop on ${f}\n${r.stdout}`);
    }
  }
  // A delayed cycle is an ordinary pattern; a terminating hop is not a cycle;
  // a second part the grammar does not read names nothing knowable; and only
  // the FIRST declaration is the page's refresh.
  for (const f of ["slow.html", "hop.html", "unread.html", "two.html", "target.html", "index.html"]) {
    if (idsFor(r.stdout, f).includes("redirect-loop")) {
      throw new Error(`expected NO redirect-loop on ${f}\n${r.stdout}`);
    }
  }
  if (ids(r.stdout).filter((id) => id === "redirect-loop").length !== looping.length) {
    throw new Error(`expected exactly ${looping.length} redirect-loop findings\n${r.stdout}`);
  }
  // §20.4 records the second declaration on `two.html` as a conflict; §24.4
  // deliberately does not render it, because that subset's criterion is a
  // spec-stated at-most-one rule and unify asserts only that the first is read.
  if (idsFor(r.stdout, "two.html").includes("metadata-conflict")) {
    throw new Error(`a refresh conflict is data, not a finding\n${r.stdout}`);
  }
  // The chain is printed from the page it is reported on, so each author reads
  // the walk they will actually follow.
  expectIncludes(r.stdout, "a.html → b.html → a.html", "a's chain");
  expectIncludes(r.stdout, "b.html → a.html → b.html", "b's chain");
  expectIncludes(r.stdout, 'content="0" and the chain returns to it: bare.html → bare.html',
    "a bare delay names this page");
  covers("MAN-12", "AUD-13");
}, TEST_MS);

test("AUD-13 — --strict gates on a redirect loop", async () => {
  const dir = mkTmp();
  writeTree(dir, loopSite);
  const r = await runCli(["audit", "-s", "src", "--strict"], dir);
  expectExit(r, 1, "--strict is the opt-in gate on any finding");
  covers("AUD-13");
}, TEST_MS);
