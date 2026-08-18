/**
 * URL identity — §20.5's "one interpretation" law and §12's REF-08 decoding,
 * asserted across every surface that names a page's address.
 *
 * These live here rather than beside the sitemap tests on purpose. REF-08 and
 * the percent-encoding rule are §11/§12/§17/§20 rules that the sitemap merely
 * consumes; filed under §21 they would travel with a restructure of the sitemap
 * section and leave `urlForOutputPath`'s encoding covered by nothing.
 *
 * The law under test, from §20.5: a URL unify CONSTRUCTS is percent-encoded; a
 * URL the author WROTE is preserved. §12 percent-decodes before matching, so
 * both spellings of the same file resolve and neither is rewritten into the
 * other. It was broken twice in one week — once by encoding at a single call
 * site instead of in the shared function, once by decoding `%2F` into a real
 * separator — so each clause is pinned against a mutation in
 * `tests/conformance/mutations.tsv`.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); byte comparisons (H5).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

/** The smallest complete page. */
const page = (title, body = "<p>x</p>", head = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const read = (tmp, ...parts) => readFileSync(join(tmp, ...parts), "utf8");
const BASE = "https://example.com/";

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectBytes(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}\n--- expected ---\n${JSON.stringify(expected)}\n--- actual ---\n${JSON.stringify(actual)}`);
  }
}

test("REF-08/SIT-03: the report, the sitemap, and the reference check name one URL for one file", async () => {
  // §20.5's "one interpretation" law, made executable. It was broken for one
  // commit: the report printed /two words.html, the sitemap published
  // /two%20words.html, and §12 rejected the second — so the build advertised
  // an address it refused to let the author link to. Three surfaces, one file,
  // one string, asserted against each other rather than each on its own.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<a href="/two%20words.html">encoded</a><a href="/two words.html">raw</a>'),
    "two words.html": page("Spaced"),
  });

  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--dry-run"], tmp);
  expectExit(dry, 0, "dry-run");
  const row = dry.stdout.split("\n").find((l) => l.includes("dist/two words.html"));
  const reported = /\(([^)]*)\)/.exec(row ?? "")?.[1];
  if (reported !== "/two%20words.html") {
    throw new Error(`§20.5: the report must print the percent-encoded address, got ${JSON.stringify(reported)} from:\n${dry.stdout}`);
  }

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "build with both link spellings");
  const xml = read(tmp, "dist", "sitemap.xml");
  if (!xml.includes(`<loc>https://example.com${reported}</loc>`)) {
    throw new Error(`§21.3: the sitemap loc must be the same string the report printed (${reported}).\n${xml}`);
  }
  // §12 accepted BOTH spellings — the build did not refuse the address it publishes.
  covers("REF-08", "SIT-03", "MAN-05");
}, TEST_MS);

test("REF-08: a link written in the published spelling resolves; a broken one still fails", async () => {
  const good = mkTmp();
  writeTree(join(good, "src"), {
    "index.html": page("Home", '<a href="/caf%C3%A9.html">café</a>'),
    "café.html": page("Cafe"),
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist"], good);
  expectExit(a, 0, "encoded link, no base-url");

  const bad = mkTmp();
  writeTree(join(bad, "src"), { "index.html": page("Home", '<a href="/caf%C3%A9.html">café</a>') });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], bad);
  expectExit(b, 1, "encoded link to a page that does not exist");
  if (!b.stderr.includes("does not resolve")) {
    throw new Error(`§12: decoding must widen what resolves, not stop reporting what does not.\nstderr:\n${b.stderr}`);
  }
  covers("REF-08");
}, TEST_MS);

test("REF-08: %2F names one segment, not two — it matches nothing and is never rewritten", async () => {
  // RFC 3986: a reserved delimiter left encoded is deliberately not a
  // delimiter. Decoding it would reinterpret a one-segment URL as a two-segment
  // path — resolving to a different file, and under --pretty-urls replacing the
  // author's bytes with an address naming a different resource.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<a href="/a%2Fb.html">encoded slash</a>'),
    "a/b.html": page("Real"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "%2F must not resolve to a/b.html");
  if (!r.stderr.includes("a%2Fb.html")) {
    throw new Error(`§12/REF-08: the diagnostic must quote the author's own spelling.\nstderr:\n${r.stderr}`);
  }

  // The adjacent case: the real two-segment spelling resolves, and a build with
  // it is left byte-untouched by --pretty-urls' rewrite of the OTHER page.
  const ok = mkTmp();
  writeTree(join(ok, "src"), {
    "index.html": page("Home", '<a href="/a/b.html">real</a>'),
    "a/b.html": page("Real"),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], ok);
  expectExit(b, 0, "the genuine two-segment spelling resolves");
  covers("REF-08");
}, TEST_MS);

