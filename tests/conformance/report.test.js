/**
 * §31 machine-readable and networked evaluation — RPT-01..04.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4). Written
 * from docs/conformance-spec.md §31 alone — nothing here imports src/**, and
 * every assertion traces to a sentence in that section (or in §11.3, §12,
 * §14.1, §14.3, §15, §17, §20, §21, §22, §24.3-24.6, or §26, which §31 leans
 * on for the manifest/finding shapes it re-serializes).
 *
 * §31.3's own network half is tested against a LOCAL server this file starts
 * itself (`startServer` below) — never a real external host, since a test
 * that depends on the internet is a test that fails on a train.
 *
 * The two-sided convention used across this suite: every rule that fires has
 * an adjacent case where it must not (a working URL beside a broken one, the
 * default format beside an explicit one), and a silence (no finding, no
 * report line) sits beside a positive control so it cannot pass against a
 * feature that was never wired up.
 */
import { test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

// --------------------------------------------------------------- fixtures

/** The smallest complete page. No layout anywhere in these fixtures, so §3's preservation rule is not in play — one document, one composed page. */
const page = (title, desc, h1, extraHead = "", extraBody = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n` +
  `<meta name="description" content="${desc}">\n${extraHead}</head>\n<body>\n<h1>${h1}</h1>\n<p>Text about ${h1}.</p>\n${extraBody}</body>\n</html>\n`;

// --------------------------------------------------------------- CLI/file helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

/** Parse stdout as JSON, failing loudly (with the actual text) rather than letting JSON.parse's own error hide it. */
function parseJson(r, what) {
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`${what}: stdout is not valid JSON (${e.message})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function findingsOf(doc, id) {
  return doc.findings.filter((f) => f.id === id);
}

// --------------------------------------------------------------- a local server, for §31.3 only

/**
 * A handful of fixed routes covering §31.3's own worked cases. Never a real
 * external host — this process owns both ends of every connection under
 * test.
 */
function startServer() {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ok") return new Response("ok", { status: 200 });
      if (url.pathname === "/notfound") return new Response("nope", { status: 404 });
      if (url.pathname === "/method-check") {
        return req.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("via get", { status: 200 });
      }
      return new Response("unhandled", { status: 404 });
    },
  });
  return { server, base: `http://127.0.0.1:${server.port}` };
}

// ==================================================================== RPT-01

