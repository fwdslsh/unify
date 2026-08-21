/**
 * §32 — slotted includes. SLOT-01..07 and P25..P28.
 *
 * The whole feature is one split, so the whole file is written around it: an
 * include's CONTENT decides whether it is a verbatim textual splice or a
 * composition. Every test here pairs the two, because a wrong implementation
 * is far likelier to blur them than to get either alone wrong — and because
 * §32.4's claim, that one fragment answers to both roles, is only observable
 * from the pair.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const page = (body, { lang = "en", title = "Home", layout = null } = {}) =>
  `<!doctype html>
<html${lang === null ? "" : ` lang="${lang}"`}${layout === null ? "" : ` data-layout="${layout}"`}>
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="The ${title} page.">
</head>
<body>
${body}
</body>
</html>
`;

const read = (...p) => readFileSync(join(...p), "utf8");

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectContains(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: expected ${JSON.stringify(needle)} in:\n${haystack}`);
}

function expectAbsent(haystack, needle, what) {
  if (haystack.includes(needle)) throw new Error(`${what}: expected NOT to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

/** The one problem line for a file, and a loud failure when there are several. */
function onlyProblem(stderr, what) {
  const lines = stderr.split("\n").filter((l) => / problem: /.test(l));
  if (lines.length !== 1) {
    throw new Error(`${what}: expected exactly one problem, got ${lines.length}:\n${stderr}`);
  }
  return lines[0];
}

// ------------------------------------------------------------------- SLOT-01

