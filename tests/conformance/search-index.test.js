/**
 * §30 the search manifest — SRCH-01..03.
 *
 * Written from docs/conformance-spec.md §30 alone — nothing here imports
 * src/**, and every assertion traces to a sentence in that section (or in
 * §20, §21.2, or §21.5, which §30 explicitly reuses rather than restates).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 *
 * Two techniques carry most of the weight here:
 *
 *  - Whole-document exact match. §30.1 fixes the top-level key list AND
 *    ORDER, the per-page key list AND ORDER, the null/[]/"" defaults, the
 *    two-space indent, and the trailing newline — all at once, the same way
 *    sitemap.test.js compares a whole `<urlset>` rather than grepping for a
 *    `<loc>`. `expectBytes(raw, JSON.stringify(expected, null, 2) + "\n",
 *    …)` pins every one of those in a single assertion; `JSON.stringify(
 *    Object.keys(x))` checks are layered on top of that so a key-order
 *    failure specifically reads as a key-order failure, not a generic diff.
 *  - Explicit `\u00A0` (etc.) escapes, never a literal byte pasted into this
 *    source, so the codepoint under test stays legible in a diff instead of
 *    being an invisible byte a reviewer's editor may silently normalize.
 *
 * The two-sided convention, same as sitemap.test.js: every rule that fires
 * has an adjacent case where it must not, and every silence (a page absent
 * from the index) sits beside a positive control in the same run so it
 * cannot pass against a feature that was never wired up.
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

// --------------------------------------------------------------- fixtures

/**
 * A complete standalone HTML page. No layout anywhere in these fixtures, so
 * §3's preservation rule means the emitted bytes are exactly these bytes.
 * `title: null` / `description: null` omit those elements entirely, so a
 * record's `title` / `description` reads `null` — the default §30.1 fixes.
 */