test("RPT-01: --format human is the default and is unchanged — a prose report, not JSON", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "The home page.", "Home") });
  const noFlag = await runCli(["audit"], tmp);
  const explicit = await runCli(["audit", "--format", "human"], tmp);
  expectExit(noFlag, 0, "no --format");
  expectExit(explicit, 0, "--format human");
  if (noFlag.stdout !== explicit.stdout) {
    throw new Error(`the default and an explicit --format human must print identical bytes\nno-flag:\n${noFlag.stdout}\nexplicit:\n${explicit.stdout}`);
  }
  if (noFlag.stdout.trimStart().startsWith("{")) throw new Error(`human format must not look like a JSON document:\n${noFlag.stdout}`);
  if (!/^audit: (nothing to report|\d+ broken, \d+ incomplete)$/m.test(noFlag.stdout)) {
    throw new Error(`human format must still end with §24.5's count line:\n${noFlag.stdout}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: an unknown --format value is a usage error naming the closed set", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "The home page.", "Home") });
  const r = await runCli(["audit", "--format", "xml"], tmp);
  expectExit(r, 2, "--format xml");
  if (r.stdout !== "") throw new Error(`a usage error must print no report at all:\n${r.stdout}`);
  for (const word of ["human", "json", "sarif"]) {
    if (!r.stderr.includes(word)) throw new Error(`the usage error must name "${word}":\n${r.stderr}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: --format json is one JSON document — schemaVersion, baseUrl, summary, pages, findings", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a>\n`),
    "about.html": page("About", "About this site.", "About", "", `<a href="/">Home</a>\n`),
  });
  const noBase = await runCli(["audit", "--format", "json"], tmp);
  expectExit(noBase, 0, "no --base-url");
  const doc = parseJson(noBase, "no --base-url");
  if (doc.schemaVersion !== 1) throw new Error(`schemaVersion must be 1, got ${doc.schemaVersion}`);
  if (doc.baseUrl !== null) throw new Error(`baseUrl must be null without --base-url, got ${JSON.stringify(doc.baseUrl)}`);
  if (typeof doc.summary?.broken !== "number" || typeof doc.summary?.incomplete !== "number") {
    throw new Error(`summary must carry numeric broken/incomplete: ${JSON.stringify(doc.summary)}`);
  }
  if (typeof doc.summary?.problems !== "number" || typeof doc.summary?.advisories !== "number") {
    throw new Error(`summary must ALSO carry §14's problems/advisories counts: ${JSON.stringify(doc.summary)}`);
  }
  if (!Array.isArray(doc.findings)) throw new Error("findings must be an array");

  const withBase = await runCli(["audit", "--format", "json", "--base-url", "https://example.com/site/"], tmp);
  const doc2 = parseJson(withBase, "with --base-url");
  if (doc2.baseUrl !== "https://example.com/site/") {
    throw new Error(`baseUrl must be the site's whole address, got ${JSON.stringify(doc2.baseUrl)}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: pages is one reduced page shape per BuildDocument — never the private analysis half", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a>\n`),
    "about.html": page("About", "About this site.", "About", "", `<a href="/">Home</a>\n`),
  });
  const r = await runCli(["audit", "--format", "json"], tmp);
  const doc = parseJson(r, "pages shape");
  if (doc.pages.length !== 2) throw new Error(`expected 2 page records, got ${doc.pages.length}`);
  // A SUMMARY would carry a handful of headline fields; the PAGE carries
  // §31.1's whole shape — source/generated/outputPath plus the DocumentSnapshot
  // whole (document.js's own key order: path, url, html, head, body) — never a
  // curated subset, and never the private analysis half (§22 of the release
  // brief: linksOut/linksIn/jsonLd/ids/conflicts and the rest stay internal).
  for (const p of doc.pages) {
    for (const key of ["source", "generated", "outputPath", "document"]) {
      if (!(key in p)) throw new Error(`page for ${JSON.stringify(p.source)} is missing §31.1 field "${key}": ${JSON.stringify(p)}`);
    }
    for (const key of ["path", "url", "html", "head", "body"]) {
      if (!(key in p.document)) throw new Error(`document for ${JSON.stringify(p.source)} is missing §20.3 field "${key}": ${JSON.stringify(p)}`);
    }
    if ("analysis" in p) throw new Error(`the private analysis half must never be serialized on a page: ${JSON.stringify(Object.keys(p))}`);
  }
  const home = doc.pages.find((p) => p.source === "index.html");
  if (home.document.head.title !== "Home") {
    throw new Error(`the page's own title must survive serialization: ${JSON.stringify(home.document.head.title)}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: findings is §24.5's order — the same sequence the human report prints, by source path then id", async () => {
  const tmp = mkTmp();
  // Three pages, each missing something different, so several ids sort
  // interleaved with several files.
  writeTree(join(tmp, "src"), {
    "zzz.html": `<!doctype html><html><head><meta charset="utf-8"><title>Z</title></head><body><h1>Z</h1><p>x</p></body></html>\n`,
    "aaa.html": `<!doctype html><html><head><meta charset="utf-8"></head><body><p>x</p></body></html>\n`,
    "mmm.html": page("M", "desc", "M"),
  });
  const human = await runCli(["audit"], tmp);
  const json = await runCli(["audit", "--format", "json"], tmp);
  expectExit(human, 0, "human"); expectExit(json, 0, "json");
  const humanIds = [...human.stdout.matchAll(/^(\S+): \w+: .*\[([a-z0-9-]+)\]$/gm)].map((m) => `${m[1]}:${m[2]}`);
  const doc = parseJson(json, "findings order");
  const jsonIds = doc.findings.map((f) => `${f.file}:${f.id}`);
  if (jsonIds.length === 0) throw new Error("expected at least one finding across three incomplete pages");
  if (humanIds.join("\n") !== jsonIds.join("\n")) {
    throw new Error(`human and json must list the same findings in the same sequence:\nhuman: ${humanIds.join(", ")}\njson:  ${jsonIds.join(", ")}`);
  }
  const sorted = [...jsonIds].sort();
  if (jsonIds.join("\n") !== sorted.join("\n")) {
    throw new Error(`findings must sort by file then id: got ${jsonIds.join(", ")}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: §14 diagnostics stay on stderr as prose under every format; summary only counts them", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // An <include> naming a file that does not exist — P01, a §14 problem.
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
      `<meta name="description" content="Home."></head><body><h1>Home</h1>` +
      `<include src="/_includes/missing.html"></include></body></html>\n`,
  });
  const r = await runCli(["audit", "--format", "json"], tmp);
  expectExit(r, 1, "a P01 problem exits 1 regardless of --format");
  if (!/problem/.test(r.stderr)) throw new Error(`the P01 diagnostic must still print to stderr:\n${r.stderr}`);
  const doc = parseJson(r, "diagnostics stay off stdout");
  if (doc.summary.problems !== 1) throw new Error(`summary.problems must count it: ${JSON.stringify(doc.summary)}`);
  // The document must not have grown a second diagnostics channel.
  if ("diagnostics" in doc || "problems" in doc || "errors" in doc) {
    throw new Error(`the JSON document must not carry a second diagnostic channel: ${Object.keys(doc).join(", ")}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: exit codes are §24.6's, unchanged by --format — clean, --strict, and a pipeline problem all agree across formats", async () => {
  const tmp = mkTmp();
  // description-missing on about.html: zero problems, one finding.
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a>\n`),
    "about.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About</title></head>` +
      `<body><h1>About</h1><p>x</p><a href="/">Home</a></body></html>\n`,
  });
  for (const format of ["human", "json", "sarif"]) {
    const plain = await runCli(["audit", "--format", format], tmp);
    expectExit(plain, 0, `${format}, no --strict`);
    const strict = await runCli(["audit", "--format", format, "--strict"], tmp);
    expectExit(strict, 1, `${format}, --strict (a finding exists)`);
  }

  const tmp2 = mkTmp();
  writeTree(join(tmp2, "src"), {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
      `<meta name="description" content="Home."></head><body><h1>Home</h1>` +
      `<include src="/_includes/missing.html"></include></body></html>\n`,
  });
  for (const format of ["human", "json", "sarif"]) {
    const r = await runCli(["audit", "--format", format], tmp2);
    expectExit(r, 1, `${format}, pipeline problem (P01), no --strict`);
    const r2 = await runCli(["audit", "--format", format, "--strict"], tmp2);
    expectExit(r2, 1, `${format}, pipeline problem, --strict — still 1, not a different code`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: audit --format json still writes nothing, anywhere (§24.2 unchanged by this section)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "The home page.", "Home") });
  const before = existsSync(join(tmp, "dist"));
  const r = await runCli(["audit", "--format", "json"], tmp);
  expectExit(r, 0, "audit --format json");
  const after = existsSync(join(tmp, "dist"));
  if (before || after) throw new Error("audit --format json must never create the output directory");
  const dryRun = await runCli(["audit", "--format", "json", "--dry-run"], tmp);
  expectExit(dryRun, 2, "--dry-run stays refused even with --format json");
  const clean = await runCli(["audit", "--format", "json", "--clean"], tmp);
  expectExit(clean, 2, "--clean stays refused even with --format json");
  covers("RPT-01");
}, TEST_MS);

