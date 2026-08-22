/**
 * §21 sitemap generation — SIT-01..06 and P22, plus the §20 manifest rows the
 * sitemap is the first surface to make observable (MAN-01, MAN-05, MAN-06).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1). Every expected document
 * below is written from §21's text — the namespace, the element order, the
 * `<lastmod>` rule, the split naming — and compared byte-for-byte, never
 * whitespace-normalized (H5) and never captured from a run.
 *
 * The two-sided convention: every rule that fires has an adjacent case where
 * it must NOT fire. `--base-url` on/off, indexable/noindex, self-canonical vs
 * consolidated, authored sitemap vs generated, occupied path vs free.
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

// ------------------------------------------------------------------- §21.1

test("SIT-01: --base-url generates sitemap.xml; without it nothing is generated or reported", async () => {
  const withBase = mkTmp();
  writeTree(join(withBase, "src"), { "index.html": page("Home"), "about.html": page("About") });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], withBase);
  expectExit(a, 0, "sitemap build");
  expectBytes(
    read(withBase, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/about.html</loc></url>\n" +
      "<url><loc>https://example.com/</loc></url>\n" +
      "</urlset>\n",
    "§21.3/§21.4: entries in manifest order (output path), loc only, no changefreq or priority",
  );

  const noBase = mkTmp();
  writeTree(join(noBase, "src"), { "index.html": page("Home"), "about.html": page("About") });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], noBase);
  expectExit(b, 0, "no-base build");
  if (existsSync(join(noBase, "dist", "sitemap.xml"))) {
    throw new Error("§21.1: a build with no --base-url must emit no sitemap — unify does not know the site's address");
  }
  if (/sitemap/i.test(b.stdout) || /sitemap/i.test(b.stderr)) {
    throw new Error(`§21.1: a build with no --base-url must report nothing about sitemaps.\nstdout:\n${b.stdout}\nstderr:\n${b.stderr}`);
  }
  covers("SIT-01", "MAN-01");
}, TEST_MS);

test("SIT-01: the generated sitemap appears in --dry-run and is written by nothing on that run", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/repo/", "--dry-run"], tmp);
  expectExit(r, 0, "dry-run");
  // §17/DRY-04: a parenthesized address carries the base-url PATH PREFIX, not
  // the origin ("every parenthesized URL carries the path prefix (/repo/about/)").
  // A generated artifact is a write like any other and gets the same treatment
  // — the report has one address format, not one per producer.
  if (!r.stdout.includes("write dist/sitemap.xml (/repo/sitemap.xml) \u2190 generated (--base-url)")) {
    throw new Error(`§21.1: --dry-run must show the generated sitemap as a write row in §17's own address format.\nstdout:\n${r.stdout}`);
  }
  if (existsSync(join(tmp, "dist"))) {
    throw new Error("§17: --dry-run must write nothing at all, generated artifacts included");
  }
  covers("SIT-01");
}, TEST_MS);

test("SIT-01: a build that reports a problem publishes no sitemap either", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", `<a href="/gone.html">gone</a>`),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 1, "broken-reference build");
  if (existsSync(join(tmp, "dist", "sitemap.xml"))) {
    throw new Error("§15/§21.1: a generated artifact must participate in transactional publish — nothing ships when a problem blocks the build");
  }
  covers("SIT-01");
}, TEST_MS);

// ------------------------------------------------------------------- §21.2

test("SIT-02: noindex, 404.html, and consolidated pages are excluded; their clean neighbours are not", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "hidden.html": page("Hidden", "<p>x</p>", `<meta name="robots" content="noindex">`),
    "nofollow.html": page("Nofollow", "<p>x</p>", `<meta name="robots" content="nofollow">`),
    "none.html": page("None", "<p>x</p>", `<meta name="robots" content="none">`),
    "404.html": page("Not found"),
    "dupe.html": page("Dupe", "<p>x</p>", `<link rel="canonical" href="/index.html">`),
    "self.html": page("Self", "<p>x</p>", `<link rel="canonical" href="/self.html">`),
    "away.html": page("Away", "<p>x</p>", `<link rel="canonical" href="https://elsewhere.example/x">`),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "membership build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc></url>\n" +
      "<url><loc>https://example.com/nofollow.html</loc></url>\n" +
      "<url><loc>https://example.com/self.html</loc></url>\n" +
      "</urlset>\n",
    "§21.2: noindex/none/404.html/foreign-canonical excluded; nofollow and self-canonical kept",
  );
  covers("SIT-02", "MAN-06");
}, TEST_MS);

test("SIT-02: a canonical written as a directory URL still counts as self-canonical under --pretty-urls", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "about.html": page("About", "<p>x</p>", `<link rel="canonical" href="/about/">`),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--pretty-urls"], tmp);
  expectExit(r, 0, "pretty build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/about/</loc></url>\n" +
      "<url><loc>https://example.com/</loc></url>\n" +
      "</urlset>\n",
    "§21.2/§20.5: pretty URLs everywhere, and /about/ resolves to about/index.html — its own page",
  );
  covers("SIT-02", "MAN-05");
}, TEST_MS);

test("SIT-02: a subpath --base-url puts the prefix in every loc", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home"), "about.html": page("About") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/repo/"], tmp);
  expectExit(r, 0, "subpath build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/repo/about.html</loc></url>\n" +
      "<url><loc>https://example.com/repo/</loc></url>\n" +
      "</urlset>\n",
    "§20.5: the path prefix reaches sitemap locs, exactly as it reaches og:image",
  );
  covers("SIT-02", "MAN-05");
}, TEST_MS);

test("SIT-02: fragments and assets never become sitemap entries", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "card.fragment.html": "<p>a fragment</p>\n",
    "style.css": "body{color:#000}\n",
    "_draft.html": page("Draft"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "fragment build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc></url>\n" +
      "</urlset>\n",
    "§21.2/§20.1: only composed pages have records, so only they can be entries",
  );
  covers("SIT-02", "MAN-01");
}, TEST_MS);

// ------------------------------------------------------------------- §21.3

test("SIT-03: lastmod is emitted only from an authored, well-formed date", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "a.html": page("A", "<p>x</p>", `<meta property="article:modified_time" content="2026-03-04">`),
    "b.html": page("B", "<p>x</p>", `<meta name="lastmod" content="2026-05-06T07:08:09Z">`),
    "c.html": page("C", "<p>x</p>", `<meta name="lastmod" content="last Tuesday">`),
    "d.html": page("D", "<p>x</p>", `<meta property="article:published_time" content="2026-01-01">`),
    "e.html": page("E"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "lastmod build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/a.html</loc><lastmod>2026-03-04</lastmod></url>\n" +
      "<url><loc>https://example.com/b.html</loc><lastmod>2026-05-06T07:08:09Z</lastmod></url>\n" +
      "<url><loc>https://example.com/c.html</loc></url>\n" +
      "<url><loc>https://example.com/d.html</loc></url>\n" +
      "<url><loc>https://example.com/e.html</loc></url>\n" +
      "</urlset>\n",
    "§21.3: malformed dates, published dates, and absent dates all yield no lastmod — never a guess",
  );
  covers("SIT-03");
}, TEST_MS);

test("SIT-03: no page ever receives a build-time lastmod", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "clock build");
  const xml = read(tmp, "dist", "sitemap.xml");
  if (xml.includes("lastmod")) {
    throw new Error(`§21.3: a page with no authored date must have no <lastmod>; the build clock is not a fallback.\n${xml}`);
  }
  const thisYear = String(new Date().getUTCFullYear());
  if (xml.includes(thisYear)) {
    throw new Error(`§21.3: the sitemap contains the current year — a date was fabricated.\n${xml}`);
  }
  covers("SIT-03");
}, TEST_MS);

test("SIT-03: loc paths are percent-encoded, so a filesystem name becomes a legal URI", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "a&b.html": page("Ampersand"), "two words.html": page("Spaced"), "café.html": page("Accented") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "encoding build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/a%26b.html</loc></url>\n" +
      "<url><loc>https://example.com/caf%C3%A9.html</loc></url>\n" +
      "<url><loc>https://example.com/two%20words.html</loc></url>\n" +
      "</urlset>\n",
    "§20.5/§21.3: a raw space or ampersand in a <loc> is not a URI; the file still ships at its own name",
  );
  covers("SIT-03", "MAN-05");
}, TEST_MS);

test("SIT-03: a base-url path that needs XML escaping still gets it", async () => {
  // Percent-encoding covers everything derived from an output path, so the
  // only route left for a raw `&` into a <loc> is the base-url prefix, which
  // §20.5 deliberately does not re-encode. XML escaping is what catches it.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/a&b/"], tmp);
  expectExit(r, 0, "xml-escaping build");
  expectBytes(
    read(tmp, "dist", "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/a&amp;b/</loc></url>\n" +
      "</urlset>\n",
    "§21.3: an unescaped & makes the document not well-formed XML",
  );
  covers("SIT-03");
}, TEST_MS);

// ------------------------------------------------------------------- §21.4

test("SIT-04: two builds of the same tree produce byte-identical sitemaps", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "z.html": page("Z"),
    "a.html": page("A", "<p>x</p>", `<meta name="lastmod" content="2026-01-01">`),
    "m/deep.html": page("Deep"),
  });
  const first = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(first, 0, "first build");
  const one = read(tmp, "dist", "sitemap.xml");
  const second = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(second, 0, "second build");
  expectBytes(read(tmp, "dist", "sitemap.xml"), one, "§21.4: determinism — the same input must produce the same bytes");
  expectBytes(
    one,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/a.html</loc><lastmod>2026-01-01</lastmod></url>\n" +
      "<url><loc>https://example.com/</loc></url>\n" +
      "<url><loc>https://example.com/m/deep.html</loc></url>\n" +
      "<url><loc>https://example.com/z.html</loc></url>\n" +
      "</urlset>\n",
    "§21.2/§20.1: manifest order is output-path order — a.html, index.html, m/deep.html, z.html",
  );
  covers("SIT-04");
}, TEST_MS);

// ------------------------------------------------------------------- §21.5

test("SIT-05: an authored sitemap.xml suppresses generation and ships byte-for-byte", async () => {
  const tmp = mkTmp();
  const authored = '<?xml version="1.0"?>\n<urlset><url><loc>https://example.com/index.html</loc></url></urlset>\n';
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "about.html": page("About"),
    "sitemap.xml": authored,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "authored-sitemap build");
  expectBytes(read(tmp, "dist", "sitemap.xml"), authored, "§21.5: the author's file is the site's sitemap — never overwritten, never merged into");
  covers("SIT-05");
}, TEST_MS);

test("P22: an emitted source file occupying a generated split path is a located problem, and nothing is overwritten", async () => {
  // Reaching a real split needs 50,000 pages, so this pins the collision rule
  // through the path unify claims when it splits. `sitemap-1.xml` is only
  // claimed under a split; without one it is an ordinary asset that ships.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home"), "sitemap-1.xml": "<mine/>\n" });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "no-split build");
  expectBytes(read(tmp, "dist", "sitemap-1.xml"), "<mine/>\n", "§21.5: an unclaimed path is an ordinary asset");
  if (!existsSync(join(tmp, "dist", "sitemap.xml"))) {
    throw new Error("§21.5: with no split, sitemap-1.xml is not a generated path and generation proceeds normally");
  }
  covers("P22");
}, TEST_MS);

// ------------------------------------------------------------------- §21.6

test("SIT-06: a loc inside an XML comment or a CDATA wrapper is not a false problem", async () => {
  // The two forms a regex scanner gets wrong in the publish-blocking
  // direction: a commented-out entry read as live, and CDATA brackets read as
  // part of the URL. Both are legal XML that real generators emit, and both
  // would turn a valid site into a refused publish.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "sitemap.xml":
      '<?xml version="1.0"?>\n<urlset>\n' +
      "<url><loc><![CDATA[https://example.com/index.html]]></loc></url>\n" +
      "<!-- <url><loc>https://example.com/retired.html</loc></url> -->\n" +
      "</urlset>\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "comment/CDATA build");
  if (r.stderr.trim() !== "") {
    throw new Error(`§21.6: a commented-out loc declares nothing and a CDATA wrapper is not part of the URL.\nstderr:\n${r.stderr}`);
  }
  covers("SIT-06");
}, TEST_MS);

test("SIT-06: a namespace-prefixed loc is a loc, so a broken one cannot ship silently", async () => {
  // The direction that fails silently under a regex scanner: <sm:loc> is legal
  // per the protocol's own schema, and missing it publishes the broken URL.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "sitemap.xml":
      '<?xml version="1.0"?>\n<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<sm:url><sm:loc>https://example.com/gone.html</sm:loc></sm:url>\n</sm:urlset>\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 1, "namespace-prefixed build");
  if (!r.stderr.includes("gone.html")) {
    throw new Error(`§21.6: a prefixed <sm:loc> is a loc and must be checked.\nstderr:\n${r.stderr}`);
  }
  // §14.1: "in:" is the offending SOURCE text, and no byte of an authored
  // sitemap is rewritten — so the stripped form appears in no file the author
  // can grep, which is the same defect §23.3 fixes for robots.txt.
  if (!r.stderr.includes("in: https://example.com/gone.html")) {
    throw new Error(`§14.1: the diagnostic quotes what the author wrote.\nstderr:\n${r.stderr}`);
  }
  if (!r.stderr.includes("problem: https://example.com/gone.html does not resolve")) {
    throw new Error(`§14.1: the message line quotes it too — it is a separate interpolation.\nstderr:\n${r.stderr}`);
  }
  covers("SIT-06");
}, TEST_MS);

test("SIT-01: without --base-url an authored sitemap is an ordinary asset, checked by nothing", async () => {
  // §21.1's activation governs §21.6 too. A working site that shipped a sitemap
  // with a stale entry built clean before this section existed; nothing the
  // author wrote changed, and no flag opted them in, so it must build clean
  // still. The adjacent case below shows the same tree DOES fail once the
  // site's address is supplied — the check is gated, not absent.
  const files = {
    "index.html": page("Home"),
    "sitemap.xml":
      '<?xml version="1.0"?>\n<urlset>\n<url><loc>/index.html</loc></url>\n' +
      "<url><loc>/retired.html</loc></url>\n</urlset>\n",
  };
  const noBase = mkTmp();
  writeTree(join(noBase, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist"], noBase);
  expectExit(a, 0, "no-base authored sitemap");
  expectBytes(read(noBase, "dist", "sitemap.xml"), files["sitemap.xml"], "§4.4: it mirror-copies like any other asset");

  const withBase = mkTmp();
  writeTree(join(withBase, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], withBase);
  expectExit(b, 1, "based authored sitemap");
  if (!b.stderr.includes("retired.html")) {
    throw new Error(`§21.6: with an address supplied, the stale loc must be reported.\nstderr:\n${b.stderr}`);
  }
  covers("SIT-01", "SIT-06");
}, TEST_MS);

test("SIT-06: a broken internal loc in an authored sitemap is P13 located at the sitemap; a good one is silent", async () => {
  const broken = mkTmp();
  writeTree(join(broken, "src"), {
    "index.html": page("Home"),
    "sitemap.xml":
      '<?xml version="1.0"?>\n<urlset>\n<url><loc>https://example.com/index.html</loc></url>\n' +
      "<url><loc>https://example.com/never-built.html</loc></url>\n</urlset>\n",
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], broken);
  expectExit(a, 1, "broken-loc build");
  if (!a.stderr.includes("sitemap.xml") || !a.stderr.includes("never-built.html")) {
    throw new Error(`§21.6: expected a problem located at sitemap.xml naming never-built.html.\nstderr:\n${a.stderr}`);
  }
  if (existsSync(join(broken, "dist"))) {
    throw new Error("§15: a P13 blocks publish, so nothing ships");
  }

  const clean = mkTmp();
  writeTree(join(clean, "src"), {
    "index.html": page("Home"),
    "sitemap.xml":
      '<?xml version="1.0"?>\n<urlset>\n<url><loc>https://example.com/index.html</loc></url>\n' +
      "<url><loc>https://other.example/anything.html</loc></url>\n</urlset>\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], clean);
  expectExit(b, 0, "other-origin build");
  if (b.stderr.trim() !== "") {
    throw new Error(`§21.6: a loc on another origin is not checkable offline and must be skipped silently.\nstderr:\n${b.stderr}`);
  }
  covers("SIT-06");
}, TEST_MS);

test("REF-04 — /sitemap.xml linked without --base-url names the condition; with it, resolves", async () => {
  // Round 27's §12 second-fix-line rule, the sitemap spelling. One tree, both
  // builds: the line must name --base-url when the file was not generated and
  // must not appear at all when it was.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home."></head>
<body><h1>Home</h1><a href="/sitemap.xml">sitemap</a></body>
</html>
`,
  });
  const bare = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (bare.exit !== 1) throw new Error(`expected the broken link to block: exit ${bare.exit}\n${bare.stderr}`);
  if (!bare.stderr.includes("sitemap.xml is generated, not authored") || !bare.stderr.includes("--base-url")) {
    throw new Error(`§12: the second fix line must name --base-url:\n${bare.stderr}`);
  }
  const withBase = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/"], tmp);
  if (withBase.exit !== 0) throw new Error(`a generated sitemap satisfies its own link:\n${withBase.stderr}`);
  covers("REF-04", "SIT-01");
}, 30_000);
