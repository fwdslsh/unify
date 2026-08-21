/**
 * §31 machine-readable and networked evaluation — RPT-01..04.
 *
 * Written as an independent oracle, from docs/conformance-spec.md §31 alone
 * (leaning on §11.3, §12, §14.1/§14.3, §15, §17, §20, §21, §22 and §24.3-24.6
 * only for the shared vocabulary — problem/advisory, finding, manifest field,
 * fingerprint — that §31 itself points back at). Nothing here imports
 * src/**, and nothing here was written by reading the implementation: every
 * expected value below traces to a sentence in the spec, not to observed
 * output. Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 *
 * §31.3's network half is tested against a LOCAL Bun.serve() server this
 * file starts and stops itself, on 127.0.0.1 with an ephemeral port — never
 * a real external host, so the suite never depends on the internet or on
 * anyone else's uptime.
 *
 * The two-sided convention this suite already uses: every claim of silence
 * (no request, no finding, no diagnostic text in the JSON) sits beside a
 * positive control in the SAME run proving the mechanism was live — a
 * silent assertion against a feature nobody wired up proves nothing.
 */
import { test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

// --------------------------------------------------------------- fixtures

/** A complete page by default; pass `desc: null` (the default) to omit the description and draw description-missing. */
const page = ({ title, desc = null, h1, lang = "en", extraHead = "", body = "" }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title}</title>
${desc !== null ? `<meta name="description" content="${desc}">\n` : ""}${extraHead}</head>
<body>
<h1>${h1}</h1>
${body}
</body>
</html>
`;

/**
 * Three pages, two findings, deliberately no more: about.html omits its
 * description (description-missing, incomplete) and dup.html repeats one id
 * (id-duplicate, broken). Every page links to the other two, so nothing is
 * an orphan by accident and no unrelated finding can creep in. Source-path
 * order is about.html, dup.html, index.html — which is also the order §24.5
 * prints findings in, so this fixture pins ordering for free.
 */
function richTree() {
  return {
    "index.html": page({
      title: "Home", desc: "The home page.", h1: "Home",
      body: '<p>Welcome.</p><a href="/about.html">About</a> <a href="/dup.html">Dup</a>',
    }),
    "about.html": page({
      title: "About", h1: "About",
      body: '<p>About us.</p><a href="/">Home</a> <a href="/dup.html">Dup</a>',
    }),
    "dup.html": page({
      title: "Dup", desc: "The dup page.", h1: "Dup",
      body: '<p id="x">One.</p><p id="x">Two.</p><a href="/">Home</a> <a href="/about.html">About</a>',
    }),
  };
}

// --------------------------------------------------------------- helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${what}: expected one parseable JSON document (${e.message})\n--- text ---\n${text}`);
  }
}

/** Every finding §24.5's human report declares, in printed order. */
function humanFindings(stdout) {
  const re = /^(\S+): (broken|incomplete): (.*) \[([a-z0-9-]+)\]$/gm;
  return [...stdout.matchAll(re)].map((m) => ({ path: m[1], severity: m[2], evidence: m[3], id: m[4] }));
}

/**
 * §24.5 does not say whether a finding's source path is printed
 * source-root-relative or fixed relative to the working directory the way
 * §14.1 fixes a diagnostic's — an existing open question in this suite
 * (see structured-data.test.js). This file takes no side on it: every
 * comparison below strips a leading "src/" from both operands before
 * comparing, so it pins §31 without also pinning that unrelated ambiguity.
 */
