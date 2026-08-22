/**
 * §25 — the final-output verification map, made executable — COL-05, A16,
 * VER-01, VER-02, VER-03, and (arriving with §13's own round-9 repair, whose
 * fixtures are the two-form ones already built here) COL-03 and A11.
 *
 * Product-spec §6.3.5 and §6.3.4 overlap on fragment identifiers and
 * duplicate IDs, and §25 resolves the overlap toward findings. The rows of
 * that map whose destinations already have owners (metadata placement,
 * sitemap `<loc>`s, JSON-LD URLs, the generated-artifact clause) are pinned by
 * those owners' own files and are deliberately not re-asserted here — one
 * question, one owner. What is left is what only the map can carry: the
 * BOUNDARY between §12 and §24.4, asserted from both ends at once because the
 * allocation is the claim and a test of either command alone cannot see it;
 * §13's new normalization-form advisory and the whole of its boundary with
 * A11, which is the part that shipped wrong twice: one case per row of §13's
 * table (pure case, pure form, the KELVIN pair, the macOS pair), plus the two
 * groups where the two sentences meet — three spellings of one name, and a
 * group holding a P12 pair; and §25.3's deliberate non-items, an absence
 * nobody pins being an absence a later change closes by accident.
 *
 * The KELVIN and macOS rows exist because each was a defect that SHIPPED and
 * that no test looked at from either direction: the first drew A11's sentence
 * about a pair differing by no case at all, the second drew no sentence from
 * anybody.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

// Written as escapes, never as literals. An editor, a checkout, or a
// filesystem that normalizes would silently make the two one string, and the
// fixture would then assert nothing while still passing — the precise failure
// this file exists to make loud.
const NFC = "caf\u00e9.html"; // U+00E9
const NFD = "cafe\u0301.html"; // "e" then the combining acute, U+0301
const NFC_UPPER = "CAF\u00c9.html";
const NFD_MD = "cafe\u0301.md"; // the NFD spelling as a Markdown page — a second source for one output path
// The canonical singletons, which `toLowerCase` collapses onto ASCII: these
// two names are NOT a case difference (both render as a capital K) but they
// ARE canonically equivalent, so a normalizing host sees one file.
const ASCII_KILO = "Kilo.html"; // U+004B
const KELVIN_KILO = "\u212Ailo.html"; // U+212A KELVIN SIGN, whose NFC form is U+004B

const page = (name, { body = "" } = {}) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="The ${name} page of the example site.">
</head>
<body>
<main><h1>${name}</h1><p>Words about ${name}.</p>${body}</main>
</body>
</html>
`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectContains(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

function expectAbsent(haystack, needle, what) {
  if (haystack.includes(needle)) throw new Error(`${what}: expected NOT to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

const advisories = (stderr) => stderr.split("\n").filter((l) => / advisory: /.test(l));
const problems = (stderr) => stderr.split("\n").filter((l) => / problem: /.test(l));

/**
 * Write the two-form pair and prove the filesystem under this run kept them
 * apart. A normalizing filesystem (APFS) folds them into one file, which
 * would leave every assertion below trivially true; the fixture cannot exist
 * there, and saying so out loud beats a mysterious mismatch — and beats a
 * skip, which hygiene H4 forbids for the reason that a test deciding when to
 * run is not a gate.
 */
function writeTwoFormPair(tmp, files) {
  const src = join(tmp, "src");
  writeTree(src, files);
  for (const name of Object.keys(files)) {
    if (!existsSync(join(src, name))) {
      throw new Error(`this filesystem folds Unicode normalization forms — ${JSON.stringify(name)} is not on disk, so the fixture cannot exist here`);
    }
  }
  const bodies = new Set(Object.keys(files).map((n) => readFileSync(join(src, n), "utf8")));
  if (bodies.size !== Object.keys(files).length) {
    throw new Error("this filesystem folds Unicode normalization forms — the fixture files read back as one file");
  }
}

