/**
 * `unify.template.json` — the project's record of the template it was
 * scaffolded from (conformance-spec §19.10), and the one piece of ownership
 * metadata a template may ship.
 *
 * Two readers, one file name:
 *
 *  - IN A TEMPLATE, the file is the author's manifest: `{"owned": [...]}`,
 *    patterns (the `--exclude` grammar, §4.1, matched against template-relative
 *    paths such as `site/config.json` or `site/reports/**`) naming the files a
 *    site owns once scaffolded — seeds, configuration, content — which
 *    `unify update` then never rewrites, removes or reports. It is packaging:
 *    read, never copied.
 *
 *  - IN A PROJECT, the file is what `unify init` wrote and `unify update`
 *    reads back: the source as the author typed it, the revision that was
 *    fetched, the template's source directory and `owned` list, and a SHA-256
 *    of every file the template provided, keyed by its template-relative path.
 *    Those hashes are the baseline that tells a local edit from an upstream
 *    change (§19.10's three-way rule) without keeping a copy of the old
 *    template around.
 *
 * It sits at the project root beside `unify.yaml` and, like it, is on §4.3's
 * never-shipped list: it describes the project and must never publish. It is
 * JSON rather than YAML because it holds a map of hashes nobody edits by hand,
 * and because §18's tiny `unify.yaml` reader is deliberately unable to hold a
 * map — the two files answer different questions and must not blur.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../core/diagnostics.js";

export const RECORD_FILE = "unify.template.json";
const SCHEMA_VERSION = 1;

/**
 * @typedef {object} TemplateRecord
 * @property {number} schemaVersion
 * @property {string} source - the positional as typed to init (or update)
 * @property {string|null} revision - git commit, npm version, unify version, or null for a directory
 * @property {string|null} sourceDir - the template's source directory (`site`), null for a bare source tree
 * @property {string[]} owned - the template's site-owned patterns
 * @property {Record<string, string>} files - template-relative path → sha256 of the content the template provided
 */

/** @param {Uint8Array|string} content @returns {string} */
export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * A template file's key in the record: where it sits in the TEMPLATE, which
 * is also where `owned` patterns are written against.
 * @param {string|null} sourceDir
 * @param {string} rel - source-root-relative
 */
export function sourceKey(sourceDir, rel) {
  return sourceDir === null ? rel : `${sourceDir}/${rel}`;
}

/**
 * The record `init` writes for a template it just scaffolded.
 * @param {import('./template-source.js').Template} template
 * @returns {TemplateRecord}
 */
export function buildRecord({ files, rootFiles, sourceDir, owned, revision, label }) {
  const hashes = {};
  for (const [rel, content] of Object.entries(files)) hashes[sourceKey(sourceDir, rel)] = hashContent(content);
  for (const [rel, content] of Object.entries(rootFiles)) hashes[rel] = hashContent(content);
  return { schemaVersion: SCHEMA_VERSION, source: label, revision, sourceDir, owned, files: sortKeys(hashes) };
}

/** @param {Record<string, string>} map */
function sortKeys(map) {
  return Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
}

/** @param {TemplateRecord} record @returns {string} the bytes written — stable, newline-terminated */
export function serializeRecord(record) {
  return `${JSON.stringify({ ...record, files: sortKeys(record.files) }, null, 2)}\n`;
}

/** @param {string} projectRoot @param {TemplateRecord} record */
export function writeRecord(projectRoot, record) {
  writeFileSync(join(projectRoot, RECORD_FILE), serializeRecord(record));
}

/**
 * The project's record, or null when there is none. A file that is there but
 * is not a record is a usage error naming it — guessing a baseline is the one
 * thing §19.10 forbids.
 * @param {string} projectRoot
 * @returns {TemplateRecord|null}
 */
export function readRecord(projectRoot) {
  const path = join(projectRoot, RECORD_FILE);
  if (!existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UsageError(`${RECORD_FILE}: not valid JSON: ${error.message}`, ["restore it from version control, or re-adopt the template: unify update --adopt <source>"]);
  }
  if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== SCHEMA_VERSION || typeof parsed.source !== "string" || !parsed.files || typeof parsed.files !== "object") {
    throw new UsageError(`${RECORD_FILE}: not a template record unify wrote (schemaVersion ${SCHEMA_VERSION} with source and files)`, [
      "restore it from version control, or re-adopt the template: unify update --adopt <source>",
    ]);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    source: parsed.source,
    revision: typeof parsed.revision === "string" ? parsed.revision : null,
    sourceDir: typeof parsed.sourceDir === "string" ? parsed.sourceDir : null,
    owned: ownedList(parsed.owned, path),
    files: Object.fromEntries(Object.entries(parsed.files).filter(([, v]) => typeof v === "string")),
  };
}

/**
 * A template's `owned` patterns from its manifest at `path`, or none.
 * @param {string} path
 * @returns {string[]}
 */
export function readOwned(path) {
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UsageError(`the template's ${RECORD_FILE} is not valid JSON: ${error.message}`, ["it is the template's manifest: {\"owned\": [\"site/config.json\"]}"]);
  }
  return ownedList(parsed?.owned, path);
}

/** @param {unknown} value @param {string} path @returns {string[]} */
function ownedList(value, path) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v === "" || v.split("/").includes(".."))) {
    throw new UsageError(`${path}: "owned" must be a list of template-relative path patterns`, ['for example: {"owned": ["site/config.json", "site/reports/**"]}']);
  }
  return value;
}