test("REF-08/MAN-05: an encodable name survives --pretty-urls", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<a href="/two words.html">spaced</a>'),
    "two words.html": page("Spaced"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--pretty-urls"], tmp);
  expectExit(r, 0, "pretty build with an encodable name");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc></url>\n" +
      "<url><loc>https://example.com/two%20words/</loc></url>\n" +
      "</urlset>\n",
    "§20.5 + §11.2: the index.html suffix rule and the encoder meet here",
  );
  if (!read(tmp, "dist", "index.html").includes('href="/two%20words/"')) {
    throw new Error(`§11.2: the link must be pretty-rewritten to the encoded directory URL:\n${read(tmp, "dist", "index.html")}`);
  }
  covers("REF-08", "MAN-05");
}, TEST_MS);

test("URL-06/MAN-05: §11.1 encodes the URL it CONSTRUCTS, and preserves the one the author wrote", async () => {
  // The two sides of §20.5's line in one build. The nav is an include, so its
  // relative src is re-rooted — a string in no source file, therefore encoded.
  // index.html's own href is authored in the page that ships it and does not
  // move, so it is preserved byte-for-byte. Both resolve; only one is rewritten.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/nav.html": '<nav><img src="../assets/my logo.png" alt="logo"></nav>\n',
    "index.html": page("Home", '<include src="/_includes/nav.html"></include><a href="/two words.html">authored</a>'),
    "two words.html": page("Spaced"),
    "assets/my logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "provenance build");
  const out = read(tmp, "dist", "index.html");
  if (!out.includes('src="/assets/my%20logo.png"')) {
    throw new Error(`§20.5: a URL §11.1 constructs must be encoded:\n${out}`);
  }
  if (!out.includes('href="/two words.html"')) {
    throw new Error(`§11.1/URL-06: a URL the author wrote in an unmoved page must be preserved byte-for-byte:\n${out}`);
  }
  covers("MAN-05");
}, TEST_MS);

test("URL-06: §11.1 canonicalizes an authored escape rather than re-encoding it", async () => {
  // The four cases that distinguish canonicalize (decode-then-encode per
  // segment) from plain encode. Encoding a path built from authored URL text
  // is wrong in BOTH directions at once, and the silent direction — case B —
  // is the one that reaches production.
  const cases = [
    { file: "a b.png", href: "a%20b.png", exit: 0, emit: "/assets/a%20b.png",
      why: "author spelled it correctly per RFC 3986; plain encode would make it %2520 and fail a correct site" },
    { file: "a%20b.png", href: "a%20b.png", exit: 1, emit: null,
      why: "that href names 'a b.png', which is absent; plain encode would pass this silently" },
    { file: "my logo.png", href: "my logo.png", exit: 0, emit: "/assets/my%20logo.png",
      why: "a raw space is not a legal URI; unify's re-rooted construction must be one" },
    { file: "a%20b.png", href: "a%2520b.png", exit: 0, emit: "/assets/a%2520b.png",
      why: "the only correct spelling for a file literally named a%20b.png" },
  ];
  for (const c of cases) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "_includes/nav.html": `<nav><img src="../assets/${c.href}" alt="l"></nav>\n`,
      "index.html": page("Home", '<include src="/_includes/nav.html"></include>'),
      [`assets/${c.file}`]: "PNG",
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(r, c.exit, `file=${c.file} href=${c.href} — ${c.why}`);
    if (c.emit !== null && !read(tmp, "dist", "index.html").includes(`src="${c.emit}"`)) {
      throw new Error(`§20.5: expected src="${c.emit}" for file=${c.file} href=${c.href} (${c.why}):\n${read(tmp, "dist", "index.html")}`);
    }
  }
  covers("MAN-05");
}, TEST_MS);