const bare = (p) => p.replace(/^(?:\.\/)?src\//, "");

// =============================================================== §31.1

test("RPT-01: --format json's findings match --format human's ids, severities and order on the same tree; --format human is the default", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), richTree());

  const human = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "human"], tmp);
  expectExit(human, 0, "explicit --format human");
  const noFlag = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(noFlag, 0, "no --format flag");
  if (noFlag.stdout !== human.stdout) {
    throw new Error(
      `§31.1: "--format human is the default and names the existing behaviour" — omitting the flag must print byte-identical stdout.\n--- default ---\n${noFlag.stdout}\n--- explicit human ---\n${human.stdout}`,
    );
  }

  const json = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(json, 0, "--format json");
  const data = parseJson(json.stdout, "§31.1: --format json");

  const hFindings = humanFindings(human.stdout);
  const hSeq = hFindings.map((f) => `${f.severity}:${f.id}`);
  const jSeq = data.findings.map((f) => `${f.severity}:${f.id}`);
  if (jSeq.length !== 2) throw new Error(`fixture check: richTree() must draw exactly 2 findings, got ${jSeq.length}\nstdout:\n${json.stdout}`);
  if (JSON.stringify(hSeq) !== JSON.stringify(jSeq)) {
    throw new Error(
      `§31.1: "findings is §24.5's order ... so the two formats list the same things in the same sequence".\nhuman: ${JSON.stringify(hSeq)}\njson:  ${JSON.stringify(jSeq)}`,
    );
  }
  data.findings.forEach((f, i) => {
    if (bare(f.file) !== bare(hFindings[i].path)) {
      throw new Error(`§31.1: finding ${i} names a different page across formats.\njson file: ${f.file}\nhuman path: ${hFindings[i].path}`);
    }
  });

  if (data.baseUrl !== null) throw new Error(`§31.1: "baseUrl is the address the build assumed ... null without the flag" — got ${JSON.stringify(data.baseUrl)}`);
  if (data.summary.broken !== 1 || data.summary.incomplete !== 1 || data.summary.problems !== 0 || data.summary.advisories !== 0) {
    throw new Error(`§31.1: summary must count exactly what richTree() draws.\nsummary: ${JSON.stringify(data.summary)}`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: pages holds one §20 record per emitted page, with the record's own fields, in manifest (output-path) order", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home", desc: "The home page.", h1: "Home", body: '<p>Welcome.</p><a href="/about.html">About</a>' }),
    "about.html": page({ title: "About Us", desc: "Who we are.", h1: "About", body: '<p>About.</p><a href="/">Home</a>' }),
    // Three things that must NOT become page records (§20.1): a fragment, a
    // mirror-copied asset, and a source the default --exclude holds back.
    "card.fragment.html": "<p>a fragment</p>\n",
    "style.css": "body{color:#000}\n",
    "_draft.html": page({ title: "Draft", desc: "d.", h1: "Draft", body: "<p>x</p>" }),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE, "--format", "json"], tmp);
  expectExit(r, 0, "two pages beside a fragment, an asset, and an excluded source");
  const data = parseJson(r.stdout, "§31.1");

  if (data.baseUrl !== BASE) throw new Error(`§31.1: baseUrl must be the address the build assumed, got ${JSON.stringify(data.baseUrl)}`);
  if (data.pages.length !== 2) {
    throw new Error(
      `§20.1: only composed pages have records — the fragment, the asset, and the excluded source must not appear.\npages: ${JSON.stringify(data.pages.map((p) => p.outputPath))}`,
    );
  }
  const [aboutRec, homeRec] = data.pages; // "about.html" sorts before "index.html"
  if (aboutRec.outputPath !== "about.html" || homeRec.outputPath !== "index.html") {
    throw new Error(`§20.1: pages must be in manifest (output-path) order.\ngot: ${data.pages.map((p) => p.outputPath).join(", ")}`);
  }

  if (bare(aboutRec.sourcePath) !== "about.html") throw new Error(`§20.3: sourcePath mismatch: ${JSON.stringify(aboutRec.sourcePath)}`);
  if (aboutRec.title !== "About Us") throw new Error(`§20.3: title mismatch: ${JSON.stringify(aboutRec.title)}`);
  if (aboutRec.description !== "Who we are.") throw new Error(`§20.3: description mismatch: ${JSON.stringify(aboutRec.description)}`);
  if (aboutRec.h1 !== "About") throw new Error(`§20.3: h1 mismatch: ${JSON.stringify(aboutRec.h1)}`);
  if (aboutRec.lang !== "en") throw new Error(`§20.3: lang mismatch: ${JSON.stringify(aboutRec.lang)}`);
  if (aboutRec.path !== "/about.html") throw new Error(`§20.5: path mismatch: ${JSON.stringify(aboutRec.path)}`);
  if (aboutRec.url !== "https://example.com/about.html") throw new Error(`§20.5: url mismatch: ${JSON.stringify(aboutRec.url)}`);
  if (homeRec.path !== "/" || homeRec.url !== "https://example.com/") {
    throw new Error(`§20.5: a trailing index.html segment must be dropped.\npath: ${homeRec.path}, url: ${homeRec.url}`);
  }
  if (!Array.isArray(aboutRec.headings) || aboutRec.headings.length !== 1 || aboutRec.headings[0].level !== 1 || aboutRec.headings[0].text !== "About") {
    throw new Error(`§20.3: headings must be the record's real array, not a derived summary.\nheadings: ${JSON.stringify(aboutRec.headings)}`);
  }
  // A spot check that this is the WHOLE record (§31.1: "the same record every
  // other feature reads, serialized"), not a curated subset of it.
  for (const key of ["sourcePath", "outputPath", "path", "url", "title", "description", "lang", "canonical", "robots", "h1", "headings", "text", "linksOut", "linksIn", "jsonLd", "ids", "conflicts", "taxonomyKeys"]) {
    if (!(key in aboutRec)) throw new Error(`§31.1: pages must carry the full §20 record — missing field "${key}"`);
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: an unrecognized --format value is a usage error naming the accepted values", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page({ title: "Home", desc: "d.", h1: "Home" }) });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "xml"], tmp);
  expectExit(r, 2, "an unrecognized --format value");
  if (!r.stderr.includes("human") || !r.stderr.includes("json")) {
    throw new Error(`§31.1: "any other value is a usage error naming both" — both accepted values must be named.\nstderr:\n${r.stderr}`);
  }
  // §31.1's own sentence says "naming both" (human, json), written before
  // §31.4 added sarif to the same flag. Whether the message must ALSO name
  // sarif is genuinely unclear from the text and is not asserted here — see
  // the ambiguity note in this file's final report.
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.2: a usage error must not create the output directory");
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: the exit code is identical between --format json and --format human, with and without --strict — for findings alone and for a pipeline problem", async () => {
  const onlyFinding = { "index.html": page({ title: "Home", h1: "Home" }) }; // desc omitted: one incomplete finding, zero problems
  const withProblem = {
    "index.html": page({ title: "Home", desc: "d.", h1: "Home", body: '<a href="/gone.html">gone</a>' }), // clean metadata, but a broken reference (a problem)
  };

  for (const [label, files, exitLoose, exitStrict] of [
    ["a findings-only tree", onlyFinding, 0, 1],
    ["a tree with a pipeline problem", withProblem, 1, 1],
  ]) {
    for (const strict of [false, true]) {
      const tmp = mkTmp();
      writeTree(join(tmp, "src"), files);
      const flags = strict ? ["--strict"] : [];
      const human = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "human", ...flags], tmp);
      const json = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json", ...flags], tmp);
      const want = strict ? exitStrict : exitLoose;
      if (human.exit !== want || json.exit !== want) {
        throw new Error(`§31.1/§24.6: ${label}, strict=${strict}: expected exit ${want} for both formats, got human=${human.exit} json=${json.exit}`);
      }
      if (human.exit !== json.exit) {
        throw new Error(`§31.1: "a format flag that changed an exit code would be a second policy" (${label}, strict=${strict}).`);
      }
    }
  }
  covers("RPT-01");
}, TEST_MS);

