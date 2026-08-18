/**
 * §23 robots consistency — ROB-01..03.
 *
 * The interesting half of this section is what it refuses to check. §6.3.3 says
 * "unify never decides what an author should block", and RFC 9309 §2.2.1 says
 * crawlers MUST ignore lines they cannot parse — so a malformed line, an
 * unknown field, and a Disallow naming nothing are all *defined* to be inert,
 * and failing a publish over any of them would contradict the standard the
 * check exists to serve. Most of the cases below assert silence.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";
const read = (tmp, ...parts) => readFileSync(join(tmp, ...parts), "utf8");
const page = (title) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>\n`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

// ------------------------------------------------------------------- §23.1

test("ROB-01: an authored robots.txt ships byte-for-byte and is never rewritten", async () => {
  const authored = "# our policy\nUser-agent: *\nDisallow: /private/\nAllow: /private/public.html\n\nSitemap: https://example.com/sitemap.xml\n";
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home"), "robots.txt": authored });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "authored robots.txt");
  if (read(tmp, "dist", "robots.txt") !== authored) {
    throw new Error(`§23.1: the author's policy ships exactly as written:\n${JSON.stringify(read(tmp, "dist", "robots.txt"))}`);
  }
  covers("ROB-01");
}, TEST_MS);

test("ROB-01: a robots.txt outside the output root is an ordinary asset, interpreted by nothing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "blog/robots.txt": "Sitemap: https://example.com/nowhere-at-all.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a nested robots.txt");
  if (r.stderr.trim() !== "") {
    throw new Error(`§23.1: only the root file has meaning under the protocol.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-01");
}, TEST_MS);

test("ROB-01: a root-relative Sitemap: is checked with or without --base-url", async () => {
  // The rule §23.1 states, in the one fixture that can distinguish it. An
  // ABSOLUTE value cannot: `isSkippedUrl` discards it as another origin before
  // activation is ever consulted, so a test built on one passes with the gate,
  // without the gate, and with no check at all — which is what the earlier
  // version of this test did.
  const files = { "index.html": page("Home"), "robots.txt": "Sitemap: /nowhere.xml\n" };
  const off = mkTmp();
  writeTree(join(off, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist"], off);
  expectExit(a, 1, "a root-relative Sitemap: with no --base-url");
  if (!/nowhere\.xml/.test(a.stderr)) {
    throw new Error(`§23.1: root-relative is internal by inspection — no address needed.\nstderr:\n${a.stderr}`);
  }

  const on = mkTmp();
  writeTree(join(on, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], on);
  expectExit(b, 1, "the same file with an address supplied");
  covers("ROB-01");
}, TEST_MS);

test("ROB-01: an other-origin Sitemap: is skipped, address or no address", async () => {
  const files = { "index.html": page("Home"), "robots.txt": "Sitemap: https://elsewhere.example/nowhere.xml\n" };
  for (const args of [[], ["--base-url", BASE]]) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), files);
    const r = await runCli(["build", "-s", "src", "-o", "dist", ...args], tmp);
    expectExit(r, 0, `another origin ${args.length ? "with" : "without"} --base-url`);
    if (r.stderr.trim() !== "") {
      throw new Error(`§23.3: verifying it needs the network.\nstderr:\n${r.stderr}`);
    }
  }
  covers("ROB-01");
  covers("ROB-02");
}, TEST_MS);

test("ROB-02: the diagnostic quotes the author's own line, at the author's own line number", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    // The authored spelling is absolute; §23.1 rewrites no byte of this file,
    // so the stripped form is a string that appears nowhere the author can grep.
    "robots.txt": "# our policy\nUser-agent: *\n\nSitemap: https://example.com/no-such-sitemap.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 1, "a Sitemap: naming nothing emitted");
  const authored = "https://example.com/no-such-sitemap.xml";
  if (!r.stderr.includes(`in: ${authored}`)) {
    throw new Error(`§14.1: "in:" is the offending SOURCE text.\nstderr:\n${r.stderr}`);
  }
  if (r.stderr.includes("in: /no-such-sitemap.xml")) {
    throw new Error(`§14.1: the stripped form appears in no file.\nstderr:\n${r.stderr}`);
  }
  // Line 4, not line 1: a comment, the group, and a blank line precede it.
  if (!/robots\.txt:4: problem:/.test(r.stderr)) {
    throw new Error(`§14.1: located at the line the value is on.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-02");
}, TEST_MS);

test("ROB-03: RFC 9309 §2.3.1.5 — an unparseable line leaves the parseable ones working", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    // A line with no colon at all, between two that parse. A crawler must use
    // the parseable rules; so must this check — the Sitemap below still fails.
    "robots.txt": "User-agent: *\nthis line has no field separator\nSitemap: /nowhere.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a malformed line above a broken Sitemap:");
  if (!/nowhere\.xml/.test(r.stderr)) {
    throw new Error(`§23.4: the parseable rules are still used.\nstderr:\n${r.stderr}`);
  }
  if (/no field separator/.test(r.stderr)) {
    throw new Error(`§23.4: an unparseable line is inert, never a problem.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-03");
}, TEST_MS);

test("ROB-03: a bare-CR file is still records, per RFC 9309's NL", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    // RFC 9309's NL is CR, LF, or CRLF. Splitting on /\r?\n/ made a
    // classic-Mac file one long unparseable line, so its Sitemap: was never
    // checked — silence, which is the direction that ships a broken promise.
    "robots.txt": "User-agent: *\rSitemap: /nowhere.xml\r",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a bare-CR robots.txt");
  covers("ROB-03");
}, TEST_MS);

// ------------------------------------------------------------------- §23.3

test("ROB-02: a Sitemap: naming nothing emitted is P13 at the source robots.txt; a good one is silent", async () => {
  const broken = mkTmp();
  writeTree(join(broken, "src"), {
    "index.html": page("Home"),
    "robots.txt": "User-agent: *\nSitemap: https://example.com/no-such-sitemap.xml\n",
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], broken);
  expectExit(a, 1, "a Sitemap: promise the site breaks");
  if (!a.stderr.includes("robots.txt") || !a.stderr.includes("no-such-sitemap.xml")) {
    throw new Error(`§23.3: located at the source robots.txt, naming the value.\nstderr:\n${a.stderr}`);
  }

  // The adjacent side: the sitemap unify itself generated resolves, silently.
  const good = mkTmp();
  writeTree(join(good, "src"), {
    "index.html": page("Home"),
    "robots.txt": "User-agent: *\nSitemap: https://example.com/sitemap.xml\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], good);
  expectExit(b, 0, "a Sitemap: naming the generated file");
  if (b.stderr.trim() !== "") throw new Error(`§23.3: a resolving reference is silent.\nstderr:\n${b.stderr}`);
  covers("ROB-02");
}, TEST_MS);

test("ROB-02: a Sitemap: on another origin is skipped rather than fetched", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "robots.txt": "Sitemap: https://cdn.elsewhere.example/sitemaps/site.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "another origin");
  if (r.stderr.trim() !== "") {
    throw new Error(`§23.3: verifying it needs the network, which build never uses.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-02");
}, TEST_MS);

test("ROB-02: a root-relative Sitemap: is still a reference and is still checked", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "robots.txt": "Sitemap: /gone.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 1, "a root-relative value naming nothing");
  if (!r.stderr.includes("gone.xml")) {
    throw new Error(`§23.3: whether the value is absolute is audit's judgement; whether it resolves is not.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-02");
}, TEST_MS);

test("ROB-02: field names are case-insensitive, and a subpath base is stripped", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "robots.txt": "sitemap: https://example.com/repo/sitemap.xml\nSITEMAP: https://example.com/repo/gone.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/repo/"], tmp);
  expectExit(r, 1, "mixed-case fields under a subpath");
  if (!r.stderr.includes("gone.xml")) {
    throw new Error(`§23.2: field names are case-insensitive per RFC 9309.\nstderr:\n${r.stderr}`);
  }
  if (r.stderr.includes("sitemap.xml does not resolve") || r.stderr.includes("/repo/sitemap.xml")) {
    throw new Error(`§23.3: the good one resolves after the prefix is stripped.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-02");
}, TEST_MS);

// ------------------------------------------------------------------- §23.4

test("ROB-03: everything that is not a reference is left alone, and the build is silent", async () => {
  // Each line here would be a finding under a naive implementation, and each is
  // defined to be inert: Disallow is a pattern (blocking a path that does not
  // exist yet is exactly right), and RFC 9309 §2.2.1 requires crawlers to
  // ignore lines and fields they cannot parse.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "robots.txt": [
      "User-agent: *",
      "Disallow: /admin/",              // names nothing this site emits — defensive, not an error
      "Disallow: /never/going/to/exist", // likewise
      "Allow: /admin/public.html",       // likewise
      "Crawl-delay: 10",                 // unknown field — RFC says ignore
      "this line is not a record at all", // unparseable — RFC says ignore
      "Disallow /missing-colon",          // malformed — RFC says ignore
      "",
      "# no Sitemap: line at all, though unify generated one",
      "",
    ].join("\n"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "patterns, unknown fields, malformed lines, and a missing Sitemap:");
  if (r.stderr.trim() !== "") {
    throw new Error(`§23.4: none of this is unify's to judge at build time.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-03");
}, TEST_MS);

test("ROB-03: a noindex page listed in an authored sitemap is not a build problem", async () => {
  // A contradiction between two authored things, which §6.3.4 assigns to
  // audit. §20.6 already records the page's directives for it to read.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "hidden.html": `<!doctype html>\n<html><head><title>H</title><meta name="robots" content="noindex"></head><body><p>x</p></body></html>\n`,
    "sitemap.xml": '<?xml version="1.0"?>\n<urlset>\n<url><loc>https://example.com/hidden.html</loc></url>\n</urlset>\n',
    "robots.txt": "Sitemap: https://example.com/sitemap.xml\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a listed noindex page");
  if (r.stderr.trim() !== "") {
    throw new Error(`§23.4: the URL resolves; the contradiction is audit's to report.\nstderr:\n${r.stderr}`);
  }
  covers("ROB-03");
}, TEST_MS);
