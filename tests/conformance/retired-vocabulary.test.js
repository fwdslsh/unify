/**
 * §6.3 / P08 — the retired-vocabulary check, and where it must stay silent.
 *
 * P08 parses raw source as HTML, which is how a page DOCUMENTING unify came
 * to be reported as a page USING the retired vocabulary: a well-formed sample
 * is indistinguishable from authored markup to a parser that was never told
 * the difference. unify's own documentation site went red the day the
 * conformance spec gained a sentence about `data-slot` (issue #71).
 *
 * The tests below are the six constructs measured failing on that issue, plus
 * the cases that must still FIRE — because the cheap way to pass the first
 * half is to mark too much inert, and every inert byte is a byte P08 stops
 * protecting.
 *
 * The second half of the file is issue #154: the sweep no longer reads
 * `data-slot` at all, and P07 no longer reads a `data-layout` whose value is
 * not a layout reference. Both are plain `data-*` names third-party markup
 * uses for its own purposes, and a port over such markup could not build.
 * `data-slot` is still P08 where it would have been a fill — an element in
 * fill position naming a slot the layout or fragment declares (§7.3, §32.3)
 * — and `data-layout` off the root is still P07 when its value ends in
 * `.html` or is `none` (§6.3).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const md = (title, body) => `---\ntitle: ${title}\ndescription: The ${title} page.\n---\n\n${body}\n`;
const page = (title, body) =>
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title>` +
  `<meta name="description" content="The ${title} page."></head>\n<body>${body}</body>\n</html>\n`;

/** Every `retired` problem the build reported, as `file:line` strings. */
async function retiredIn(tree) {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "<h1>Home</h1>"), ...tree });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
  return r.stderr.split("\n").filter((l) => /retired/.test(l)).map((l) => l.trim());
}

test("LAY-16 — a retired spelling inside code is a sample, not a declaration", async () => {
  // The six forms from #71, each on its own page so one silence cannot mask
  // another. A bare attribute NAME in a span (`data-slot`) never fired — P08
  // needs a parsed element — so the span cases carry a whole tag.
  const found = await retiredIn({
    "a-span-unify.md": md("A", 'Use `<div data-unify="/x.html">` in 0.6.'),
    "b-span-slot.md": md("B", 'Use `<title data-slot="title">` in 0.6.'),
    "c-span-class.md": md("C", 'Use `<main class="unify-content">` in 0.6.'),
    "d-fence-unify.md": md("D", '```html\n<div data-unify="/x.html">hi</div>\n```'),
    "e-fence-slot.md": md("E", '```html\n<title data-slot="title">T</title>\n```'),
    "f-indented.md": md("F", 'Example:\n\n    <div data-unify="/x.html">hi</div>'),
    "g-tilde.md": md("G", '~~~html\n<div data-unify="/x.html">t</div>\n~~~'),
    "h-html-pre.html": page("H", '<pre><code><div data-unify="/x.html">raw</div></code></pre>'),
  });
  if (found.length) throw new Error(`code samples must not be reported:\n${found.join("\n")}`);
  covers("LAY-16", "P08");
}, TEST_MS);

test("LAY-16 — markup outside code is still reported", async () => {
  // The other half, and the one that decides whether the rule is honest. Each
  // of these sits OUTSIDE any code region and must still be a problem.
  const found = await retiredIn({
    // Real markup in a Markdown page.
    "i-real.md": md("I", '<div class="unify-content">real</div>'),
    // Real markup in an HTML page.
    "j-real.html": page("J", '<div class="unify-content">real</div>'),
    // An indented line that CONTINUES a paragraph is not an indented code
    // block — CommonMark forbids one from interrupting a paragraph — so this
    // is markup and must fire. Marking it inert is the obvious over-broad
    // mistake this case exists to catch.
    "k-continuation.md": md("K", 'A paragraph line\n    <div data-unify="/x.html">still markup</div>'),
    // After a fence CLOSES, protection ends.
    "l-after-fence.md": md("L", '```html\n<div data-slot="a">sample</div>\n```\n\n<div class="unify-after">after</div>'),
  });
  const files = found.map((l) => (l.match(/([a-z-]+\.(?:md|html)):\d+/) ?? [])[1]).filter(Boolean);
  for (const want of ["i-real.md", "j-real.html", "k-continuation.md", "l-after-fence.md"]) {
    if (!files.includes(want)) {
      throw new Error(`${want} carries retired markup outside code and must be reported:\n${found.join("\n")}`);
    }
  }
  covers("LAY-16", "P08");
}, TEST_MS);

// ---------------------------------------------------------------- issue #154

const layoutWithSidebar =
  '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>— Site</title></head>\n' +
  "<body>\n<main><slot></slot></main>\n<aside><slot name=\"sidebar\">default side</slot></aside>\n</body>\n</html>\n";

/** Build `tree` as the source root; return the CLI result plus a reader over dist/. */
async function build(tree, args = []) {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), tree);
  const r = await runCli(["build", "-s", "src", "-o", "dist", ...args], tmp);
  return { ...r, read: (p) => readFileSync(join(tmp, "dist", p), "utf8") };
}