test("RPT-01: §14 diagnostics stay on stderr under every format; the JSON document never carries their text, only the summary count", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home", h1: "Home" }), // desc omitted: one finding, the positive control that `findings` is populated at all
    "design.psd": "not a real psd, just an extension\n", // A09: working-format file emitted
  });

  const json = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(json, 0, "one advisory beside one finding");
  if (!json.stderr.includes("design.psd") || !json.stderr.includes("advisory")) {
    throw new Error(`§24.5: A09 must still print to stderr during an audit — positive control that the advisory fired at all.\nstderr:\n${json.stderr}`);
  }
  if (json.stdout.includes("design.psd")) {
    throw new Error(`§31.1: "putting them in the document would make this a second diagnostic channel" — the JSON must never carry diagnostic text.\nstdout:\n${json.stdout}`);
  }
  const data = parseJson(json.stdout, "§31.1");
  if (data.summary.advisories !== 1) throw new Error(`§31.1: summary must still count the advisory.\nsummary: ${JSON.stringify(data.summary)}`);
  if (data.summary.problems !== 0) throw new Error(`§31.1: no problem was raised here.\nsummary: ${JSON.stringify(data.summary)}`);
  if (data.findings.length !== 1) throw new Error(`§31.1: the positive-control finding must still be present.\nfindings: ${JSON.stringify(data.findings)}`);
  if (data.findings.some((f) => /^[AP]\d\d$/.test(f.id))) {
    throw new Error(`§24.3: a diagnostic id must never appear as a finding id.\nfindings: ${JSON.stringify(data.findings.map((f) => f.id))}`);
  }

  const human = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "human"], tmp);
  if (human.stdout.includes("design.psd")) {
    throw new Error(`§24.5: the human finding list must not carry diagnostic text either.\nstdout:\n${human.stdout}`);
  }
  if (!human.stderr.includes("design.psd")) {
    throw new Error(`§24.5: "diagnostics keep their own stream" — stderr must carry it under --format human too.\nstderr:\n${human.stderr}`);
  }
  covers("RPT-01");
}, TEST_MS);