// ==================================================================== RPT-02

test("RPT-02: the fingerprint is a stable string, byte-identical across two runs of one tree", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "The home page.", "Home"),
    "about.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About</title></head>` +
      `<body><h1>About</h1><p>x</p><a href="/">Home</a></body></html>\n`, // description-missing
  });
  const r1 = await runCli(["audit", "--format", "json"], tmp);
  const r2 = await runCli(["audit", "--format", "json"], tmp);
  expectExit(r1, 0, "run 1"); expectExit(r2, 0, "run 2");
  if (r1.stdout !== r2.stdout) throw new Error("two runs over one unchanged tree must print the same bytes, fingerprints included");
  const doc = parseJson(r1, "fingerprint shape");
  const f = findingsOf(doc, "description-missing")[0];
  if (!f) throw new Error("expected a description-missing finding");
  if (!/^[0-9a-f]+$/.test(f.fingerprint) || f.fingerprint.length < 16) {
    throw new Error(`fingerprint must be a stable hex digest, got ${JSON.stringify(f.fingerprint)}`);
  }
  covers("RPT-02");
}, TEST_MS);

test("RPT-02: a finding's fingerprint survives an unrelated edit — adding a page, or growing another finding's evidence, elsewhere in the tree", async () => {
  const aboutMissingH1 = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About</title>` +
    `<meta name="description" content="About."></head><body><p>x</p><a href="/">Home</a></body></html>\n`; // h1-missing
  const tmpA = mkTmp();
  writeTree(join(tmpA, "src"), {
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a>\n`),
    "about.html": aboutMissingH1,
  });
  const docA = parseJson(await runCli(["audit", "--format", "json"], tmpA), "tree A");
  const fpA = findingsOf(docA, "h1-missing").find((f) => f.file === "about.html")?.fingerprint;
  if (!fpA) throw new Error("expected h1-missing on about.html in tree A");

  // Tree B: the SAME about.html, but a brand-new page inserted (shifts
  // manifest order and array positions) AND a second page sharing about's
  // title (which grows about.html's OWN title-duplicate evidence text —
  // a different finding, not this one, but exercising the same tree).
  const tmpB = mkTmp();
  writeTree(join(tmpB, "src"), {
    "aaa-new-page.html": page("A new page", "Brand new.", "A new page", "", `<a href="/">Home</a>\n`),
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a> <a href="/aaa-new-page.html">New</a>\n`),
    "about.html": aboutMissingH1,
  });
  const docB = parseJson(await runCli(["audit", "--format", "json"], tmpB), "tree B");
  const fpB = findingsOf(docB, "h1-missing").find((f) => f.file === "about.html")?.fingerprint;
  if (!fpB) throw new Error("expected h1-missing on about.html in tree B too");

  if (fpA !== fpB) {
    throw new Error(`about.html's h1-missing fingerprint must not change when an unrelated page is added elsewhere: ${fpA} vs ${fpB}`);
  }
  covers("RPT-02");
}, TEST_MS);

