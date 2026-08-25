#!/usr/bin/env bun
/**
 * extract-release-notes.mjs — the release body IS the CHANGELOG section.
 *
 * Prints the `## [x.y.z]` section of CHANGELOG.md for package.json's version,
 * under a release-body heading; exits 1 with a located complaint when the
 * section is missing or empty. `release.yml` runs it twice — once in the gate
 * block with stdout discarded (gate G14), once to compose the release body —
 * so the check and the extraction are the same code and cannot drift apart.
 *
 * THIS FILE REPLACES A HAND-MAINTAINED `release_notes.md`, AND THE HISTORY IS
 * THE ARGUMENT. That file was a second hand-written description of the same
 * release, and it was wrong at both releases that used it: at 0.8.2 it still
 * held 0.8.1's text (caught by hand, minutes before the tag), and at 0.8.3 it
 * was missing a change that landed after it was written (not caught — the
 * published release listed five fixes when there were six). The CHANGELOG was
 * correct both times, because the repo's discipline is that a fix lands with
 * its changelog entry in the same commit. The failure mode was never "the
 * notes were badly written"; it was "there were two of them". A first
 * response added a gate that compared the two files — counted their bolded
 * entries, matched their issue references — which instrumented the
 * duplication instead of removing it. This removes it: one authored source,
 * and a body derived from it cannot drift from it.
 *
 * What remains checkable is structural, not textual: the section for the
 * version being released must exist and be non-empty. That goes red between
 * bumping the version and writing its changelog section, which is the point —
 * they are two halves of one change.
 *
 * Boundaries: a section runs from its `## [x.y.z]` heading to the next `## `
 * heading, or — for the oldest section — to the reference-link block
 * (`[x.y.z]: https://…`) at the file's end. The heading line itself is
 * dropped (the release page's own title already names the version) and
 * replaced with a stable lead-in.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const version = JSON.parse(read("package.json")).version;
const changelog = read("CHANGELOG.md");

const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const headingRe = new RegExp(`^## \\[${escaped}\\][^\n]*\n`, "m");
const heading = headingRe.exec(changelog);

if (!heading) {
  console.error(
    `release notes: CHANGELOG.md has no "## [${version}]" section, and the release body is that section.\n` +
    `  package.json says ${version}; the changelog's sections are: ` +
    `${[...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]).join(", ")}\n` +
    `  fix: write the ## [${version}] section (bumping the version and writing its section are two halves of one change)`,
  );
  process.exit(1);
}

const afterHeading = heading.index + heading[0].length;
const rest = changelog.slice(afterHeading);
// Next section heading, or the reference-link block that ends the file.
const endRe = /^## \[|^\[[^\]]+\]:\s+https?:\/\//m;
const end = endRe.exec(rest);
const body = (end ? rest.slice(0, end.index) : rest).trim();

if (body === "") {
  console.error(
    `release notes: CHANGELOG.md's "## [${version}]" section is empty, and the release body is that section.\n` +
    `  fix: describe the release there — it is the one place the notes are written`,
  );
  process.exit(1);
}

console.log(`## What v${version} changes\n`);
console.log(body);