// =============================================================== §31.2

test("RPT-02: a finding's fingerprint survives ten blank lines inserted ABOVE the fault, and changes when the fault itself changes", async () => {
  const idDupPage = (idValue, blankLinesAbove = 0) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Dup</title>
<meta name="description" content="A page with a duplicate id.">
</head>
<body>
<h1>Dup</h1>
<p id="${idValue}">One.</p>
${"\n".repeat(blankLinesAbove)}<p id="${idValue}">Two.</p>
</body>
</html>
`;

  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": idDupPage("dup") });
  const r1 = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r1, 0, "the original page");
  const f1 = parseJson(r1.stdout, "run 1").findings.find((f) => f.id === "id-duplicate");
  if (!f1) throw new Error(`fixture check: expected an id-duplicate finding\nstdout:\n${r1.stdout}`);

  writeTree(join(tmp, "src"), { "index.html": idDupPage("dup", 10) });
  const r2 = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r2, 0, "the same fault, shifted ten lines down by ten blank lines above it");
  const f2 = parseJson(r2.stdout, "run 2").findings.find((f) => f.id === "id-duplicate");
  if (!f2) throw new Error(`fixture check: expected the finding to persist after the shift\nstdout:\n${r2.stdout}`);
  if (f2.fingerprint !== f1.fingerprint) {
    throw new Error(`§31.2: "it deliberately excludes line numbers" — a pure line shift above the fault must not change the fingerprint.\nbefore: ${f1.fingerprint}\nafter:  ${f2.fingerprint}`);
  }
  if (typeof f1.fingerprint !== "string" || f1.fingerprint.length === 0) {
    throw new Error(`§31.2: fingerprint must be a non-empty string.\ngot: ${JSON.stringify(f1.fingerprint)}`);
  }

  writeTree(join(tmp, "src"), { "index.html": idDupPage("other") });
  const r3 = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r3, 0, "a different repeated id — the fault itself changed, not merely its position");
  const f3 = parseJson(r3.stdout, "run 3").findings.find((f) => f.id === "id-duplicate");
  if (!f3) throw new Error(`fixture check: expected an id-duplicate finding\nstdout:\n${r3.stdout}`);
  if (f3.fingerprint === f1.fingerprint) {
    throw new Error(`§31.2: "the repeated id for id-duplicate" is the distinguisher — changing it must change the fingerprint.\nunchanged fingerprint: ${f3.fingerprint}`);
  }
  covers("RPT-02");
}, TEST_MS);

test("RPT-02: two different id-duplicate findings on the SAME page get different fingerprints (the sharp case)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Two Dupes</title>
<meta name="description" content="Two independent duplicate ids on one page.">
</head>
<body>
<h1>Two Dupes</h1>
<p id="a">1</p>
<p id="a">2</p>
<p id="b">3</p>
<p id="b">4</p>
</body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r, 0, "a page with two unrelated duplicate ids");
  const data = parseJson(r.stdout, "§31.2");
  const dupes = data.findings.filter((f) => f.id === "id-duplicate");
  if (dupes.length !== 2) {
    throw new Error(`§24.4: "one finding per repeated id" — expected 2 on this page, got ${dupes.length}\nstdout:\n${r.stdout}`);
  }
  if (dupes[0].file !== dupes[1].file) {
    throw new Error(`fixture check: both findings must be on the SAME page — this is the sharp case §31.2 names.\nfiles: ${dupes.map((d) => d.file).join(", ")}`);
  }
  if (dupes[0].fingerprint === dupes[1].fingerprint) {
    throw new Error(
      `§31.2: "the one datum that distinguishes it from its siblings on the same page — the repeated id for id-duplicate" — two different repeated ids must fingerprint differently.\nboth: ${dupes[0].fingerprint}`,
    );
  }
  covers("RPT-02");
}, TEST_MS);

// =============================================================== §31.3

test("RPT-03: an ordinary audit makes NO network request at all; --external fetches and reports only the failing target, as incomplete", async () => {
  const hits = { ok: 0, missing: 0 };
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/ok-target") { hits.ok++; return new Response(null, { status: 200 }); }
      if (u.pathname === "/missing-target") { hits.missing++; return new Response(null, { status: 404 }); }
      return new Response(null, { status: 404 });
    },
  });
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": page({
        title: "Home", desc: "The home page.", h1: "Home",
        body: `<p>Links.</p><a href="${origin}/ok-target">OK</a> <a href="${origin}/missing-target">Missing</a>`,
      }),
    });

    const noFlag = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
    expectExit(noFlag, 0, "an ordinary audit, no --external");
    if (hits.ok !== 0 || hits.missing !== 0) {
      throw new Error(`§31.3: "the ONLY unify operation that touches the network" is --external — an ordinary audit must make zero requests. hits=${JSON.stringify(hits)}`);
    }
    if (humanFindings(noFlag.stdout).some((f) => f.id === "external-unreachable")) {
      throw new Error(`§31.3: with no --external there is nothing to have checked these URLs, so no such finding can exist.\nstdout:\n${noFlag.stdout}`);
    }

    const withFlag = await runCli(["audit", "-s", "src", "-o", "dist", "--external"], tmp);
    expectExit(withFlag, 0, "--external, findings without --strict");
    if (hits.ok < 1 || hits.missing < 1) {
      throw new Error(`§31.3: --external must request BOTH off-origin targets (positive control that it ran at all). hits=${JSON.stringify(hits)}`);
    }
    const found = humanFindings(withFlag.stdout).filter((f) => f.id === "external-unreachable");
    if (found.length !== 1) {
      throw new Error(`§31.3: expected exactly one external-unreachable finding, got ${found.length}\nstdout:\n${withFlag.stdout}`);
    }
    if (!found[0].evidence.includes("missing-target")) {
      throw new Error(`§31.3: the finding must name the URL that failed.\nevidence: ${found[0].evidence}`);
    }
    if (found[0].evidence.includes("ok-target")) {
      throw new Error(`§31.3: the reachable target must never be named as a failure.\nevidence: ${found[0].evidence}`);
    }
    if (found[0].severity !== "incomplete") {
      throw new Error(`§31.3: "incomplete rather than broken ... the answer is about someone else's server" — got ${found[0].severity}`);
    }

    // The same finding, read through --format json — connects §31.1's format
    // contract to §31.3's own finding rather than trusting it only in prose.
    const jsonRun = await runCli(["audit", "-s", "src", "-o", "dist", "--external", "--format", "json"], tmp);
    const data = parseJson(jsonRun.stdout, "§31.3 under --format json");
    const jsonHit = data.findings.find((f) => f.id === "external-unreachable");
    if (!jsonHit || jsonHit.severity !== "incomplete" || !jsonHit.evidence.includes("missing-target")) {
      throw new Error(`§31.1/§31.3: the JSON document must carry the same finding.\nfindings: ${JSON.stringify(data.findings)}`);
    }

    const strict = await runCli(["audit", "-s", "src", "-o", "dist", "--external", "--strict"], tmp);
    expectExit(strict, 1, "§24.6: --strict gates on any finding, external ones included");
    if (existsSync(join(tmp, "dist"))) throw new Error("§24.2: --external must not write output either");
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: HEAD falling back to GET on 405 counts as reachable", async () => {
  const hits = { head: 0, get: 0 };
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/head-blocked") {
        if (req.method === "HEAD") { hits.head++; return new Response(null, { status: 405 }); }
        hits.get++;
        return new Response(null, { status: 200 });
      }
      if (u.pathname === "/really-gone") return new Response(null, { status: 404 });
      return new Response(null, { status: 404 });
    },
  });
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": page({
        title: "Home", desc: "d.", h1: "Home",
        body: `<a href="${origin}/head-blocked">A</a> <a href="${origin}/really-gone">B</a>`,
      }),
    });
    const r = await runCli(["audit", "-s", "src", "-o", "dist", "--external"], tmp);
    expectExit(r, 0, "one target reachable only via the GET fallback, one truly gone");
    const found = humanFindings(r.stdout).filter((f) => f.id === "external-unreachable");
    if (found.length !== 1 || !found[0].evidence.includes("really-gone")) {
      throw new Error(`§31.3: only the truly-404 target should be reported — the 405 must have been retried as GET.\nstdout:\n${r.stdout}`);
    }
    if (hits.head < 1) throw new Error(`§31.3: "requests are HEAD" — expected at least one HEAD attempt on the fallback target. hits=${JSON.stringify(hits)}`);
    if (hits.get < 1) throw new Error(`§31.3: "falling back to GET on 405" — expected at least one GET retry. hits=${JSON.stringify(hits)}`);
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

test("RPT-03: the report orders by manifest path, not by which response arrives first, and is stable across two runs", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/slow-404") { await Bun.sleep(120); return new Response(null, { status: 404 }); }
      if (u.pathname === "/fast-404") return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    },
  });
  try {
    const origin = `http://127.0.0.1:${server.port}`;
    const tmp = mkTmp();
    // a.html sorts FIRST by source path and points at the SLOW-resolving
    // target; z.html sorts LAST and points at the FAST one. Path order and
    // network-completion order therefore disagree by construction, so only
    // a sort keyed on §24.5's rule (not on response arrival) survives this.
    writeTree(join(tmp, "src"), {
      "index.html": page({ title: "Home", desc: "The home page.", h1: "Home", body: '<a href="/a.html">A</a> <a href="/z.html">Z</a>' }),
      "a.html": page({ title: "A", desc: "The A page.", h1: "A", body: `<a href="${origin}/slow-404">Slow</a> <a href="/">Home</a>` }),
      "z.html": page({ title: "Z", desc: "The Z page.", h1: "Z", body: `<a href="${origin}/fast-404">Fast</a> <a href="/">Home</a>` }),
    });
    const order = (stdout) => humanFindings(stdout).filter((f) => f.id === "external-unreachable").map((f) => f.evidence);

    const first = await runCli(["audit", "-s", "src", "-o", "dist", "--external"], tmp);
    expectExit(first, 0, "first run");
    const second = await runCli(["audit", "-s", "src", "-o", "dist", "--external"], tmp);
    expectExit(second, 0, "second run");

    const o1 = order(first.stdout);
    const o2 = order(second.stdout);
    if (o1.length !== 2) throw new Error(`fixture check: expected two external-unreachable findings\nstdout:\n${first.stdout}`);
    if (!o1[0].includes("slow-404") || !o1[1].includes("fast-404")) {
      throw new Error(
        `§31.3: "findings sort by §24.5's rule like every other" — a.html (path-first, network-slowest) must print before z.html (path-last, network-fastest).\norder: ${JSON.stringify(o1)}`,
      );
    }
    if (JSON.stringify(o1) !== JSON.stringify(o2)) {
      throw new Error(`§31.3: "two runs over one tree print the same bytes whatever the network did".\nrun 1: ${JSON.stringify(o1)}\nrun 2: ${JSON.stringify(o2)}`);
    }
  } finally {
    server.stop(true);
  }
  covers("RPT-03");
}, TEST_MS);