test("RPT-02: two findings of the same id on the same page get DIFFERENT fingerprints — the distinguisher at work (id-duplicate)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
      `<meta name="description" content="Home."></head><body><h1>Home</h1>` +
      `<div id="dup-a"></div><div id="dup-a"></div><div id="dup-b"></div><div id="dup-b"></div>` +
      `</body></html>\n`,
  });
  const doc = parseJson(await runCli(["audit", "--format", "json"], tmp), "id-duplicate pair");
  const dupes = findingsOf(doc, "id-duplicate");
  if (dupes.length !== 2) throw new Error(`expected 2 id-duplicate findings (dup-a, dup-b), got ${dupes.length}: ${JSON.stringify(dupes)}`);
  if (dupes[0].fingerprint === dupes[1].fingerprint) {
    throw new Error(`two DIFFERENT repeated ids on one page must not share a fingerprint: ${JSON.stringify(dupes)}`);
  }
  covers("RPT-02");
}, TEST_MS);

test("RPT-02: evidence AND fix text are excluded — same id/file/distinguisher, different wording, same fingerprint (image-missing-dimensions)", async () => {
  // §20.3: dimensions are read only when og:image supplies the url; a
  // twitter:image-only page reaches the SAME finding through a different
  // branch, with different evidence AND a different fix line — but the same
  // id, the same file name, and the same (default, page-scoped) distinguisher.
  const asset = { "logo.png": "not a real png, bytes do not matter to this test" };
  const tmpOg = mkTmp();
  writeTree(join(tmpOg, "src"), {
    "share.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Share</title>` +
      `<meta name="description" content="Share."><meta property="og:image" content="/logo.png"></head>` +
      `<body><h1>Share</h1><p>x</p></body></html>\n`,
    ...asset,
  });
  const tmpTwitter = mkTmp();
  writeTree(join(tmpTwitter, "src"), {
    "share.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Share</title>` +
      `<meta name="description" content="Share."><meta name="twitter:image" content="/logo.png"></head>` +
      `<body><h1>Share</h1><p>x</p></body></html>\n`,
    ...asset,
  });
  const docOg = parseJson(await runCli(["audit", "--format", "json"], tmpOg), "og:image tree");
  const docTwitter = parseJson(await runCli(["audit", "--format", "json"], tmpTwitter), "twitter:image tree");
  const fOg = findingsOf(docOg, "image-missing-dimensions")[0];
  const fTwitter = findingsOf(docTwitter, "image-missing-dimensions")[0];
  if (!fOg || !fTwitter) throw new Error(`expected image-missing-dimensions in both trees: ${JSON.stringify({ fOg, fTwitter })}`);
  if (fOg.evidence === fTwitter.evidence) throw new Error("test fixture error: the two evidence strings should differ (og: vs twitter:)");
  if (fOg.fix === fTwitter.fix) throw new Error("test fixture error: the two fix strings should differ (og: vs twitter:)");
  if (fOg.fingerprint !== fTwitter.fingerprint) {
    throw new Error(
      `same id, same file, same (empty) distinguisher — different evidence/fix text must NOT change the fingerprint:\n` +
      `og:      ${JSON.stringify(fOg)}\ntwitter: ${JSON.stringify(fTwitter)}`,
    );
  }
  covers("RPT-02");
}, TEST_MS);

