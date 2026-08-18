/**
 * §22 canonical completion — CAN-01..05.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); byte comparisons (H5).
 * Every expectation is written from §22's text: the element's exact
 * serialization, its position, the shared §21.2 membership predicate, and the
 * deliberate absence of any new diagnostic.
 *
 * Two-sided throughout — the flag on and off, authored and absent, indexable
 * and noindex — because this section's whole risk is writing into a page that
 * did not ask for it.
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";
const read = (tmp, ...parts) => readFileSync(join(tmp, ...parts), "utf8");

/** A complete page whose `</head>` is indented two spaces, so §22.2's indentation rule is exercised. */
const page = (title, head = "", body = "<p>x</p>") =>
  `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <title>${title}</title>\n${head}  </head>\n  <body>\n${body}\n  </body>\n</html>\n`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

// ------------------------------------------------------------------- §22.1

test("CAN-01: --canonical auto completes; without it the page is byte-identical", async () => {
  const files = { "index.html": page("Home"), "about.html": page("About") };

  const off = mkTmp();
  writeTree(join(off, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], off);
  expectExit(a, 0, "no --canonical");
  if (read(off, "dist", "about.html").includes("canonical")) {
    throw new Error(`§22.1: without the option nothing in this section runs:\n${read(off, "dist", "about.html")}`);
  }

  const on = mkTmp();
  writeTree(join(on, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], on);
  expectExit(b, 0, "--canonical auto");
  if (!read(on, "dist", "about.html").includes('<link rel="canonical" href="https://example.com/about.html">')) {
    throw new Error(`§22.2: expected the completed element:\n${read(on, "dist", "about.html")}`);
  }
  covers("CAN-01");
}, TEST_MS);

test("CAN-01: any value but auto is a usage error, and so is auto without --base-url", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });

  const bad = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "always"], tmp);
  expectExit(bad, 2, "an unknown --canonical value");
  if (!bad.stderr.includes("auto")) {
    throw new Error(`§22.1: the error must name the accepted value.\nstderr:\n${bad.stderr}`);
  }

  const noBase = await runCli(["build", "-s", "src", "-o", "dist", "--canonical", "auto"], tmp);
  expectExit(noBase, 2, "--canonical auto without --base-url");
  if (!noBase.stderr.includes("--base-url")) {
    throw new Error(`§22.1: the error must name the missing option.\nstderr:\n${noBase.stderr}`);
  }
  covers("CAN-01");
}, TEST_MS);

test("CAN-01: unify.yaml canonical: auto is the identical setting", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "unify.yaml": `canonical: auto\nbase-url: ${BASE}\n`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "canonical via unify.yaml");
  if (!read(tmp, "dist", "index.html").includes('<link rel="canonical" href="https://example.com/">')) {
    throw new Error(`§22.1/CFG-01: the file's key must have the flag's effect:\n${read(tmp, "dist", "index.html")}`);
  }
  covers("CAN-01");
}, TEST_MS);

// ------------------------------------------------------------------- §22.2

test("CAN-02: the element lands at </head>'s own indentation, everything else byte-identical", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "about.html": page("About"), "index.html": page("Home") });
  const before = await runCli(["build", "-s", "src", "-o", "plain", "--base-url", BASE], tmp);
  expectExit(before, 0, "baseline build");
  const after = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(after, 0, "completed build");

  const plain = read(tmp, "plain", "about.html");
  const done = read(tmp, "dist", "about.html");
  // The whole document, byte for byte, plus one element at </head>'s own
  // indentation and nothing else — §3/S01's preservation rule applied to the
  // one place this section writes.
  const indent = /(\n[ \t]*)<\/head>/.exec(plain)[1].slice(1);
  const expected = plain.replace(
    `${indent}</head>`,
    `${indent}<link rel="canonical" href="https://example.com/about.html">\n${indent}</head>`,
  );
  if (done !== expected) {
    throw new Error(`§22.2: expected exactly one insertion before </head> at its indentation.\n--- expected ---\n${JSON.stringify(expected)}\n--- actual ---\n${JSON.stringify(done)}`);
  }
  if (indent !== "  ") {
    throw new Error(`the fixture must indent </head>, or this test does not exercise §22.2's rule (got ${JSON.stringify(indent)})`);
  }
  covers("CAN-02");
}, TEST_MS);

