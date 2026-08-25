#!/usr/bin/env bun
/**
 * check-release-notes.mjs — release gate G14, "the release notes describe THIS
 * release".
 *
 * `.github/workflows/release_notes.md` is pasted verbatim into the GitHub
 * release body by `release.yml`. Nothing read it back, and it was wrong at two
 * consecutive releases:
 *
 *   0.8.2 — the file still held 0.8.1's text, word for word. Caught by hand,
 *           minutes before the tag.
 *   0.8.3 — the notes were written, then one more user-visible change landed
 *           afterwards. The published body listed five fixes and omitted a
 *           sixth. NOT caught: it shipped.
 *
 * Both failures share a shape — the notes and the release drifted apart, and
 * the only thing checking was someone remembering to look. This gate is that
 * someone.
 *
 * THREE ASSERTIONS, each aimed at a failure that actually happened:
 *
 *   1. VERSION. The notes must name `package.json`'s version, and must not
 *      name a version ABOVE it. This is the 0.8.2 failure exactly: stale text
 *      naming the previous release. An older version may still appear, because
 *      "Upgrading from 0.8.2" is a legitimate sentence in 0.8.3's notes.
 *
 *   2. ISSUE COVERAGE. Every `#NN` the CHANGELOG cites for this version must
 *      appear in the notes. If a fix was worth an issue reference in the
 *      changelog, a reader of the release deserves to hear about it.
 *
 *   3. ENTRY COUNT. The notes must carry at least as many bolded lead-ins as
 *      the CHANGELOG's section for this version has entries. This is the
 *      assertion that catches the 0.8.3 failure, whose missing entry cited no
 *      issue number at all — it carried a rule id (MD-22), which the notes
 *      deliberately do not use because they are written for users.
 *
 * WHY COUNTING, AND WHAT IT CANNOT DO. Matching prose to prose is not
 * something this gate can honestly attempt, so it compares the one structural
 * feature both files really share: an entry begins with a bolded lead-in.
 * Measured against both prior releases before being written this way —
 * 0.8.2 (8 vs 8, pass), 0.8.3 as published (6 vs 7, FAIL), 0.8.3 corrected
 * (7 vs 7, pass). It is a floor, not an equality: notes may say more than the
 * changelog. It cannot tell whether an entry describes the RIGHT change, only
 * that something is there for each one. A reviewer still reads the notes.
 *
 * Exit 0 clean; 1 with a located complaint per failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOTES = ".github/workflows/release_notes.md";
const CHANGELOG = "CHANGELOG.md";

const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

/** Semver compare, enough for the x.y.z this project uses. */
function above(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/** The body of `## [x.y.z]` in the changelog, up to the next `## `. */
function changelogSection(text, version) {
  const start = text.indexOf(`## [${version}]`);
  if (start === -1) return null;
  const rest = text.slice(start);
  const nextIdx = rest.indexOf("\n## ", 1);
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

const version = JSON.parse(read("package.json")).version;
const notes = read(NOTES);
const section = changelogSection(read(CHANGELOG), version);

/** @type {string[]} */
const failures = [];

if (section === null) {
  failures.push(
    `${CHANGELOG} has no "## [${version}]" section, so there is nothing to check the notes against.\n` +
    `  fix: add the section for the version in package.json, or correct the version`,
  );
}

// ---- 1. the notes name this version, and nothing newer
const versionsInNotes = [...new Set([...notes.matchAll(/\bv?(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]))];
if (!versionsInNotes.includes(version)) {
  failures.push(
    `${NOTES} never names ${version}, the version in package.json.\n` +
    `  it names: ${versionsInNotes.join(", ") || "(no version at all)"}\n` +
    `  fix: rewrite the notes for this release — the file is pasted verbatim into the release body`,
  );
}
for (const v of versionsInNotes) {
  if (above(v, version)) {
    failures.push(
      `${NOTES} names ${v}, which is newer than package.json's ${version}.\n` +
      `  fix: one of the two is wrong; they are the same release`,
    );
  }
}

if (section !== null) {
  // ---- 2. every issue the changelog cites is mentioned
  const cited = [...new Set([...section.matchAll(/#(\d+)/g)].map((m) => m[1]))];
  const missing = cited.filter((n) => !notes.includes(`#${n}`));
  if (missing.length) {
    failures.push(
      `${NOTES} does not mention ${missing.map((n) => `#${n}`).join(", ")}, ` +
      `cited by ${CHANGELOG}'s ${version} section.\n` +
      `  fix: describe those changes in the notes, or drop them from the changelog section`,
    );
  }

  // ---- 3. an entry apiece
  const entryRe = /^- \*\*/gm;
  const leadInRe = /^(?:- )?\*\*/gm;
  const changelogEntries = (section.match(entryRe) ?? []).length;
  const noteLeadIns = (notes.match(leadInRe) ?? []).length;
  if (noteLeadIns < changelogEntries) {
    failures.push(
      `${NOTES} has ${noteLeadIns} bolded entries; ${CHANGELOG}'s ${version} section has ${changelogEntries}.\n` +
      `  a change landed in the changelog that the notes never describe — which is how v0.8.3 shipped\n` +
      `  a release body listing five fixes when there were six.\n` +
      `  fix: add the missing entry to the notes (a floor, not an equality — saying more is fine)`,
    );
  }
}

if (failures.length) {
  for (const f of failures) console.error(`release notes: ${f}`);
  console.error(`release notes: ${failures.length} problem${failures.length === 1 ? "" : "s"}`);
  process.exit(1);
}

console.log(`release notes: OK — ${version}, checked against ${CHANGELOG}`);
