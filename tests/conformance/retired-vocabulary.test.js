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
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
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