test("CAN-02: a page with no <head> is left alone", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "_layout.html": "<!doctype html>\n<html><body><main></main></body></html>\n",
    "bare.html": "<!doctype html>\n<html><body><main><p>no head anywhere</p></main></body></html>\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "a head-less document");
  const out = read(tmp, "dist", "bare.html");
  if (out.includes("canonical")) {
    throw new Error(`§22.2: there is nowhere to put it, and no head is synthesized:\n${out}`);
  }
  covers("CAN-02");
}, TEST_MS);

test("CAN-02: href is the same string the report and the sitemap use, under a subpath and pretty urls", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home"), "about.html": page("About") });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/repo/", "--pretty-urls", "--canonical", "auto"],
    tmp,
  );
  expectExit(r, 0, "subpath + pretty");
  const href = /<link rel="canonical" href="([^"]*)">/.exec(read(tmp, "dist", "about", "index.html"))?.[1];
  if (href !== "https://example.com/repo/about/") {
    throw new Error(`§22.2/§20.5: expected the page's final public URL, got ${JSON.stringify(href)}`);
  }
  if (!read(tmp, "dist", "sitemap.xml").includes(`<loc>${href}</loc>`)) {
    throw new Error(`§20.5: the canonical and the sitemap loc must be one string:\n${read(tmp, "dist", "sitemap.xml")}`);
  }
  covers("CAN-02");
}, TEST_MS);

// ------------------------------------------------------------------- §22.3

test("CAN-03: an authored canonical is left exactly as written, in every shape", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "self.html": page("Self", '  <link rel="canonical" href="/self.html">\n'),
    "elsewhere.html": page("Elsewhere", '  <link rel="canonical" href="/index.html">\n'),
    "twice.html": page("Twice", '  <link rel="canonical" href="/twice.html">\n  <link rel="canonical" href="/index.html">\n'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "authored canonicals");
  for (const [file, expected] of [
    ["self.html", 1],
    ["elsewhere.html", 1],
    ["twice.html", 2],
  ]) {
    const n = [...read(tmp, "dist", file).matchAll(/rel="canonical"/g)].length;
    if (n !== expected) {
      throw new Error(`§22.3: ${file} must keep exactly its authored ${expected}, found ${n}:\n${read(tmp, "dist", file)}`);
    }
  }
  covers("CAN-03");
}, TEST_MS);

test("CAN-03: an authored canonical with an empty or absent href is still authored", async () => {
  // `record.canonical` is null for both, so gating completion on the manifest
  // VALUE rather than on the DOCUMENT stamped a second canonical — creating
  // the multiple-canonical fault §22.4's own rationale says the tool must never
  // create, and creating it invisibly: the manifest then reads only the
  // completed value and records no conflict for `unify audit` to find.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "empty.html": page("Empty", '    <link rel="canonical" href="">\n'),
    "nohref.html": page("NoHref", "    <link rel=\"canonical\">\n"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "authored canonicals with no usable href");
  for (const f of ["empty.html", "nohref.html"]) {
    const n = [...read(tmp, "dist", f).matchAll(/rel="canonical"/g)].length;
    if (n !== 1) throw new Error(`§22.3: ${f} authored one canonical and must keep exactly one, found ${n}:\n${read(tmp, "dist", f)}`);
  }
  covers("CAN-03");
}, TEST_MS);