// =============================================================== §31.4

test("RPT-04: --format sarif parses as JSON, carries SARIF 2.1.0, and its ruleId set equals --format json's id set on the same tree", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), richTree());

  const j = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(j, 0, "--format json");
  const jsonData = parseJson(j.stdout, "--format json");

  const s = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "sarif"], tmp);
  expectExit(s, 0, "--format sarif");
  const sarif = parseJson(s.stdout, "§31.4: --format sarif");

  if (sarif.version !== "2.1.0") throw new Error(`§31.4: "mapped field for field into SARIF 2.1.0" — expected version "2.1.0", got ${JSON.stringify(sarif.version)}`);
  if (!Array.isArray(sarif.runs) || sarif.runs.length < 1) throw new Error(`§31.4: expected a SARIF runs array.\n${s.stdout}`);
  const results = sarif.runs.flatMap((run) => run.results ?? []);
  const ruleIds = new Set(results.map((r) => r.ruleId));
  const jsonIds = new Set(jsonData.findings.map((f) => f.id));
  const missingFromSarif = [...jsonIds].filter((id) => !ruleIds.has(id));
  const extraInSarif = [...ruleIds].filter((id) => !jsonIds.has(id));
  if (missingFromSarif.length || extraInSarif.length) {
    throw new Error(
      `§31.4: "the same finding list §31.1 serializes ... id to ruleId" — the mechanical-view claim.\nmissing from sarif: ${missingFromSarif}\nextra in sarif: ${extraInSarif}`,
    );
  }
  if (results.length !== jsonData.findings.length) {
    throw new Error(`§31.4: "nothing is computed for SARIF that is not computed for --format json" — result counts must match.\nsarif: ${results.length}, json: ${jsonData.findings.length}`);
  }
  covers("RPT-04");
}, TEST_MS);