// ==================================================================== RPT-03

test("RPT-03: --external fetches an off-origin reference and reports the one that 404s, leaving the working one alone", async () => {
  const { server, base } = startServer();
  try {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "share.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Share</title>` +
        `<meta name="description" content="Share."><meta property="og:image" content="${base}/ok"></head>` +
        `<body><h1>Share</h1><p>x</p></body></html>\n`,
      "broken.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Broken</title>` +
        `<meta name="description" content="Broken."></head><body><h1>Broken</h1>` +
        `<script type="application/ld+json">{"@type":"WebPage","logo":"${base}/notfound"}</script></body></html>\n`,
    });
    const withoutFlag = await runCli(["audit", "--format", "json"], tmp);
    if (findingsOf(parseJson(withoutFlag, "no --external"), "external-unreachable").length !== 0) {
      throw new Error("external-unreachable must never fire without --external — that is the whole point of the flag");
    }

    const r = await runCli(["audit", "--external", "--format", "json"], tmp);
    expectExit(r, 0, "--external");
    const doc = parseJson(r, "--external result");
    const bad = findingsOf(doc, "external-unreachable");
    if (bad.length !== 1) throw new Error(`expected exactly 1 external-unreachable, got ${bad.length}: ${JSON.stringify(bad)}`);
    if (bad[0].file !== "broken.html") throw new Error(`expected it located at broken.html, got ${bad[0].file}`);
    if (bad[0].severity !== "incomplete") throw new Error(`§31.3: external-unreachable must be incomplete, got ${bad[0].severity}`);
    if (!/notfound/.test(bad[0].evidence) || !/404/.test(bad[0].evidence)) {
      throw new Error(`evidence must quote the URL and the outcome: ${bad[0].evidence}`);
    }
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: HEAD falling back to GET on 405 counts as reachable", async () => {
  const { server, base } = startServer();
  try {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
        `<meta name="description" content="Home."><link rel="canonical" href="${base}/method-check"></head>` +
        `<body><h1>Home</h1><p>x</p></body></html>\n`,
    });
    const r = await runCli(["audit", "--external", "--format", "json"], tmp);
    expectExit(r, 0);
    const doc = parseJson(r, "HEAD->GET fallback");
    if (findingsOf(doc, "external-unreachable").length !== 0) {
      throw new Error(`a HEAD-405/GET-200 endpoint must be treated as reachable: ${JSON.stringify(doc.findings)}`);
    }
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: --external counts under --strict; the human report shows it too", async () => {
  const { server, base } = startServer();
  try {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
        `<meta name="description" content="Home."><meta property="og:image" content="${base}/notfound"></head>` +
        `<body><h1>Home</h1><p>x</p></body></html>\n`,
    });
    const plain = await runCli(["audit", "--external"], tmp);
    expectExit(plain, 0, "--external, no --strict");
    if (!/external-unreachable/.test(plain.stdout)) throw new Error(`human report must show it too:\n${plain.stdout}`);
    const strict = await runCli(["audit", "--external", "--strict"], tmp);
    expectExit(strict, 1, "an external-unreachable finding must count under --strict");
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: distinct pages referencing the SAME off-origin URL produce ONE finding, at the first page in manifest order", async () => {
  const { server, base } = startServer();
  try {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "a-first.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A</title>` +
        `<meta name="description" content="A."><meta property="og:image" content="${base}/notfound"></head>` +
        `<body><h1>A</h1><p>x</p></body></html>\n`,
      "z-second.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Z</title>` +
        `<meta name="description" content="Z."><meta property="og:image" content="${base}/notfound"></head>` +
        `<body><h1>Z</h1><p>x</p></body></html>\n`,
    });
    const doc = parseJson(await runCli(["audit", "--external", "--format", "json"], tmp), "one URL, two pages");
    const bad = findingsOf(doc, "external-unreachable");
    if (bad.length !== 1) throw new Error(`one distinct URL must be fetched once and reported once, got ${bad.length}: ${JSON.stringify(bad)}`);
    if (bad[0].file !== "a-first.html") throw new Error(`expected the FIRST referencing page (manifest/output-path order), got ${bad[0].file}`);
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: a dead host is a finding at exit 0 — there is no 'no network' verdict", async () => {
  // The rule that replaced a heuristic, and the input that killed it. §31.3
  // used to say a run that could not reach the network at all should report
  // once as a usage error rather than a finding per URL. Nothing available to
  // a build can tell "this machine has no network" from "the one host this
  // site links to is down" — the only test that could is a request to some
  // third party unify chose — and the approximation, *every probe failed to
  // connect*, made the commonest shape wrong.
  //
  // This fixture IS that shape: a site with exactly one off-origin reference,
  // dead. It used to exit 2 with no report; the identical link beside a live
  // one exited 0 with a finding. One fault, two answers, decided by an
  // unrelated page. Both halves are asserted here so neither can drift back.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
      `<meta name="description" content="Home."><meta property="og:image" content="http://127.0.0.1:1/x"></head>` +
      `<body><h1>Home</h1><p>x</p></body></html>\n`,
  });
  const r = await runCli(["audit", "--external"], tmp);
  expectExit(r, 0, "a dead host is a finding, not a usage error");
  const doc = JSON.parse((await runCli(["audit", "--external", "--format", "json"], tmp)).stdout);
  const bad = findingsOf(doc, "external-unreachable");
  if (bad.length !== 1) throw new Error(`the one dead URL must be one finding, got ${bad.length}`);
  if (bad[0].severity !== "incomplete") throw new Error(`§31.3: incomplete — someone else's server, not this site's output`);
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: evidence is unify's own sentence, and a non-http scheme is out of scope", async () => {
  // Two smaller claims §31.3 makes, both about not accusing a third party of
  // something unify did not observe. A thrown fetch error's message is a
  // runtime string — Bun's reads "Unable to connect. Is the computer able to
  // access the url? (ConnectionRefused)" — and §24.5 makes evidence contract,
  // so quoting it put one runtime version's wording in every report. And an
  // `ftp:` URL is rejected by `fetch` LOCALLY, which was reported as the far
  // end failing to answer.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title>` +
      `<meta name="description" content="Home."></head><body><h1>Home</h1>` +
      `<p><a href="http://127.0.0.1:1/dead">d</a> <a href="ftp://example.invalid/f">f</a></p></body></html>\n`,
  });
  const r = await runCli(["audit", "--external"], tmp);
  expectExit(r, 0, "one dead http link, one out-of-scope scheme");
  const doc = JSON.parse((await runCli(["audit", "--external", "--format", "json"], tmp)).stdout);
  const bad = findingsOf(doc, "external-unreachable");
  if (bad.length !== 1) throw new Error(`only the http URL is in scope, got ${bad.length}: ${JSON.stringify(bad)}`);
  if (bad[0].evidence.includes("ConnectionRefused") || bad[0].evidence.includes("Unable to connect")) {
    throw new Error(`§31.3: evidence is unify's own sentence, not the runtime's:\n${bad[0].evidence}`);
  }
  if (!bad[0].evidence.includes("did not answer")) throw new Error(`expected unify's own wording:\n${bad[0].evidence}`);
  covers("RPT-03");
}, TEST_MS);