test("CAN-02/SIT-02: completion never changes the sitemap — the invariant the design rests on", async () => {
  // §22 decides membership from a manifest read BEFORE completion; §21 decides
  // from the manifest read AFTER. They agree only because a completed canonical
  // resolves back to its own page. One unescaped `&` in the base-url path broke
  // that and the site's only page vanished from the sitemap, silently — so the
  // agreement is asserted rather than assumed.
  for (const base of ["https://example.com/", "https://example.com/&copy;x/", "https://example.com/café/"]) {
    const tmp = mkTmp();
    const files = { "index.html": page("Home"), "about.html": page("About") };
    writeTree(join(tmp, "src"), files);
    const plain = await runCli(["build", "-s", "src", "-o", "plain", "--base-url", base], tmp);
    expectExit(plain, 0, `baseline for ${base}`);
    const done = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", base, "--canonical", "auto"], tmp);
    expectExit(done, 0, `completed for ${base}`);
    if (read(tmp, "plain", "sitemap.xml") !== read(tmp, "dist", "sitemap.xml")) {
      throw new Error(`§21/§22: completion must not change which pages the sitemap lists (${base}).\n--- without ---\n${read(tmp, "plain", "sitemap.xml")}\n--- with ---\n${read(tmp, "dist", "sitemap.xml")}`);
    }
  }
  covers("CAN-02");
}, TEST_MS);

test("CAN-02: a diagnostic below </head> keeps its file and line when completion runs", async () => {
  // §14.1 R3. The span table is built before §22 inserts bytes, and nothing
  // updated it — so a broken link inside an include was attributed to a
  // different file, at a line holding unrelated content.
  const files = {
    "_inc/nav.html": '<nav><a href="/gone.html">x</a></nav>\n',
    "page.html": page("P", "", '    <include src="/_inc/nav.html"></include>\n    <p>two</p>'),
    "index.html": page("Home"),
  };
  const plain = mkTmp();
  writeTree(join(plain, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], plain);
  expectExit(a, 1, "broken include reference without the flag");

  const done = mkTmp();
  writeTree(join(done, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], done);
  expectExit(b, 1, "the same site with completion");
  if (a.stderr !== b.stderr) {
    throw new Error(`§14.1: completion must not move a diagnostic.\n--- without ---\n${a.stderr}\n--- with ---\n${b.stderr}`);
  }
  covers("CAN-02");
}, TEST_MS);

// ------------------------------------------------------------------- §22.4

test("CAN-04: a noindex page is never stamped — that would manufacture the conflict", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "hidden.html": page("Hidden", '  <meta name="robots" content="noindex">\n'),
    "nofollow.html": page("Nofollow", '  <meta name="robots" content="nofollow">\n'),
    "404.html": page("Not found"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "membership");
  const has = (f) => read(tmp, "dist", f).includes("rel=\"canonical\"");
  if (has("hidden.html")) throw new Error("§22.4: a noindex page must not be stamped");
  if (has("404.html")) throw new Error("§22.4: an error document is not a destination");
  if (!has("nofollow.html")) throw new Error("§22.4: nofollow is not noindex — the page is still indexable");
  if (!has("index.html")) throw new Error("§22.4: an ordinary page is completed");
  covers("CAN-04");
}, TEST_MS);

// ------------------------------------------------------------------- §22.5

test("CAN-05: a canonical naming nothing emitted is P13, authored or completed; this section adds no diagnostic", async () => {
  const broken = mkTmp();
  writeTree(join(broken, "src"), {
    "index.html": page("Home"),
    "away.html": page("Away", '  <link rel="canonical" href="/gone.html">\n'),
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], broken);
  expectExit(a, 1, "an authored canonical naming nothing emitted");
  if (!a.stderr.includes("gone.html")) {
    throw new Error(`§22.5/§12: the existing link-href check must report it.\nstderr:\n${a.stderr}`);
  }

  // The adjacent clean side: a site whose canonicals all resolve reports nothing
  // at all, and completing them adds no diagnostic of its own.
  const clean = mkTmp();
  writeTree(join(clean, "src"), {
    "index.html": page("Home"),
    "hidden.html": page("Hidden", '  <meta name="robots" content="noindex">\n'),
    "twice.html": page("Twice", '  <link rel="canonical" href="/twice.html">\n  <link rel="canonical" href="/index.html">\n'),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], clean);
  expectExit(b, 0, "multiple canonicals and a noindex page are not build problems");
  if (b.stderr.trim() !== "") {
    throw new Error(`§22.5: content-quality judgements belong to audit, not to build.\nstderr:\n${b.stderr}`);
  }
  covers("CAN-05");
}, TEST_MS);