test(
  "A16: two Unicode normalization forms of one name are an advisory, and both files still ship",
  async () => {
    const tmp = mkTmp();
    writeTwoFormPair(tmp, {
      "index.html": page("Home", { body: `<p><a href="/${NFC}">c</a></p>` }),
      [NFC]: page("Cafe NFC"),
      [NFD]: page("Cafe NFD"),
    });

    const dry = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
    expectExit(dry, 0, "a normalization-form pair is an advisory, never a problem");
    const lines = advisories(dry.stderr);
    if (lines.length !== 1) throw new Error(`expected exactly one advisory, got ${lines.length}:\n${dry.stderr}`);

    // The escaped spelling is the whole point of the message: the two paths
    // print identically, so the unescaped form quotes one string twice.
    expectContains(lines[0], "caf\\u{00e9}.html", "A16 escapes the NFC path");
    expectContains(lines[0], "cafe\\u{0301}.html", "A16 escapes the NFD path");
    expectContains(lines[0], "a host that normalizes Unicode", "A16 names the host behaviour it warns about");
    expectAbsent(lines[0], "letter case", "A16 is not A11");
    // §14.1 R3: located at the path-ordered first SOURCE, which is the NFD
    // spelling ("e" sorts below U+00E9).
    expectContains(lines[0], `src/${NFD}: advisory: `, "A16 locates at the path-ordered first source");

    const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(built, 0, "an advisory never blocks a publish");
    if (!existsSync(join(tmp, "dist", NFC)) || !existsSync(join(tmp, "dist", NFD))) {
      throw new Error("both files must ship — an advisory never changes what is published");
    }
    expectContains(readFileSync(join(tmp, "dist", NFC), "utf8"), "Cafe NFC", "the NFC file keeps its own body");
    expectContains(readFileSync(join(tmp, "dist", NFD), "utf8"), "Cafe NFD", "the NFD file keeps its own body");

    const strict = await runCli(["build", "-s", "src", "-o", "dist", "--strict"], tmp);
    expectExit(strict, 1, "--strict moves the exit code");
    if (!existsSync(join(tmp, "dist", NFC))) throw new Error("--strict changes the exit code, never what ships");

    covers("COL-05", "A16");
  },
  TEST_MS,
);