test("RPT-04: SARIF's level mirrors severity, message mirrors evidence, partialFingerprints carries the fingerprint, and its exit code matches --format json's", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), richTree());

  const j = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  const jsonData = parseJson(j.stdout, "--format json");
  const s = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "sarif"], tmp);
  const sarif = parseJson(s.stdout, "--format sarif");
  if (j.exit !== s.exit) throw new Error(`§31.4: a format flag must not change the exit code. json=${j.exit} sarif=${s.exit}`);

  const results = sarif.runs.flatMap((run) => run.results ?? []);
  const byRule = new Map(results.map((r) => [r.ruleId, r]));
  for (const f of jsonData.findings) {
    const r = byRule.get(f.id);
    if (!r) throw new Error(`§31.4: no SARIF result found for finding id "${f.id}"`);
    const wantLevel = f.severity === "broken" ? "error" : "warning";
    if (r.level !== wantLevel) {
      throw new Error(`§31.4: "broken to error and incomplete to warning" — ${f.id} is ${f.severity}, expected level ${wantLevel}, got ${r.level}`);
    }
    if (r.message?.text !== f.evidence) {
      throw new Error(`§31.4: "evidence to the message".\nexpected: ${JSON.stringify(f.evidence)}\nactual:   ${JSON.stringify(r.message?.text)}`);
    }
    const fingerprintBlob = JSON.stringify(r.partialFingerprints ?? {});
    if (!fingerprintBlob.includes(f.fingerprint)) {
      throw new Error(`§31.4: "fingerprint to partialFingerprints" — the JSON fingerprint must appear in the SARIF result's partialFingerprints.\nfingerprint: ${f.fingerprint}\npartialFingerprints: ${fingerprintBlob}`);
    }
  }

  // §31.1: "exit codes are §24.6's, unchanged" applies to sarif too — a
  // format flag is not a second exit-code policy under --strict either.
  const jStrict = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json", "--strict"], tmp);
  const sStrict = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "sarif", "--strict"], tmp);
  if (jStrict.exit !== sStrict.exit) {
    throw new Error(`§31.4/§24.6: --strict must exit identically across formats. json=${jStrict.exit} sarif=${sStrict.exit}`);
  }
  covers("RPT-04");
}, TEST_MS);

