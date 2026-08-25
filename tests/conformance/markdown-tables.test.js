/**
 * §10.1 / MD-22 — GFM pipe tables, the one grammar added to CommonMark's own.
 *
 * markdown-it's `commonmark` preset disables tables, and that was taken as
 * "CommonMark, no extensions" until the consequence was looked at: a pipe
 * table publishes as a paragraph of literal `| Flag | Meaning |` text. unify's
 * own documentation site shipped 247 such rows across eight pages and not one
 * `<table>` element.
 *
 * The second test is the one that keeps this honest. Tables were enabled as a
 * single rule rather than by switching presets, so the assertion that matters
 * is not only "tables work" but "and nothing else changed".
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const md = (title, body) => `---\ntitle: ${title}\ndescription: The ${title} page.\n---\n\n${body}\n`;

async function buildOne(name, body) {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { [name]: md("T", body) });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`build failed:\n${r.stderr}`);
  return readFileSync(join(tmp, "dist", name.replace(/\.md$/, ".html")), "utf8");
}

test("MD-22 — a pipe table converts to a real table element", async () => {
  const html = await buildOne("index.md", [
    "| Flag | Meaning |",
    "|---|---|",
    "| `-s` | source |",
    "| `-o` | output |",
  ].join("\n"));

  for (const want of ["<table>", "<thead>", "<th>Flag</th>", "<tbody>", "<td><code>-s</code></td>"]) {
    if (!html.includes(want)) throw new Error(`expected ${want} in the converted output:\n${html}`);
  }
  // The failure this rule exists to end: the row surviving as literal text.
  if (/^\s*\|\s*Flag\s*\|/m.test(html)) {
    throw new Error(`the table published as literal pipe text:\n${html}`);
  }
  covers("MD-22", "MD-01");
}, TEST_MS);

test("MD-22 — strikethrough converts, and no author text is rewritten", async () => {
  // The default preset adds exactly two grammars over `commonmark`: tables
  // and strikethrough. `linkify` and `typographer` are OPTIONS rather than
  // rules and stay off, which is the part worth pinning — each would rewrite
  // text the author wrote (an address into an anchor, a quotation mark into a
  // curly one), and enabling either is a decision, not a side effect.
  const html = await buildOne("index.md", [
    'Visit www.example.com for ~~struck~~ text and "quoted" words -- really...',
    "",
    "| A |",
    "|---|",
    "| 1 |",
  ].join("\n"));

  if (!html.includes("<table>")) throw new Error(`the table must convert:\n${html}`);
  // strikethrough: on.
  if (!/<s>struck<\/s>/.test(html)) throw new Error(`strikethrough must convert:\n${html}`);
  // linkify: off — the bare host stays text, not an anchor.
  if (/<a [^>]*href="[^"]*example\.com/.test(html)) throw new Error(`linkify must stay off:\n${html}`);
  // typographer: off — no curly quotes, no en dash, no ellipsis character.
  if (/[\u201c\u201d\u2013\u2014\u2026]/.test(html)) throw new Error(`typographer must stay off:\n${html}`);
  if (!html.includes("&quot;quoted&quot;")) throw new Error(`quotes must survive as written:\n${html}`);
  covers("MD-22");
}, TEST_MS);