test(
  "A11 alone: a pure case pair is A11's, and A16's whole-group skip keeps it out of A16",
  async () => {
    const caseOnly = mkTmp();
    writeTree(join(caseOnly, "src"), {
      "index.html": page("Home"),
      "About.html": page("About upper"),
      "about.html": page("About lower"),
    });
    const a = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], caseOnly);
    expectExit(a, 0, "a case-only pair is an advisory");
    const aLines = advisories(a.stderr);
    if (aLines.length !== 1) throw new Error(`expected exactly one advisory, got ${aLines.length}:\n${a.stderr}`);
    expectContains(aLines[0], "About.html and about.html differ only by letter case", "a case-only pair is A11's");
    expectAbsent(aLines[0], "normalization", "A16 skips a group that is A11's entirely");

    covers("COL-03", "COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "A16 alone: the KELVIN pair differs by FORM, not case — and the message tells the two spellings apart",
  async () => {
    // `toLowerCase` is not "differs only by case": it also collapses the
    // canonical singletons, U+212A KELVIN SIGN → `k` among them. So these two
    // land in one A11 group by that test while being canonically EQUIVALENT —
    // one name to a normalizing host, which is A16's row of §13's table.
    //
    // A11 claimed the pair for two rounds and said of it "Kilo.html and
    // Kilo.html differ only by letter case": two strings that render
    // identically, both a capital K, naming no edit the author could make. The
    // escape below is the whole point of the assertion — a sentence quoting
    // two indistinguishable strings is the defect, not the wording.
    const tmp = mkTmp();
    writeTwoFormPair(tmp, {
      "index.html": page("Home"),
      [ASCII_KILO]: page("Kilo ascii K"),
      [KELVIN_KILO]: page("Kilo kelvin sign"),
    });

    const dry = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
    expectExit(dry, 0, "a two-form pair is an advisory, never a problem");
    const lines = advisories(dry.stderr);
    if (lines.length !== 1) throw new Error(`expected exactly one advisory, got ${lines.length}:\n${dry.stderr}`);

    expectContains(lines[0], "are one name on a host that normalizes Unicode", "the KELVIN pair is A16's");
    expectAbsent(lines[0], "letter case", "A11 must not claim a pair that differs by no case at all");
    // The two spellings, told apart. Without the escape this reads
    // "Kilo.html and Kilo.html" — which is what shipped.
    expectContains(lines[0], "Kilo.html and \\u{212a}ilo.html are one name", "each spelling is distinguishable in the sentence");
    expectAbsent(lines[0], "Kilo.html and Kilo.html", "a sentence quoting one visible string twice names no edit");
    // §14.1 R3: located at the path-ordered first SOURCE — ASCII `K` (U+004B)
    // sorts below U+212A.
    expectContains(lines[0], `src/${ASCII_KILO}: advisory: `, "A16 locates at the path-ordered first source");

    const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(built, 0, "an advisory never blocks a publish");
    for (const name of [ASCII_KILO, KELVIN_KILO]) {
      if (!existsSync(join(tmp, "dist", name))) throw new Error(`both spellings must ship — ${JSON.stringify(name)} is missing`);
    }

    covers("COL-03", "COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "A16 alone: the macOS pair differs in BOTH case and form, and is nobody's if A16's skip asks only about form",
  async () => {
    // `CAFÉ.html` in NFC beside `café.html` in NFD is one file on macOS — by
    // far the commonest normalizing host, which folds case and form at once.
    // The pair satisfies NEITHER half of A16's skip on its own: its NFC forms
    // are distinct (so a skip keyed on form alone drops it) and its lowercase
    // forms are not identical. A skip that asked only "are the NFC forms
    // distinct" made this pair silent in BOTH advisories, which is the hole
    // A16's combined NFC-then-case-fold key exists to close.
    const both = mkTmp();
    writeTwoFormPair(both, {
      "index.html": page("Home"),
      [NFC_UPPER]: page("Cafe upper NFC"),
      [NFD]: page("Cafe lower NFD"),
    });
    const b = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], both);
    expectExit(b, 0, "a two-form pair is an advisory");
    const bLines = advisories(b.stderr);
    if (bLines.length !== 1) throw new Error(`expected exactly one advisory, got ${bLines.length}:\n${b.stderr}`);
    expectContains(
      bLines[0],
      "CAF\\u{00c9}.html and cafe\\u{0301}.html are one name on a host that normalizes Unicode",
      "a pair differing in case AND form is A16's, and it names both spellings",
    );
    expectAbsent(bLines[0], "letter case", "A11's key groups by lowercase, and these two do not share one");
    expectContains(bLines[0], `src/${NFC_UPPER}: advisory: `, "located at the path-ordered first source");

    const built = await runCli(["build", "-s", "src", "-o", "dist"], both);
    expectExit(built, 0, "an advisory never blocks a publish");
    for (const name of [NFC_UPPER, NFD]) {
      if (!existsSync(join(both, "dist", name))) throw new Error(`both spellings must ship — ${JSON.stringify(name)} is missing`);
    }

    covers("COL-03", "COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "COL-03/COL-05: in a three-spelling group each advisory makes its OWN true claim, and neither makes the other's",
  async () => {
    // The group A16's whole-group skip cannot reach: its key folds case and
    // form, so all three spellings are one group, and that group is not A11's
    // entirely — the skip does not fire.
    //
    // §13 used to claim the two advisories PARTITION the pairs, and this
    // fixture is the counterexample that retired the claim. The two NFC
    // spellings differ from each other by case; the NFD spelling is one name
    // with BOTH of them on a normalizing host. So the same name collides for
    // two reasons and appears in two sentences — and the property that
    // actually holds is the weaker one: neither advisory ever makes the
    // OTHER's claim about a pair.
    const tmp = mkTmp();
    writeTwoFormPair(tmp, {
      "index.html": page("Home"),
      [NFC_UPPER]: page("Cafe upper NFC"),
      [NFC]: page("Cafe lower NFC"),
      [NFD]: page("Cafe lower NFD"),
    });

    const dry = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
    expectExit(dry, 0, "three spellings are advisories, never a problem — no two produce one output path");
    const lines = advisories(dry.stderr);
    if (lines.length !== 2) throw new Error(`expected exactly two advisories, one per host behaviour, got ${lines.length}:\n${dry.stderr}`);

    const [a11, a16] = [lines.find((l) => l.includes("letter case")), lines.find((l) => l.includes("normalizes Unicode"))];
    if (!a11 || !a16) throw new Error(`expected one A11 and one A16, got:\n${lines.join("\n")}`);

    // A11 names the case pair and ONLY the case pair. The NFD spelling differs
    // from neither of the others by case alone, so a sentence naming it would
    // be A11 making A16's claim.
    expectContains(a11, "CAF\\u{00c9}.html and caf\\u{00e9}.html differ only by letter case", "A11 names exactly the case pair");
    expectAbsent(a11, "cafe\\u{0301}.html", "A11 must never call a difference of form a difference of case");

    // A16 names EVERY distinct spelling. All three are one file on a
    // normalizing host, so a sentence naming two of them describes a rename
    // that does not resolve the collision. Filtering the third out by case
    // fold is the version that shipped, and it is also the version that leaves
    // the KELVIN pair's sentence empty — the two demands are opposite.
    expectContains(
      a16,
      "CAF\\u{00c9}.html and cafe\\u{0301}.html, caf\\u{00e9}.html are one name on a host that normalizes Unicode",
      "A16 names every spelling in its group, path-ordered",
    );
    for (const spelling of ["CAF\\u{00c9}.html", "cafe\\u{0301}.html", "caf\\u{00e9}.html"]) {
      if (a16.split(spelling).length - 1 !== 1) {
        throw new Error(`A16 must name ${spelling} exactly once:\n${a16}`);
      }
    }

    for (const line of [a11, a16]) {
      expectContains(line, `src/${NFC_UPPER}: advisory: `, "both locate at the path-ordered first source");
    }

    const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(built, 0, "advisories never block a publish");
    for (const name of [NFC_UPPER, NFC, NFD]) {
      if (!existsSync(join(tmp, "dist", name))) throw new Error(`all three spellings must ship — ${JSON.stringify(name)} is missing`);
    }

    covers("COL-03", "COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "A16's sentence is about its GROUP: a pure-ASCII case pair inside one draws no claim about forms",
  async () => {
    // Round 7's finding, and the reason A16's wording changed. A16's group is
    // the set a host folding case AND form together sees as one file, so the
    // group can contain a pair with NO normalization relationship to anything:
    // `Kilo.html` and `kilo.html` are pure ASCII, each its own NFC form, and
    // they are in this group only because U+212A folds onto the first. The
    // sentence "are one name in two Unicode normalization forms" named them
    // and was false about them — a per-pair claim printed over a per-group
    // fact. What is true of every member is the folding that merges them, and
    // that is now what the sentence says.
    const tmp = mkTmp();
    writeTwoFormPair(tmp, {
      "index.html": page("Home"),
      [ASCII_KILO]: page("Kilo ascii K"),
      "kilo.html": page("Kilo lowercase"),
      [KELVIN_KILO]: page("Kilo kelvin sign"),
    });

    const dry = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
    expectExit(dry, 0, "three spellings of one name are advisories, never a problem");
    const lines = advisories(dry.stderr);
    const a11 = lines.find((l) => l.includes("letter case"));
    const a16 = lines.find((l) => l.includes("normalizes Unicode"));
    if (!a11 || !a16) throw new Error(`expected one A11 and one A16, got:\n${lines.join("\n")}`);

    // A11 is right about its pair: these two DO differ by letter case.
    expectContains(a11, "Kilo.html and kilo.html differ only by letter case", "A11 names the pure case pair");

    // A16 names all three, because all three are one file on a folding host —
    // and says only that. The words that would be false about `Kilo.html` and
    // `kilo.html` must not appear.
    expectContains(
      a16,
      "Kilo.html and kilo.html, \\u{212a}ilo.html are one name on a host that normalizes Unicode",
      "A16 names every spelling in its group, path-ordered",
    );
    expectAbsent(a16, "in two Unicode normalization forms", "A16 must not assert a form relationship its group does not have");
    expectAbsent(a16, "differ only by", "A16 makes no per-pair claim at all");

    const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(built, 0, "advisories never block a publish");
    for (const name of [ASCII_KILO, "kilo.html", KELVIN_KILO]) {
      if (!existsSync(join(tmp, "dist", name))) throw new Error(`all three spellings must ship — ${JSON.stringify(name)} is missing`);
    }

    covers("COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "A11/A16 quote the located path once, even when two sources produce it",
  async () => {
    // A P12 pair puts one output path in the group TWICE. Deduplicating only
    // the entries AFTER the located one left that path on both sides of the
    // sentence — "About.html and About.html, about.html" — which reads as a
    // rename of a file to its own name.
    const cases = mkTmp();
    writeTree(join(cases, "src"), {
      "index.html": page("Home"),
      "About.html": page("About upper html"),
      "About.md": "# About upper md\n",
      "about.html": page("about lower"),
    });
    const a = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], cases);
    expectExit(a, 1, "two sources on one output path is still a problem");
    const aLine = advisories(a.stderr).find((l) => l.includes("letter case"));
    if (!aLine) throw new Error(`expected an A11 advisory beside the problem:\n${a.stderr}`);
    const aSaid = aLine.split("advisory: ")[1];
    expectContains(aSaid, "About.html and about.html differ", "A11 names the two spellings, each once");
    if (aSaid.split("About.html").length - 1 !== 1) {
      throw new Error(`A11 quoted its located path twice — it names no edit:\n${aLine}`);
    }

    // Same shape one folding over: the P12 pair is the NFD spelling, which is
    // also the path-ordered first source ("e" sorts below U+00E9).
    const forms = mkTmp();
    writeTwoFormPair(forms, {
      "index.html": page("Home"),
      [NFD]: page("Cafe NFD html"),
      [NFD_MD]: "# Cafe NFD md\n",
      [NFC]: page("Cafe NFC html"),
    });
    const b = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], forms);
    expectExit(b, 1, "two sources on one output path is still a problem");
    const bLine = advisories(b.stderr).find((l) => l.includes("normalizes Unicode"));
    if (!bLine) throw new Error(`expected an A16 advisory beside the problem:\n${b.stderr}`);
    const bSaid = bLine.split("advisory: ")[1];
    expectContains(bSaid, "cafe\\u{0301}.html and caf\\u{00e9}.html are one name", "A16 names the two forms, each once");
    if (bSaid.split("cafe\\u{0301}.html").length - 1 !== 1) {
      throw new Error(`A16 quoted its located path twice — it names no edit:\n${bLine}`);
    }

    covers("COL-03", "COL-05", "A11", "A16");
  },
  TEST_MS,
);

test(
  "VER-01: a broken fragment publishes and is a finding; a broken path is P13 with or without one",
  async () => {
    const ok = mkTmp();
    writeTree(join(ok, "src"), {
      "index.html": page("Home", { body: `<p><a href="/notes.html#nowhere">notes</a></p>` }),
      "notes.html": page("Notes", { body: `<p><a href="/index.html">home</a></p>` }),
    });
    const built = await runCli(["build", "-s", "src", "-o", "dist"], ok);
    expectExit(built, 0, "a fragment that names no id is not a 404 — the page loads");
    if (problems(built.stderr).length) throw new Error(`build must say nothing about fragments:\n${built.stderr}`);
    // Not rewritten either: §12 strips the fragment to MATCH, never to edit.
    expectContains(readFileSync(join(ok, "dist", "index.html"), "utf8"), 'href="/notes.html#nowhere"', "the author's bytes");
    const audited = await runCli(["audit", "-s", "src", "-o", "dist"], ok);
    expectExit(audited, 0, "a finding never changes an exit code without --strict");
    expectContains(audited.stdout, "[fragment-missing]", "the judgement is a finding, and §24.4 owns it");

    const brokenPath = mkTmp();
    writeTree(join(brokenPath, "src"), {
      "index.html": page("Home", { body: `<p><a href="/gone.html#x">gone</a></p>` }),
    });
    const failed = await runCli(["build", "-s", "src", "-o", "dist"], brokenPath);
    expectExit(failed, 1, "a broken PATH is P13 whether or not it carries a fragment");
    expectContains(failed.stderr, "/gone.html#x", "the diagnostic quotes the reference as written");
    if (existsSync(join(brokenPath, "dist"))) throw new Error("a problem publishes nothing");

    covers("VER-01");
  },
  TEST_MS,
);

test(
  "VER-01: a duplicated id publishes, and a link to it draws no second diagnostic",
  async () => {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": page("Home", { body: `<p><a href="/notes.html#dup">notes</a></p>` }),
      "notes.html": page("Notes", { body: `<p id="dup">a</p><p id="dup">b</p><a href="/index.html">home</a>` }),
    });
    const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(built, 0, "a duplicated id is not a collision and not a reference");
    if (problems(built.stderr).length || advisories(built.stderr).length) {
      throw new Error(`build says nothing about duplicate ids:\n${built.stderr}`);
    }
    if (!existsSync(join(tmp, "dist", "notes.html"))) throw new Error("the page must publish");

    const audited = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
    expectExit(audited, 0, "audit reports without blocking");
    const dup = audited.stdout.split("\n").filter((l) => l.includes("[id-duplicate]"));
    if (dup.length !== 1) throw new Error(`expected exactly one id-duplicate, got ${dup.length}:\n${audited.stdout}`);
    expectContains(dup[0], "notes.html: broken:", "located at the page that DECLARES the ids");
    // `fragment-missing` asks whether the id is present, and it is — twice.
    expectAbsent(audited.stdout, "[fragment-missing]", "a link to a duplicated id draws no second finding");

    covers("VER-01");
  },
  TEST_MS,
);