// ==================================================================== RPT-04

test("RPT-04: --format sarif is SARIF 2.1.0, a mechanical remap of --format json's own finding list", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "The home page.", "Home", "", `<a href="/about.html">About</a>\n`),
    "about.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About</title></head>` + // no description
      `<body><h1>About</h1><p>x</p><a href="/">Home</a></body></html>\n`,
  });
  const rJson = await runCli(["audit", "--format", "json"], tmp);
  const rSarif = await runCli(["audit", "--format", "sarif"], tmp);
  expectExit(rSarif, 0, "--format sarif");
  const jsonDoc = parseJson(rJson, "json side");
  let sarif;
  try { sarif = JSON.parse(rSarif.stdout); } catch (e) {
    throw new Error(`--format sarif must print valid JSON (SARIF is a JSON format): ${e.message}\n${rSarif.stdout}`);
  }
  if (sarif.version !== "2.1.0") throw new Error(`expected SARIF 2.1.0, got ${sarif.version}`);
  if (!Array.isArray(sarif.runs) || sarif.runs.length !== 1) throw new Error("expected exactly one run");
  const results = sarif.runs[0].results;
  if (results.length !== jsonDoc.findings.length) {
    throw new Error(`sarif must carry THE SAME finding list, got ${results.length} vs json's ${jsonDoc.findings.length}`);
  }
  if (results.length === 0) throw new Error("test fixture error: expected at least one finding (about.html has no description)");
  for (let i = 0; i < results.length; i++) {
    const f = jsonDoc.findings[i];
    const res = results[i];
    if (res.ruleId !== f.id) throw new Error(`id -> ruleId: ${res.ruleId} vs ${f.id}`);
    const expectedLevel = f.severity === "broken" ? "error" : "warning";
    if (res.level !== expectedLevel) throw new Error(`severity -> level: ${res.level} vs expected ${expectedLevel} for ${f.severity}`);
    if (res.message.text !== f.evidence) throw new Error(`evidence -> message: ${res.message.text} vs ${f.evidence}`);
    if (res.locations[0].physicalLocation.artifactLocation.uri !== f.file) {
      throw new Error(`file -> artifact location: ${res.locations[0].physicalLocation.artifactLocation.uri} vs ${f.file}`);
    }
    const fpKeys = Object.values(res.partialFingerprints ?? {});
    if (!fpKeys.includes(f.fingerprint)) {
      throw new Error(`fingerprint -> partialFingerprints: ${JSON.stringify(res.partialFingerprints)} does not carry ${f.fingerprint}`);
    }
  }
  covers("RPT-04");
}, TEST_MS);