test("LAY-15/LAY-09 — a data-slot or data-layout that addresses nothing is the author's and ships byte-for-byte", async () => {
  // shadcn/ui-shaped markup: data-slot on every primitive, a data-layout the
  // CSS reads, and a top-level data-slot naming a slot the layout does not have.
  const r = await build({
    "_layout.html": layoutWithSidebar,
    "index.html": page(
      "Home",
      '<main><section class="grid" data-layout="grid"><article class="card">' +
        '<figure data-slot="image"><img src="hero.png" alt=""></figure><h2 data-slot="card-title">Hello</h2>' +
        '</article></section></main><div data-slot="unrelated">no such slot</div>',
    ),
    "hero.png": "",
  });
  if (r.exit !== 0) throw new Error(`markup that never addressed unify must build:\n${r.stderr}`);
  const html = r.read("index.html");
  for (const attr of ['data-layout="grid"', 'data-slot="image"', 'data-slot="card-title"', 'data-slot="unrelated"']) {
    if (!html.includes(attr)) throw new Error(`${attr} must ship as written:\n${html}`);
  }
  covers("LAY-15", "LAY-09", "P07", "P08");
}, TEST_MS);

test("LAY-15 — data-slot naming a slot the layout declares, in fill position, is P08 naming slot=", async () => {
  const cases = {
    "a direct body child": '<main><h1>Home</h1></main><aside data-slot="sidebar">meant as a fill</aside>',
    "the default-content main itself": '<main data-slot="sidebar"><h1>Home</h1></main>',
    "a child of the unwrapped main": '<main><aside data-slot="sidebar">meant as a fill</aside></main>',
  };
  for (const [name, body] of Object.entries(cases)) {
    const r = await build({ "_layout.html": layoutWithSidebar, "index.html": page("Home", body) });
    const fired = /problem: data-slot="sidebar" is not a fill — _layout\.html declares <slot name="sidebar">/.test(r.stderr);
    if (r.exit !== 1 || !fired || !/fix: write slot="sidebar" on this element/.test(r.stderr)) {
      throw new Error(`${name}: expected P08 naming slot=, got exit ${r.exit}:\n${r.stderr}`);
    }
  }
  // Deeper than fill position it is not a fill and not reported, even with a matching name.
  const deep = await build({ "_layout.html": layoutWithSidebar, "index.html": page("Home", '<main><div><p data-slot="sidebar">deep</p></div></main>') });
  if (deep.exit !== 0) throw new Error(`a nested data-slot is not in fill position:\n${deep.stderr}`);
  covers("LAY-15", "P08");
}, TEST_MS);

test("LAY-15 — in a slotted include, data-slot naming a declared slot is P08; one naming none is content for the bare slot", async () => {
  const fragment = '<div class="card"><h3><slot name="title">Untitled</slot></h3><slot></slot></div>\n';
  const bad = await build({
    "_layout.html": layoutWithSidebar,
    "_includes/card.fragment.html": fragment,
    "index.html": page("Home", '<main><include src="/_includes/card.fragment.html"><p data-slot="title">Named</p></include></main>'),
  });
  if (bad.exit !== 1 || !/problem: data-slot="title" is not a fill — _includes\/card\.fragment\.html declares <slot name="title">/.test(bad.stderr)) {
    throw new Error(`expected P08 at the include:\n${bad.stderr}`);
  }
  const ok = await build({
    "_layout.html": layoutWithSidebar,
    "_includes/card.fragment.html": fragment,
    "index.html": page("Home", '<main><include src="/_includes/card.fragment.html"><p data-slot="other">foreign</p></include></main>'),
  });
  if (ok.exit !== 0) throw new Error(ok.stderr);
  const html = ok.read("index.html");
  if (!html.includes('<p data-slot="other">foreign</p>') || !html.includes("<h3>Untitled</h3>")) throw new Error(html);
  covers("LAY-15", "P08");
}, TEST_MS);

test("LAY-09 — data-layout off the root is P07 only when its value is a layout reference", async () => {
  for (const value of ["/card.html", "none"]) {
    const r = await build({ "_layout.html": layoutWithSidebar, "index.html": page("Home", `<main><div data-layout="${value}">x</div></main>`) });
    if (r.exit !== 1 || !/problem: data-layout on <div> is never a component import/.test(r.stderr)) {
      throw new Error(`data-layout="${value}" on a <div> is still P07:\n${r.stderr}`);
    }
  }
  covers("LAY-09", "P07");
}, TEST_MS);

test("LAY-14 — P15's fix names the include recipe, not only a standalone layout (#155)", async () => {
  const r = await build({
    "_layout.html": layoutWithSidebar,
    "blog/_layout.html": layoutWithSidebar.replace("<body>", '<body data-layout="/_layout.html">'),
    "blog/post.html": page("Post", "<main><h1>Post</h1></main>"),
    "index.html": page("Home", "<main><h1>Home</h1></main>"),
  });
  if (r.exit !== 1 || !/layout chaining is not supported/.test(r.stderr) || !/keep shared chrome in _includes\/ so a section layout repeats one <include> per region/.test(r.stderr)) {
    throw new Error(`P15 must point at includes:\n${r.stderr}`);
  }
  covers("LAY-14", "P15");
}, TEST_MS);