function page({ title = "Page", description = null, canonical = null, robots = null, head = "", body = "<p>x</p>" } = {}) {
  const bits = [`<meta charset="utf-8">`];
  if (title !== null) bits.push(`<title>${title}</title>`);
  if (description !== null) bits.push(`<meta name="description" content="${description}">`);
  if (robots !== null) bits.push(`<meta name="robots" content="${robots}">`);
  if (canonical !== null) bits.push(`<link rel="canonical" href="${canonical}">`);
  if (head) bits.push(head);
  return `<!doctype html>\n<html lang="en">\n<head>\n${bits.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

// ----------------------------------------------------------------- helpers

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

function read(...parts) {
  return readFileSync(join(...parts), "utf8");
}

function readSearchIndexRaw(tmp) {
  return read(tmp, "dist", "search-index.json");
}

/** Parses the emitted file, failing loudly (with the raw bytes) rather than letting a JSON.parse throw bubble up unexplained. */
function parseSearchIndex(tmp) {
  const raw = readSearchIndexRaw(tmp);
  try {
    return { raw, data: JSON.parse(raw) };
  } catch (e) {
    throw new Error(`search-index.json does not parse as JSON (${e.message})\n${raw}`);
  }
}

/** §30.1 fixes key list AND ORDER; JSON.stringify(Object.keys(...)) checks both in one comparison. */
function expectKeyList(obj, keys, what) {
  const got = JSON.stringify(Object.keys(obj));
  const want = JSON.stringify(keys);
  if (got !== want) {
    throw new Error(`${what}\n  expected: ${want}\n  actual:   ${got}`);
  }
}

// ------------------------------------------------------------- §30.1/§30.4

test("SRCH-01: --search-index is a flag, not a consequence — absent, nothing is generated or reported; present, the file is written; authored, it ships untouched", async () => {
  const files = { "index.html": page({ title: "Home" }), "about.html": page({ title: "About" }) };

  // (a) No flag: even though nothing else about this site would prevent a
  // search index, none is written and nothing is said about one — unlike a
  // sitemap's --base-url or a feed's schemaType, there is no page-level
  // statement that turns this on by itself (§30.1).
  const noFlag = mkTmp();
  writeTree(join(noFlag, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist"], noFlag);
  expectExit(a, 0, "no-flag build");
  if (existsSync(join(noFlag, "dist", "search-index.json"))) {
    throw new Error("§30.1: --search-index is a flag — a build that never passed it must generate nothing");
  }
  if (/search/i.test(a.stdout) || /search/i.test(a.stderr)) {
    throw new Error(`§30.1: a build with no --search-index must report nothing about one.\nstdout:\n${a.stdout}\nstderr:\n${a.stderr}`);
  }

  // (b) The flag, alone (no --base-url): the file is written at the output
  // root. §30.2 argues the flag deliberately does not require --base-url —
  // proven properly in the SRCH-02 url test below, pinned here as "it runs".
  const withFlag = mkTmp();
  writeTree(join(withFlag, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], withFlag);
  expectExit(b, 0, "flagged build");
  if (!existsSync(join(withFlag, "dist", "search-index.json"))) {
    throw new Error("§30.1: --search-index must write search-index.json at the output root");
  }

  // (c) An authored search-index.json, flag on: generation is suppressed
  // entirely (§21.5's rule, reused by §30.4) and the author's bytes ship
  // exactly as written — deliberately not merged into, not validated, not
  // even shaped like a real index, which is why the fixture below isn't.
  const authored = mkTmp();
  const authoredBytes = '{"custom":true,"notASchemaVersion":"nope"}\n';
  writeTree(join(authored, "src"), { ...files, "search-index.json": authoredBytes });
  const c = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], authored);
  expectExit(c, 0, "authored-file build");
  expectBytes(
    read(authored, "dist", "search-index.json"),
    authoredBytes,
    "§30.4: an authored search-index.json suppresses generation entirely and ships byte-for-byte, even with the flag on",
  );
  covers("SRCH-01");
}, TEST_MS);

test('SRCH-01: top-level keys are exactly ["schemaVersion","pages"]; a page\'s keys are exactly ["url","title","description","headings","text"] in that order; absent fields are null/[]/""', async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "full.html": page({
      title: "Full Page",
      description: "A description.",
      body: '<h1 id="top">Full Page</h1>\n<h2>Sub</h2>\n<p>Hello world.</p>',
    }),
    "minimal.html": page({ title: null, description: null, body: "" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], tmp);
  expectExit(r, 0, "shape build");

  const { raw, data } = parseSearchIndex(tmp);

  expectKeyList(data, ["schemaVersion", "pages"], "§30.1: top-level keys are schemaVersion and pages, in that order, with no others");
  if (data.schemaVersion !== 1) {
    throw new Error(`§30.1: schemaVersion must be the number 1.\n  actual: ${JSON.stringify(data.schemaVersion)}`);
  }
  if (!Array.isArray(data.pages) || data.pages.length !== 2) {
    throw new Error(`§30.2: expected exactly 2 page records (both pages are indexable, self-canonical, non-404).\n${raw}`);
  }

  // output-path order: "full.html" < "minimal.html"
  const [full, minimal] = data.pages;
  expectKeyList(full, ["url", "title", "description", "headings", "text"], "§30.1: a page's keys, in order, with no others");
  expectKeyList(minimal, ["url", "title", "description", "headings", "text"], "§30.1: the SAME key list on a page declaring nothing");

  if (minimal.title !== null) throw new Error(`§30.1: title must be null when the page declares none.\n  actual: ${JSON.stringify(minimal.title)}`);
  if (minimal.description !== null) {
    throw new Error(`§30.1: description must be null when the page declares none.\n  actual: ${JSON.stringify(minimal.description)}`);
  }
  if (!Array.isArray(minimal.headings) || minimal.headings.length !== 0) {
    throw new Error(`§30.1: headings must be [] when the page declares none.\n  actual: ${JSON.stringify(minimal.headings)}`);
  }
  if (minimal.text !== "") throw new Error(`§30.1: text must be "" when the page has none.\n  actual: ${JSON.stringify(minimal.text)}`);

  // The comprehensive gate: key list+order, values, defaults, array order,
  // 2-space indent, and the trailing newline, all in one byte comparison.
  const expected = {
    schemaVersion: 1,
    pages: [
      {
        url: "/full.html",
        title: "Full Page",
        description: "A description.",
        headings: [
          { level: 1, text: "Full Page", id: "top" },
          { level: 2, text: "Sub", id: null },
        ],
        text: "Full Page Sub Hello world.",
      },
      { url: "/minimal.html", title: null, description: null, headings: [], text: "" },
    ],
  };
  expectBytes(raw, `${JSON.stringify(expected, null, 2)}\n`, "§30.1: two-space-indented JSON, a trailing newline, and exactly these values");
  covers("SRCH-01");
}, TEST_MS);

test("SRCH-01: pages appear in manifest order (output path, not source or discovery order), and two builds of one tree are byte-identical", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }),
    "z.html": page({ title: "Z" }),
    "a.html": page({ title: "A" }),
    "m/deep.html": page({ title: "Deep" }),
  });
  const first = await runCli(["build", "-s", "src", "-o", "dist", "--search-index", "--base-url", BASE], tmp);
  expectExit(first, 0, "first build");
  const one = readSearchIndexRaw(tmp);
  const { data } = parseSearchIndex(tmp);
  const urls = data.pages.map((p) => p.url);
  const expectedOrder = [
    "https://example.com/a.html",
    "https://example.com/",
    "https://example.com/m/deep.html",
    "https://example.com/z.html",
  ];
  if (JSON.stringify(urls) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `§30.1/§20.1: pages must be in manifest order (output path), not the order files were written or discovered.\n  expected: ${JSON.stringify(expectedOrder)}\n  actual:   ${JSON.stringify(urls)}`,
    );
  }

  const second = await runCli(["build", "-s", "src", "-o", "dist", "--search-index", "--base-url", BASE], tmp);
  expectExit(second, 0, "second build");
  expectBytes(readSearchIndexRaw(tmp), one, "§30.1: determinism — the same input must produce the same bytes");
  covers("SRCH-01");
}, TEST_MS);

// ------------------------------------------------------------------ §30.2

test("SRCH-02: url is record.path (root-relative) with no --base-url, and record.url (absolute) once one is supplied", async () => {
  const files = { "index.html": page({ title: "Home" }), "about.html": page({ title: "About" }) };

  const noBase = mkTmp();
  writeTree(join(noBase, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], noBase);
  expectExit(a, 0, "no-base build");
  const { data: dataA } = parseSearchIndex(noBase);
  const urlsA = dataA.pages.map((p) => p.url).sort();
  if (JSON.stringify(urlsA) !== JSON.stringify(["/", "/about.html"])) {
    throw new Error(
      `§30.2: with no --base-url, url must be record.path (root-relative) — a local site still needs an address a page on it can link to.\n  actual: ${JSON.stringify(urlsA)}`,
    );
  }

  const withBase = mkTmp();
  writeTree(join(withBase, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--search-index", "--base-url", BASE], withBase);
  expectExit(b, 0, "with-base build");
  const { data: dataB } = parseSearchIndex(withBase);
  const urlsB = dataB.pages.map((p) => p.url).sort();
  if (JSON.stringify(urlsB) !== JSON.stringify(["https://example.com/", "https://example.com/about.html"])) {
    throw new Error(`§30.2: with --base-url, url must be record.url (absolute).\n  actual: ${JSON.stringify(urlsB)}`);
  }
  covers("SRCH-02");
}, TEST_MS);

test("SRCH-02: membership is §21.2's predicate, unchanged — noindex, none, 404.html, and a canonical elsewhere (on-site or off) are absent, beside a positive control and a nofollow-only page proving the absence is not vacuous", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }), // positive control: must be present
    "hidden.html": page({ title: "Hidden", robots: "noindex" }), // excluded: noindex
    "nofollow.html": page({ title: "Nofollow", robots: "nofollow" }), // control: kept — only noindex/none excludes
    "none.html": page({ title: "None", robots: "none" }), // excluded: none implies noindex
    "404.html": page({ title: "Not found" }), // excluded: not a destination
    "dupe.html": page({ title: "Dupe", canonical: "/index.html" }), // excluded: consolidated onto index.html
    "self.html": page({ title: "Self", canonical: "/self.html" }), // control: self-canonical, kept
    "away.html": page({ title: "Away", canonical: "https://elsewhere.example/x" }), // excluded: consolidated off-site
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index", "--base-url", BASE], tmp);
  expectExit(r, 0, "membership build");
  const { data } = parseSearchIndex(tmp);
  const urls = data.pages.map((p) => p.url);
  const expected = ["https://example.com/", "https://example.com/nofollow.html", "https://example.com/self.html"];
  if (JSON.stringify(urls) !== JSON.stringify(expected)) {
    throw new Error(
      `§30.2: membership must be exactly §21.2's predicate — a record, indexable, not 404.html, self-canonical. A noindex page, 404.html, and a page consolidated elsewhere (on-site or off) must all be absent, with the positive control (index.html) and the nofollow-only control (nofollow.html) present.\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(urls)}`,
    );
  }
  covers("SRCH-02");
}, TEST_MS);

