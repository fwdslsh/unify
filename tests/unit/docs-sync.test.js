/**
 * The README embeds `docs/authoring-rules.md` verbatim between two HTML
 * comment markers, and product-spec §6.7 requires that: "The README and CLI
 * help must carry the same rules for humans and agents that do not discover
 * `AGENTS.md`; no behavior may be documented only in the agent guide, and
 * there is one rule set rather than tool-specific variants."
 *
 * Nothing checked it, and the copies drifted the first time the rules changed
 * after §26 gave `schema:` a meaning: `docs/authoring-rules.md` gained the key
 * and the README went on saying "JSON-LD ha[s] no frontmatter key" — the one
 * failure mode a duplicated document has, arriving on the very edit that
 * created the duplication's first real divergence. A marker pair is a promise
 * that something copies one into the other; until this file existed the
 * promise was kept by whoever remembered.
 *
 * The check is a byte comparison rather than a fuzzy one on purpose. The
 * embed is a copy, so "nearly the same" is the state this exists to catch:
 * two sentences that differ by one clause are exactly how a reader ends up
 * with the wrong rule and no way to tell which copy is current.
 *
 * No `src/**` import and no mock (hygiene H1): this reads two files on disk
 * and compares them.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BEGIN = "<!-- BEGIN docs/authoring-rules.md -->";
const END = "<!-- END docs/authoring-rules.md -->";

test("the README's embedded copy of docs/authoring-rules.md is byte-identical to the file", () => {
  const rules = readFileSync(join(ROOT, "docs", "authoring-rules.md"), "utf8").replace(/\n+$/, "");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");

  const i = readme.indexOf(BEGIN);
  const j = readme.indexOf(END);
  expect(i, `README.md must carry ${BEGIN}`).toBeGreaterThanOrEqual(0);
  expect(j, `README.md must carry ${END}`).toBeGreaterThan(i);

  const embedded = readme.slice(i + BEGIN.length, j).replace(/^\n+/, "").replace(/\n+$/, "");
  if (embedded !== rules) {
    // Name the first differing line: the whole document in a failure message
    // is unreadable, and the line number is what an author needs.
    const a = embedded.split("\n");
    const b = rules.split("\n");
    const n = a.findIndex((line, k) => line !== b[k]);
    const at = n === -1 ? Math.min(a.length, b.length) : n;
    throw new Error(
      "README.md and docs/authoring-rules.md have drifted — one rule set, two copies.\n" +
      `  first difference at line ${at + 1} of the embed:\n` +
      `    docs/authoring-rules.md: ${JSON.stringify(b[at] ?? "(end of file)")}\n` +
      `    README.md:               ${JSON.stringify(a[at] ?? "(end of file)")}\n` +
      "  the file is the source; copy it between the markers.",
    );
  }
});

test("the authoring rules still fit the one screen they claim", () => {
  // The document's own first line calls itself "the complete rules", and
  // product-spec §6.1 makes that a constraint rather than a boast: "New
  // behavior must still be explainable in one sentence and keep the core
  // authoring rules on one screen." docs/ratification-protocol.md measures
  // the claim empirically at 60 lines; this pins the number so a feature that
  // needs a paragraph has to argue for it rather than append one.
  const rules = readFileSync(join(ROOT, "docs", "authoring-rules.md"), "utf8").replace(/\n+$/, "");
  expect(rules.split("\n").length).toBeLessThanOrEqual(60);
});