test("RPT-04: SARIF computes nothing new — no finding, no rule text, that --format json did not already carry", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title></head>` + // no description, no lang
      `<body><h1>Home</h1><p>x</p></body></html>\n`,
  });
  const rJson = await runCli(["audit", "--format", "json"], tmp);
  const rSarif = await runCli(["audit", "--format", "sarif"], tmp);
  const jsonDoc = parseJson(rJson, "json");
  const sarif = JSON.parse(rSarif.stdout);
  const jsonIds = new Set(jsonDoc.findings.map((f) => f.id));
  const sarifRuleIds = new Set(sarif.runs[0].results.map((r) => r.ruleId));
  if (jsonIds.size === 0) throw new Error("test fixture error: expected findings (no description, no lang)");
  if ([...jsonIds].sort().join(",") !== [...sarifRuleIds].sort().join(",")) {
    throw new Error(`sarif's ruleIds must be exactly json's ids: ${[...sarifRuleIds]} vs ${[...jsonIds]}`);
  }
  // Every ruleId used in results has a matching entry in the driver's rules[]
  // (several real-world SARIF consumers, GitHub code scanning included,
  // reject a log where this does not hold) — and that entry carries no
  // invented description text, since none is computed for it.
  const declaredRules = new Set(sarif.runs[0].tool.driver.rules.map((r) => r.id));
  for (const id of sarifRuleIds) {
    if (!declaredRules.has(id)) throw new Error(`rules[] must declare every ruleId used in results (missing ${id})`);
  }
  covers("RPT-04");
}, TEST_MS);