// ------------------------------------------------------------------ §30.3

test("SRCH-03: a visible NON-BREAKING SPACE (U+00A0) is folded to an ordinary space (U+0020) in the index", async () => {
  const tmp = mkTmp();
  const NBSP = "\u00A0"; // explicit escape — never a literal byte pasted into this source
  const body = `<p>New${NBSP}York${NBSP}office${NBSP}hours</p>`;
  writeTree(join(tmp, "src"), { "index.html": page({ body }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], tmp);
  expectExit(r, 0, "nbsp build");
  const { data } = parseSearchIndex(tmp);
  const text = data.pages[0].text;
  if (text !== "New York office hours") {
    throw new Error(`§30.3: an NBSP-joined phrase must fold to ordinary spaces.\n  expected: "New York office hours"\n  actual:   ${JSON.stringify(text)}`);
  }
  if (text.includes(NBSP)) {
    throw new Error(`§30.3: U+00A0 must not survive into the search projection — §20.3 keeps it in the manifest field, but this projection folds it.\n  text: ${JSON.stringify(text)}`);
  }
  covers("SRCH-03");
}, TEST_MS);

test("SRCH-03: every Unicode space separator in the closed list folds to U+0020, a run of separators collapses to ONE space, and the result is trimmed", async () => {
  const tmp = mkTmp();
  // The exact closed set §30.3 names: U+00A0, U+2000-U+200A, U+202F, U+205F,
  // U+3000 — 15 codepoints, spelled as \u escapes so each is legible in a
  // diff rather than an invisible byte.
  const SEPARATORS = [
    "\u00A0", "\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005",
    "\u2006", "\u2007", "\u2008", "\u2009", "\u200A", "\u202F", "\u205F", "\u3000",
  ];
  const words = SEPARATORS.map((_, i) => `Word${i}`);
  words.push(`Word${SEPARATORS.length}`); // 16 words, one more than separators
  let inner = words[0];
  for (let i = 0; i < SEPARATORS.length; i++) inner += SEPARATORS[i] + words[i + 1];
  // Wrap with a run of two DIFFERENT separators at each end, so trimming a
  // run of mixed separators is exercised too, not just a run of one kind.
  const lead = SEPARATORS[0] + SEPARATORS[1];
  const trail = SEPARATORS[2] + SEPARATORS[3];
  const body = `<p>${lead}${inner}${trail}</p>`;
  writeTree(join(tmp, "src"), { "index.html": page({ body }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], tmp);
  expectExit(r, 0, "separator build");
  const { data } = parseSearchIndex(tmp);
  const text = data.pages[0].text;
  const expectedText = words.join(" ");
  if (text !== expectedText) {
    throw new Error(
      `§30.3: the full separator set must each fold to one ordinary space, adjacent runs must collapse, and the ends must trim.\n  expected: ${JSON.stringify(expectedText)}\n  actual:   ${JSON.stringify(text)}`,
    );
  }
  for (const sep of SEPARATORS) {
    if (text.includes(sep)) {
      const cp = `U+${sep.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
      throw new Error(`§30.3: ${cp} survived folding.\n  text: ${JSON.stringify(text)}`);
    }
  }
  covers("SRCH-03");
}, TEST_MS);

test("SRCH-03: folding touches only whitespace — mixed case, a stop word, and a long page's full length all survive untouched", async () => {
  const tmp = mkTmp();
  const NBSP = "\u00A0";
  const filler = "The quick MiXeD-CaSe fox jumps over the lazy DOG and the CAT";
  const repeated = Array.from({ length: 50 }, () => filler).join(". ");
  const TAIL = "ZZZ-TAIL-MARKER-PROVING-NO-TRUNCATION-ZZZ";
  const expectedText = `${repeated}. ${TAIL}`;
  if (expectedText.length < 2000) {
    throw new Error(`test fixture bug: the fixture must be long enough to catch truncation (got ${expectedText.length} chars)`);
  }
  // Swap exactly one ordinary space for one NBSP (same character count, so
  // folding it back reproduces expectedText exactly) — this re-checks the
  // fold from the first test above, but now deep inside a LONG page, not
  // only in a short isolated phrase.
  const sourceText = expectedText.replace(" fox", `${NBSP}fox`);
  writeTree(join(tmp, "src"), { "index.html": page({ body: `<p>${sourceText}</p>` }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], tmp);
  expectExit(r, 0, "long-text build");
  const { data } = parseSearchIndex(tmp);
  const text = data.pages[0].text;

  if (!text.includes("MiXeD-CaSe")) {
    throw new Error(`§30.3: mixed case must survive — nothing here does case folding.\n  text (first 200 chars): ${JSON.stringify(text.slice(0, 200))}`);
  }
  if (!text.includes("The quick") || !text.includes("the lazy DOG")) {
    throw new Error(`§30.3: a stop word ("the"/"The") must survive — nothing here does stop-word removal.\n  text (first 200 chars): ${JSON.stringify(text.slice(0, 200))}`);
  }
  if (text.length !== expectedText.length || !text.endsWith(TAIL)) {
    throw new Error(
      `§30.3: the text must not be truncated — the tail marker must survive intact.\n  expected length: ${expectedText.length}, actual length: ${text.length}\n  actual tail (last 60 chars): ${JSON.stringify(text.slice(-60))}`,
    );
  }
  if (text !== expectedText) {
    throw new Error(`§30.3: mismatch beyond the single NBSP fold — something else changed the text.\n--- expected ---\n${JSON.stringify(expectedText)}\n--- actual ---\n${JSON.stringify(text)}`);
  }
  covers("SRCH-03");
}, TEST_MS);

test('SRCH-03: the fold list is closed — a Unicode codepoint outside it (OGHAM SPACE MARK, ZERO WIDTH NO-BREAK SPACE) is left exactly as written', async () => {
  // §30.3 enumerates the fold set explicitly and closes it with an em-dash:
  // "Every Unicode space separator — U+00A0, U+2000-U+200A, U+202F, U+205F,
  // U+3000 — becomes U+0020". That list is Unicode's own Space_Separator
  // (Zs) category MINUS U+1680 OGHAM SPACE MARK, which IS Zs but is not
  // named — the same closed-citable-list discipline §20.3 states outright
  // ("a closed, citable list rather than an implementation's habit").
  // U+FEFF ZERO WIDTH NO-BREAK SPACE is not even Zs (it is a format
  // character, historically the UTF-16 BOM) — it is not a "space separator"
  // by any reading, but it IS matched by JS's own `\s` regex metacharacter,
  // which is exactly the shortcut this test exists to catch: an
  // implementation that folds "whatever counts as Unicode whitespace" turns
  // this into a wider rule than §30.3 states.
  const tmp = mkTmp();
  const OGHAM = "\u1680";
  const ZWNBSP = "\uFEFF";
  const body = `<p>Left${OGHAM}Right${ZWNBSP}End</p>`;
  writeTree(join(tmp, "src"), { "index.html": page({ body }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], tmp);
  expectExit(r, 0, "closed-list build");
  const { data } = parseSearchIndex(tmp);
  const text = data.pages[0].text;
  const expectedText = `Left${OGHAM}Right${ZWNBSP}End`;
  if (text !== expectedText) {
    throw new Error(
      `§30.3: the fold list is CLOSED to the 15 codepoints it names — a codepoint outside it (Ogham Space Mark, Zero Width No-Break Space) must not be touched.\n  expected: ${JSON.stringify(expectedText)}\n  actual:   ${JSON.stringify(text)}`,
    );
  }
  covers("SRCH-03");
}, TEST_MS);