/**
 * The other half of the sharp case, which a mutation sweep found undefended.
 *
 * The test above pins two DIFFERENT faults on ONE page. This pins ONE fault on
 * TWO pages, and it is the half a plausible wrong implementation gets wrong:
 * dropping `file` from the hash reads naturally as "the same fault has the same
 * fingerprint", and it survived the whole suite.
 *
 * It is wrong because a fingerprint is what a CI job suppresses. Two pages each
 * carrying a duplicate `id="dup"` are two faults needing two fixes; if they
 * fingerprint identically, suppressing the one you have triaged silently hides
 * the one you have not.
 */
test("RPT-02: the SAME fault on two DIFFERENT pages gets two fingerprints", async () => {
  const tmp = mkTmp();
  const dup = { desc: "A page with one duplicated id.", body: '<p id="dup">a</p><p id="dup">b</p>' };
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home", desc: "Home page.", h1: "Home", body: '<a href="/one.html">1</a><a href="/two.html">2</a>' }),
    "one.html": page({ title: "One", h1: "One", ...dup }),
    "two.html": page({ title: "Two", h1: "Two", ...dup }),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r, 0, "two pages each carrying the same duplicate id");
  const data = parseJson(r.stdout, "§31.2");
  const dupes = data.findings.filter((f) => f.id === "id-duplicate");

  if (dupes.length !== 2) {
    throw new Error(`fixture check: expected one finding per page, got ${dupes.length}\nstdout:\n${r.stdout}`);
  }
  // The fixture check that makes this the CROSS-page case, mirroring the
  // same-page test's own guard so neither can drift into the other.
  if (dupes[0].file === dupes[1].file) {
    throw new Error(`fixture check: the findings must be on DIFFERENT pages.\nfiles: ${dupes.map((d) => d.file).join(", ")}`);
  }
  if (dupes[0].fingerprint === dupes[1].fingerprint) {
    throw new Error(
      `§31.2: a fingerprint identifies one finding — the same fault on two pages is two faults, and one CI suppression must not hide the other.\nboth: ${dupes[0].fingerprint}`,
    );
  }
  covers("RPT-02");
}, TEST_MS);