test("REF-08: a backslash in a POSIX filename round-trips — only %2F is refused", async () => {
  // A backslash is legal in a POSIX filename, so a%5Cb.html is a real address
  // §20.5 publishes and §12 must accept. Refusing it made the site's own
  // advertised address unresolvable — the %2F self-contradiction one character
  // over. It cannot arise on Windows, where a filename may not contain one.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<a href="/a%5Cb.html">backslash</a>'),
    "a\\b.html": page("Backslash"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a legal POSIX filename containing a backslash");
  const xml = read(tmp, "dist", "sitemap.xml");
  if (!xml.includes("<loc>https://example.com/a%5Cb.html</loc>")) {
    throw new Error(`§20.5: the published address must be the encoded one:\n${xml}`);
  }
  covers("REF-08");
}, TEST_MS);

test("URL-06: an include-relative reference round-trips whether written raw or encoded", async () => {
  // Two references to ONE file in ONE build, from the same include: raw must be
  // canonicalized, already-encoded must survive unchanged. The four-case test
  // above varies the file per case; this varies only the spelling.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_inc/nav.html": '<nav><img src="../assets/my logo.png" alt="raw"><img src="../assets/my%20logo.png" alt="encoded"></nav>\n',
    "index.html": page("Home", '<include src="/_inc/nav.html"></include>'),
    "assets/my logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "both spellings of one file, one build");
  const out = read(tmp, "dist", "index.html");
  const srcs = [...out.matchAll(/src="([^"]*)"/g)].map((m) => m[1]);
  if (srcs.length !== 2 || srcs[0] !== "/assets/my%20logo.png" || srcs[1] !== "/assets/my%20logo.png") {
    throw new Error(`§20.5: both must canonicalize to the same address, got ${JSON.stringify(srcs)}:\n${out}`);
  }
  covers("MAN-05");
}, TEST_MS);

test("HED-06/REF-08: two spellings of one stylesheet dedup to one link", async () => {
  // §8 row 6 dedups stylesheets by URL AFTER resolution, and §12 says both
  // spellings name the same file — so the identity question must have one
  // answer across the build. Without decoding in the head merge, a layout's
  // raw href and a page's encoded one shipped as two <link> elements for one
  // file. Newly reachable now that the encoded form is what unify publishes.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": '<!doctype html>\n<html><head><title>L</title><link rel="stylesheet" href="/assets/a b.css"></head><body><main></main></body></html>\n',
    "index.html": '<!doctype html>\n<html><head><title>Home</title><link rel="stylesheet" href="/assets/a%20b.css"></head><body><main><p>x</p></main></body></html>\n',
    "assets/a b.css": "body{color:#000}\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "two spellings of one stylesheet");
  const links = [...read(tmp, "dist", "index.html").matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
  if (links.length !== 1) {
    throw new Error(`§8 row 6: one file must yield one <link>, got ${links.length}: ${JSON.stringify(links)}`);
  }
  covers("REF-08");
}, TEST_MS);

test("REF-08/URL-08: an ENCODED authored link is pretty-rewritten like a raw one", async () => {
  // Pins applyPrettyLinks' own decode. Without it a link written in the exact
  // spelling the site publishes stops being rewritten and then fails §12 as
  // unresolvable — a build broken by using its own advertised address.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<a href="/two%20words.html">encoded</a>'),
    "two words.html": page("Spaced"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--pretty-urls"], tmp);
  expectExit(r, 0, "encoded link under --pretty-urls");
  const out = read(tmp, "dist", "index.html");
  if (!out.includes('href="/two%20words/"')) {
    throw new Error(`§11.2: an encoded link must reach the same pretty target a raw one does:\n${out}`);
  }
  covers("REF-08");
}, TEST_MS);

test("REF-08: an undecodable escape resolves verbatim or reports — never an unlocated fatal", async () => {
  // Pins the malformed-escape guard, two-sided. `/100%.html` is not a decodable
  // URI, so the segment is kept as written: it then matches a file literally
  // named `100%.html`, and matches nothing when there is none. Without the
  // guard BOTH builds die with an unlocated `URI error` carrying no file and no
  // line — outside §14's diagnostic contract entirely.
  const present = mkTmp();
  writeTree(join(present, "src"), {
    "index.html": page("Home", '<a href="/100%.html">percent</a>'),
    "100%.html": page("Percent"),
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist"], present);
  if (/URI ?[eE]rror/.test(a.stderr)) {
    throw new Error(`§14: a malformed escape must not escape as an unlocated fatal.\nstderr:\n${a.stderr}`);
  }
  expectExit(a, 0, "the verbatim segment names the file that exists");

  const absent = mkTmp();
  writeTree(join(absent, "src"), { "index.html": page("Home", '<a href="/100%.html">percent</a>') });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], absent);
  if (/URI ?[eE]rror/.test(b.stderr)) {
    throw new Error(`§14: a malformed escape must not escape as an unlocated fatal.\nstderr:\n${b.stderr}`);
  }
  expectExit(b, 1, "and reports when it names nothing");
  if (!b.stderr.includes("src/index.html")) {
    throw new Error(`§14.1: the diagnostic must name the source file.\nstderr:\n${b.stderr}`);
  }
  covers("REF-08");
}, TEST_MS);