test("SLOT-01 — the content decides: an empty include splices verbatim, a non-empty one composes", async () => {
  // §32.1's split, from the include's side, in one tree. The SAME fragment is
  // included both ways by two pages, so nothing but the presence of content
  // can account for the difference in output.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/box.fragment.html": '<div class="box"><slot>fallback</slot></div>\n',
    // Empty: verbatim. The fragment's <slot> lands in the LAYOUT, where §7's
    // own composition consumes it — v0.7.0 behaviour, unchanged by §32.
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>— S</title></head>
<body><include src="/_includes/box.fragment.html"></include></body>
</html>
`,
    "index.html": `<!doctype html>
<html><head><title>Home</title><meta name="description" content="Home."></head>
<body><p>page content</p></body>
</html>
`,
    // Non-empty: a composition, consumed by the include itself. Opted out of
    // the layout so the two paths cannot be confused for one.
    "other.html": page('<h1>Other</h1>\n<include src="/_includes/box.fragment.html"><em>include content</em></include>',
      { title: "Other", layout: "none" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "both include forms in one tree");

  const home = read(tmp, "dist", "index.html");
  expectContains(home, '<div class="box"><p>page content</p></div>', "the EMPTY include passed its slot through to the layout");

  const other = read(tmp, "dist", "other.html");
  expectContains(other, '<div class="box"><em>include content</em></div>', "the NON-EMPTY include consumed its own slot");

  // Neither path may leave a <slot> in the output — the v0.7.0 guarantee that
  // built pages contain no tool vocabulary, which §32 must not weaken.
  for (const [name, text] of [["index.html", home], ["other.html", other]]) {
    expectAbsent(text, "<slot", `${name}: a built page contains no <slot>`);
  }
  covers("SLOT-01", "SLOT-04");
}, TEST_MS);

test("SLOT-01 — whitespace between the tags is still emptiness", async () => {
  // §32.1 says so explicitly, and it is the boundary a naive `content !== ""`
  // check gets wrong: an author who formats an include across three lines has
  // written an EMPTY one, and must keep the verbatim splice.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/plain.fragment.html": "<p>spliced verbatim</p>\n",
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/plain.fragment.html">\n\n  \n</include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  // A verbatim splice of a slotless fragment is v0.7.0's ordinary include. If
  // whitespace counted as content this would be P26 instead.
  expectExit(r, 0, "whitespace-only content is an empty include");
  expectContains(read(tmp, "dist", "index.html"), "<p>spliced verbatim</p>", "the fragment spliced verbatim");
  covers("SLOT-01");
}, TEST_MS);

// ------------------------------------------------------------- SLOT-02 / P25 / P26

test("P25 — a non-empty include whose target is not a .fragment.html", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/plain.html": "<div><slot></slot></div>\n",
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/plain.html"><p>x</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a non-fragment target cannot take content");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with a problem published");

  // ONE problem. Returning the fragment untouched on the error path let its
  // <slot> flow into the page and drew P20 as well — a second diagnostic
  // pointing at the fragment, proposing a fix for a fault nobody has.
  const line = onlyProblem(r.stderr, "P25 reports once");
  expectContains(line, "src/index.html:", "located at the INCLUDE, in the file that wrote it");
  expectContains(line, "_includes/plain.html", "and naming the target");
  covers("SLOT-02", "P25");
}, TEST_MS);

test("P26 — a non-empty include whose target is a fragment declaring no slot", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/nos.fragment.html": "<div>no slots here</div>\n",
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/nos.fragment.html"><p>dropped?</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "content with nowhere to go is the content-loss law's own case");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with a problem published");
  const line = onlyProblem(r.stderr, "P26 reports once");
  expectContains(line, "src/index.html:", "located at the include");
  expectContains(line, "_includes/nos.fragment.html", "naming the fragment, since the fix may be there");
  covers("SLOT-02", "P26");
}, TEST_MS);

test("SLOT-02 — a slot inside a <template> does not count as a declaration", async () => {
  // §7.1's rule, inherited: markup inside a template is inert in the shipped
  // page, so it declares nothing — which makes this fragment P26's case, not
  // a successful merge. A wrong implementation counts it and drops the fill.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/tpl.fragment.html": "<div><template><slot name=\"inert\"></slot></template></div>\n",
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/tpl.fragment.html"><p slot="inert">x</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a template's slot declares nothing");
  expectContains(r.stderr, "declares no <slot>", "P26: the template's slot is not a declaration");
  covers("SLOT-02");
}, TEST_MS);

// ------------------------------------------------------------- SLOT-03 / P27

test("SLOT-03 — the merge is §7's: named fill, bare slot, fallback, and slot= consumed", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/card.fragment.html":
      '<article><h3><slot name="title">Untitled</slot></h3>' +
      '<div class="body"><slot>Nothing yet.</slot></div>' +
      '<footer><slot name="foot">—</slot></footer></article>\n',
    "index.html": page(
      '<h1>Home</h1>\n<include src="/_includes/card.fragment.html">' +
      '<span slot="title">Real title</span><p>Body.</p></include>',
    ),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a fragment with three slots and two fills");
  const out = read(tmp, "dist", "index.html");

  // The named fill replaced the slot TAG AND ALL, and its `slot` attribute is
  // gone — §7.1's rule, and the half a wrong implementation leaves behind.
  expectContains(out, "<h3><span>Real title</span></h3>", "named fill replaces the slot, slot= consumed");
  expectAbsent(out, 'slot="title"', "the consumed attribute must not survive");
  // Unaddressed content went to the bare slot.
  expectContains(out, "<p>Body.</p>", "unaddressed content reached the bare slot");
  expectAbsent(out, "Nothing yet.", "a filled bare slot does not also render its fallback");
  // The unfilled named slot rendered ITS OWN children.
  expectContains(out, "<footer>—</footer>", "an unfilled slot renders its fallback");
  expectAbsent(out, "<slot", "no <slot> survives into the built page");
  covers("SLOT-03");
}, TEST_MS);

test("P27 — a <head>, <html> or <body> inside a fragment reached by a non-empty include", async () => {
  // §32.3's two subtractions, made visible. A fragment is a bare snippet: it
  // contributes no head and no root attributes, so these would land in the
  // body and do nothing — §10.5's shape one file type over.
  for (const tag of ["head", "html", "body"]) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "_includes/bad.fragment.html": `<${tag}>${tag === "head" ? "<title>no</title>" : "x"}</${tag}>\n<div><slot></slot></div>\n`,
      "index.html": page('<h1>Home</h1>\n<include src="/_includes/bad.fragment.html"><p>x</p></include>'),
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(r, 1, `<${tag}> in a filled fragment`);
    if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with a problem published");
    const line = onlyProblem(r.stderr, `P27 for <${tag}> reports once`);
    expectContains(line, `<${tag}>`, "the message names the element it refused");
    expectContains(line, "src/index.html:", "located at the include, which is what the author controls");
  }
  covers("SLOT-03", "P27");
}, TEST_MS);

// ------------------------------------------------------------------- P28

test("P28 — a fill naming a slot the fragment does not declare is a PROBLEM, not §7.3's advisory", async () => {
  // The severity that differs from its neighbour, and the reason. §7.3 makes
  // a page's unmatched fill advisory A02 because that content stays in the
  // page flow — nothing is lost. A fragment has no flow: the include element
  // is replaced entirely, so this content would be dropped.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/one.fragment.html": '<div><slot name="a">A</slot></div>\n',
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/one.fragment.html"><p slot="zzz">dropped?</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "an unmatched fill in a fragment is content the build would drop");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with a problem published");
  const line = onlyProblem(r.stderr, "P28 reports once");
  expectContains(line, "problem:", "a problem, never an advisory");
  expectContains(line, 'slot="zzz"', "quoting the name that matched nothing");
  // The fix names what the fragment DOES declare — the one thing an author
  // cannot get from the message otherwise.
  expectContains(r.stderr, '"a"', "the fix lists the names the fragment declares");
  covers("SLOT-03", "P28");
}, TEST_MS);

test("P28's neighbour — the same unmatched fill in a PAGE stays advisory A02", async () => {
  // The pair that proves the severity split is a decision rather than an
  // accident: identical markup, two containers, two severities, and the page
  // one still publishes because its content stayed in the flow.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>— S</title></head>
<body><main><slot></slot></main></body></html>
`,
    "index.html": `<!doctype html>
<html><head><title>Home</title><meta name="description" content="Home."></head>
<body><p slot="zzz">unmatched</p><p>main</p></body></html>
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§7.3: an unmatched fill in a PAGE is an advisory and publishes");
  expectContains(r.stderr, "advisory:", "A02, not a problem");
  expectContains(read(tmp, "dist", "index.html"), "unmatched", "the content stayed in the flow — nothing was lost");
  covers("SLOT-03");
}, TEST_MS);

// ------------------------------------------------------------------- SLOT-05

test("SLOT-05 — fill scope is lexical: content never reaches a slot in a nested fragment", async () => {
  // The alternative — a fill travelling down a chain until something matches —
  // is action at a distance: adding a slot to a deeply nested fragment would
  // silently change what an unrelated page renders.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/inner.fragment.html": '<span class="inner"><slot name="deep">inner-fallback</slot></span>\n',
    "_includes/outer.fragment.html":
      '<div class="outer"><slot name="top">top-fallback</slot>' +
      '<include src="/_includes/inner.fragment.html"></include></div>\n',
    "index.html": page(
      '<h1>Home</h1>\n<include src="/_includes/outer.fragment.html">' +
      '<b slot="top">filled</b></include>',
    ),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a fragment including another fragment");
  const out = read(tmp, "dist", "index.html");
  expectContains(out, "<b>filled</b>", "the outer fragment's own slot was filled");
  // The inner fragment's slot is NOT visible to the outer include's content:
  // the empty inner include splices verbatim, so its slot passes through and
  // is consumed by nothing — rendering its own fallback.
  expectContains(out, "inner-fallback", "the nested slot rendered its own fallback, not the outer fill");
  covers("SLOT-05");
}, TEST_MS);

test("SLOT-05 — a cycle through a non-empty include is still P02, with the chain printed", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/a.fragment.html": '<div><slot></slot><include src="/_includes/b.fragment.html"><p>x</p></include></div>\n',
    "_includes/b.fragment.html": '<div><slot></slot><include src="/_includes/a.fragment.html"><p>y</p></include></div>\n',
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/a.fragment.html"><p>z</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a cycle is a cycle whichever include form makes it");
  expectContains(r.stderr, "include cycle:", "P02, unchanged by §32");
  expectContains(r.stderr, " → ", "the chain is printed");
  covers("SLOT-05");
}, TEST_MS);

// ------------------------------------------------------------------- SLOT-06

test("SLOT-06 — timing is unchanged: a non-empty include works in Markdown and in a layout", async () => {
  // §32.6. The operation differs, the moment does not, so everything
  // downstream sees one text and cannot tell which kind produced it. A
  // Markdown page converts first (§10.1), which makes a non-empty include
  // there an HTML block by the converter extension §10.1 already defines.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/note.fragment.html": '<aside class="note"><slot>none</slot></aside>\n',
    // In a layout: the merged result must then compose with the page as any
    // other layout markup does.
    "_layout.html": `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>— S</title></head>
<body><include src="/_includes/note.fragment.html"><b>from the layout</b></include><main><slot></slot></main></body></html>
`,
    "post.md": "---\ntitle: Post\ndescription: A post.\n---\n\n# Post\n\n<include src=\"/_includes/note.fragment.html\"><i>from markdown</i></include>\n\nAfter.\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a non-empty include in a layout and in Markdown");
  const out = read(tmp, "dist", "post.html");
  expectContains(out, '<aside class="note"><b>from the layout</b></aside>', "the layout's own slotted include composed");
  expectContains(out, '<aside class="note"><i>from markdown</i></aside>', "and the Markdown page's did too");
  expectAbsent(out, "<slot", "no <slot> survives");
  covers("SLOT-06");
}, TEST_MS);

// ------------------------------------------------------------------- SLOT-07

test("SLOT-07 — no props: an attribute on the include element reaches the fragment as nothing", async () => {
  // The single most likely wrong expectation, since every component system an
  // author has met does the opposite. §32.7 is explicit: no props, no
  // attributes passed, no attribute merging. The attribute is simply not part
  // of the feature — the include element is replaced, and it takes its own
  // attributes with it.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_includes/box.fragment.html": '<div class="box" data-x="fragment"><slot>none</slot></div>\n',
    "index.html": page('<h1>Home</h1>\n<include src="/_includes/box.fragment.html" data-x="page" title="t"><p>c</p></include>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "attributes on an include element are inert");
  const out = read(tmp, "dist", "index.html");
  expectContains(out, 'data-x="fragment"', "the fragment's own attribute is untouched");
  expectAbsent(out, 'data-x="page"', "the include's attribute is not passed, merged, or copied");
  expectAbsent(out, 'title="t"', "nor any other attribute");
  covers("SLOT-07");
}, TEST_MS);

test("SLOT-07 — the authoring rules stay within their budget, with slotted includes in them", async () => {
  // §32.7 makes shipping conditional on the rule still fitting the
  // authoring-rules page, and this is the mechanical half of that condition
  // asserted from the conformance suite rather than only from a unit test:
  // the document must describe the feature AND stay inside its line budget.
  const rules = readFileSync(join(import.meta.dir, "..", "..", "docs", "authoring-rules.md"), "utf8");
  const lines = rules.replace(/\n+$/, "").split("\n");
  if (lines.length > 60) {
    throw new Error(`§32.7/§6.1: the authoring rules must stay on one screen — ${lines.length} lines`);
  }
  if (!/fragment/i.test(rules) || !/<include/.test(rules)) {
    throw new Error("§32.7: the rule must actually be on the page it is required to fit");
  }
  covers("SLOT-07");
}, TEST_MS);
