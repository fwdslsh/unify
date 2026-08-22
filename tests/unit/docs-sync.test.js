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

test("README.md's own summary of the frontmatter keys, when it carries one, names the same set as the authoring rules", () => {
  // The README embeds `docs/authoring-rules.md` verbatim, so a claim it makes
  // in its OWN prose can contradict the copy it carries 120 lines later, and
  // the byte-identity test above cannot see it: it compares the embed, not the
  // document around it. That is exactly what happened. The README said
  // "`title`, `layout`, `class`, `lang`, and `dir` are the frontmatter keys
  // with behavior; every other key becomes a `<meta>` tag" while its own
  // embedded rules said "`title`, `layout`, `class`, `lang`, `dir`, and
  // `schema` are the only keys with meaning" — and §10.2/§26.4 make the embed
  // right: `schema: article` is problem P23, not a `<meta name="schema">`.
  //
  // Both sentences enumerate a set, so the check is set equality on the
  // backticked keys before the phrase each uses to end the list — conditional
  // on the README making a claim of its own at all. The embed above is the
  // rule set's guaranteed in-README presence, so prose that stops duplicating
  // the enumeration has nothing left to drift: its absence is a legitimate
  // edit, never a failure (a check that pins a sentence into existence is a
  // tripwire, not a sync). The accepted cost, stated: a paraphrase that
  // rewords the marker phrase escapes this check. What the README may not do
  // is keep the phrase and change the set.
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const README_MARKER = "are the frontmatter keys with behavior";
  if (!readme.includes(README_MARKER)) return;

  const rules = readFileSync(join(ROOT, "docs", "authoring-rules.md"), "utf8");

  const keysBefore = (text, marker, label) => {
    const at = text.indexOf(marker);
    if (at < 0) throw new Error(`${label} no longer contains "${marker}" — this test's reading is stale, not the document`);
    // Walk back over the enumeration: backticked spans separated by commas,
    // "and", and parentheticals, up to the start of the sentence.
    const before = text.slice(Math.max(0, at - 240), at);
    const sentence = before.slice(before.lastIndexOf(". ") + 1);
    const keys = [...sentence.matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
    if (keys.length === 0) throw new Error(`${label}: found no backticked keys before "${marker}"`);
    return [...new Set(keys)].sort();
  };

  const fromRules = keysBefore(rules, "are the only keys with meaning", "docs/authoring-rules.md");
  const fromReadme = keysBefore(readme, README_MARKER, "README.md");
  expect(fromReadme, "README.md's frontmatter-key list and docs/authoring-rules.md's must name the same keys — one rule set, two audiences (product-spec §6.7)").toEqual(fromRules);
});

/**
 * The option surface, checked against the parser rather than against memory.
 *
 * `--generate` shipped working and undocumented in three places at once: the
 * `--help` text, the reference page's synopsis, and CLAUDE.md's. The reference
 * page opens by claiming it "lists every command, every option, and every exit
 * code — there are no others", which is the kind of promise that is true when
 * written and quietly false one commit later.
 *
 * So the parser is the source of truth and the prose is compared to it. Adding
 * an option to `options.js` and nowhere else now fails here, naming the file
 * that is missing it — which is the only version of this check that survives
 * the next flag.
 */
/**
 * Every option the parser accepts, as `{name, short}`. The short alias counts
 * as documentation where a document uses it: CLAUDE.md's synopsis writes
 * `[-s src]`, which names the option to any reader, and demanding the long
 * spelling there would be the check dictating prose rather than checking it.
 */
function parsedOptions() {
  const src = readFileSync(join(ROOT, "src", "cli", "options.js"), "utf8");
  const table = src.slice(src.indexOf("const OPTIONS"), src.indexOf("const CONFIG_KEYS"));
  return [...table.matchAll(/^\s*"?([a-z][a-z-]*)"?:\s*\{\s*kind:\s*"[a-z]+"(,\s*short:\s*"([a-z])")?/gm)]
    .map((m) => ({ name: m[1], short: m[3] ?? null }));
}

/** True when the document names this option, in either spelling. */
function names(text, option) {
  if (new RegExp(`--${option.name}\\b`).test(text)) return true;
  return option.short !== null && new RegExp(`(^|[\\s(\\[\`])-${option.short}\\b`, "m").test(text);
}

test("every option the parser accepts is named in --help, the reference, and CLAUDE.md", () => {
  const parsed = parsedOptions();
  // A positive control on the extractor itself: if this ever comes back empty
  // or tiny, the regex stopped matching and every assertion below passes
  // vacuously — the exact way a sync check rots into decoration.
  expect(parsed.length).toBeGreaterThan(10);
  expect(parsed.map((o) => o.name)).toContain("generate");
  expect(parsed.find((o) => o.name === "source").short).toBe("s");

  const undocumented = [];
  for (const [label, relPath] of [
    ["src/cli.js --help text", join("src", "cli.js")],
    ["docs/cli-reference.md", join("docs", "cli-reference.md")],
    // product-spec §4 claims to list the ENTIRE CLI, and it was the one
    // synopsis this test did not read — which is exactly where seven 0.8
    // flags sat undocumented until the v0.8.0 release review.
    ["docs/product-spec.md", join("docs", "product-spec.md")],
    ["CLAUDE.md", "CLAUDE.md"],
  ]) {
    const text = readFileSync(join(ROOT, relPath), "utf8");
    for (const option of parsed) {
      if (!names(text, option)) undocumented.push(`--${option.name} is missing from ${label}`);
    }
  }
  expect(undocumented).toEqual([]);
});