test(
  "VER-02: a host redirect file is source — advisory when held back, byte-for-byte when shipped, never parsed",
  async () => {
    const redirects = "/old-page  /nowhere-at-all.html  301\n/blog/*  /articles/:splat  301\n";
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), { "index.html": page("Home"), _redirects: redirects });

    const held = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(held, 0, "a held-back host artifact is informational");
    const lines = advisories(held.stderr);
    if (lines.length !== 1) throw new Error(`expected exactly one advisory, got ${lines.length}:\n${held.stderr}`);
    expectContains(lines[0], "_redirects", "A14 names the file");
    if (existsSync(join(tmp, "dist", "_redirects"))) throw new Error("nothing is exempted from exclusion");

    const shipped = mkTmp();
    writeTree(join(shipped, "src"), { "index.html": page("Home"), _redirects: redirects });
    const out = await runCli(
      ["build", "-s", "src", "-o", "dist", "--exclude", "_*.html", "--exclude", "_*.md"],
      shipped,
    );
    expectExit(out, 0, "unify models no redirect, so it can adjudicate no redirect target");
    if (readFileSync(join(shipped, "dist", "_redirects"), "utf8") !== redirects) {
      throw new Error("a shipped host artifact is a byte-for-byte mirror copy");
    }
    // The contents were never read: a target naming no emitted file is not a
    // reference, and a splat destination names no file by design.
    expectAbsent(out.stderr, "nowhere-at-all.html", "a redirect target is not a P13");
    expectAbsent(out.stderr, ":splat", "the host's grammar is not unify's to adjudicate");

    covers("VER-02");
  },
  TEST_MS,
);

