/**
 * `unify build --save-config` (§18): upsert the saveable flags given on this
 * command line into the `unify.yaml` that was read, line by line, so the author's
 * comments, ordering and untouched keys survive byte-for-byte.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { UsageError } from "../core/diagnostics.js";
import { CONFIG_KEYS, parseConfig, templateLines, templateRecord } from "./options.js";

/** `source` is written only by cli.js, and only when the file sits outside the source root (§18); `template` only by `recordTemplate` below (init and update, §19.10). Neither is ever one of these entries. */
const WRITABLE = CONFIG_KEYS.filter((key) => key !== "source" && key !== "template");

/**
 * @param {string} value
 * @param {string} key
 * @returns {string}
 */
function scalar(value, key) {
  // The reader strips ` #…` before it unquotes and never unescapes, so a value
  // holding either of those cannot be written back faithfully. Refuse it.
  if (/\s#/.test(value) || (value.includes('"') && value.includes("'"))) {
    throw new UsageError(`--save-config cannot write --${key}: the value cannot be saved to unify.yaml faithfully`, [
      "edit unify.yaml by hand, or avoid ` #` and mixed quote characters in the value",
    ]);
  }
  const plain = value !== "" && !/^(true|false)$/.test(value) && !/^[\s'"\-?:,[\]{}#&*!|>%@`]/.test(value) && !/:\s|\s$/.test(value);
  if (plain) return value;
  return value.includes('"') ? `'${value}'` : `"${value}"`;
}

/**
 * The lines each saveable option given on the command line would write.
 * @param {Record<string, any>} flags
 * @returns {Map<string, string[]>}
 */
export function saveEntries(flags) {
  const entries = new Map();
  for (const key of WRITABLE) {
    if (!(key in flags)) continue;
    const value = flags[key];
    if (Array.isArray(value)) {
      entries.set(key, [`${key}:`, ...value.map((item) => `  - ${scalar(item, key)}`)]);
    } else if (value === true) {
      entries.set(key, [`${key}: true`]);
    } else {
      entries.set(key, [`${key}: ${scalar(String(value), key)}`]);
    }
  }
  return entries;
}

/**
 * @param {string} path - the unify.yaml to upsert into (`options.js`'s `configPath`)
 * @param {Map<string, string[]>} entries
 * @returns {string} the path written
 */
export function writeConfig(path, entries) {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  const pending = new Map(entries);
  // The file `init` writes lists every option commented out (`# catalog: true`
  // under its one-line description). A key with no live line takes the place
  // of its commented line, so saving a flag reads as uncommenting it rather
  // than leaving the commented copy behind and appending a second one at the end.
  const live = new Set(lines.map((line) => line.match(/^([A-Za-z][\w-]*):/)?.[1]).filter(Boolean));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].match(/^([A-Za-z][\w-]*):/)?.[1];
    const commented = lines[i].match(/^#\s*([A-Za-z][\w-]*):/)?.[1];
    if (key && pending.has(key)) {
      out.push(...pending.get(key));
      pending.delete(key);
      // A replaced key takes its old block with it: list items, the lines indented under template:, comments among them.
      while (i + 1 < lines.length && /^\s+\S|^-\s/.test(lines[i + 1])) i++;
    } else if (commented && pending.has(commented) && !live.has(commented)) {
      out.push(...pending.get(commented));
      pending.delete(commented);
      // The commented lines indented under it — list items, template:'s source: and keep: — go too.
      while (i + 1 < lines.length && /^#\s+-\s|^#\s{2,}\S/.test(lines[i + 1])) i++;
    } else {
      out.push(lines[i]);
    }
  }
  for (const replacement of pending.values()) out.push(...replacement);

  writeFileSync(path, out.join(eol) + eol);
  return path;
}

/**
 * §19.10 — the record: `template: <source>` as it was typed, or `source:`
 * inside the `template:` block when the file carries a `keep:` list — the
 * block is rewritten whole, its list kept — upserted into the file like any
 * saved flag, taking the commented block's place when there is one. The
 * file is created when absent.
 * @param {string} path - the unify.yaml to write
 * @param {string} source
 * @returns {string} the path written
 */
export function recordTemplate(path, source) {
  const { keep } = templateRecord(existsSync(path) ? parseConfig(readFileSync(path, "utf8")).template : undefined);
  return writeConfig(path, new Map([["template", templateLines({ source, keep }, (value) => scalar(value, "template"))]]));
}