test(
  "VER-03: a reference in the other normalization form stays P13, and an extension-stripping host is not a collision",
  async () => {
    const tmp = mkTmp();
    writeTwoFormPair(tmp, {
      "index.html": page("Home", { body: `<p><a href="/${NFC}">cafe</a></p>` }),
      [NFD]: page("Cafe NFD"),
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(r, 1, "§12 matches byte-exactly: normalizing either side would publish an address only some hosts serve");
    expectContains(r.stderr, "does not resolve to any emitted file", "the LINK is what §12 reports");
    if (existsSync(join(tmp, "dist"))) throw new Error("a problem publishes nothing");

    // `about.html` and `about/index.html` are two addresses, not one: unify
    // emits both and guesses no host routing table. The site-wide choice is
    // --pretty-urls, under which the same pair is P12.
    const two = mkTmp();
    writeTree(join(two, "src"), {
      "index.html": page("Home", { body: `<p><a href="/about.html">a</a> <a href="/about/">b</a></p>` }),
      "about.html": page("About file"),
      "about/index.html": page("About dir"),
    });
    const plain = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], two);
    expectExit(plain, 0, "two addresses, both emitted");
    if (problems(plain.stderr).length) throw new Error(`no collision without --pretty-urls:\n${plain.stderr}`);
    expectContains(plain.stdout, "(/about.html)", "the file keeps its own address");
    expectContains(plain.stdout, "(/about/)", "the directory index keeps its own address");

    const pretty = await runCli(["build", "-s", "src", "-o", "dist", "--pretty-urls", "--dry-run"], two);
    expectExit(pretty, 1, "the site-wide move is what collides");
    expectContains(pretty.stderr, "both produce about/index.html", "P12 names both sources");

    covers("VER-03");
  },
  TEST_MS,
);
