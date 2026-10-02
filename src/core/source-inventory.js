/**
 * `source-inventory.js` — conformance-spec §33.7, the `--source-inventory`
 * file a `--generate` script may read.
 *
 * SOURCE FACTS, NOTHING ELSE. The generator runs before the scan (§33.5), so
 * there is no manifest, no composed page and no layout to ask. What exists is
 * the author's own files, and this reads exactly three things out of each:
 * the `title`, `description` and `date` the AUTHOR wrote. It is not the
 * catalog (§30), has no layout title suffix, lists no generated page, and
 * renders no Markdown.
 *
 * NOTHING HERE IS A SECOND IMPLEMENTATION. Which files are pages is the
 * build's own scan (`scanSourceTree`, handed in by build.js, so the underscore
 * rule, `--exclude`, the never-shipped list and `.fragment.html` apply because
 * the same function applies them). A Markdown page's fields come out of the
 * same frontmatter reader `convert` uses, so a frontmatter the build would
 * refuse is refused here with the same located message. An HTML page's come
 * out of `extractDocument` and the §20 selectors the manifest uses
 * (entities decoded once, the first non-empty value wins).
 */

import { readFileSync } from "node:fs";
import { extractDocument } from "./document.js";
import { descriptionOf, firstNonEmpty, metaValues, titleOf } from "./document-selectors.js";
import { checkHtmlFrontmatter, inventoryFields } from "./markdown.js";
import { resolutionRoots } from "./paths.js";

/**
 * @param {object} args
 * @param {{absPath: string, relPath: string, isPage: boolean, excluded: boolean}[]} args.files - the SOURCE scan, sorted by relPath
 * @param {string} args.sourceRoot
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{schemaVersion: 1, pages: {source: string, href: string, title: string|null, description: string|null, date: string|null}[]}}
 */
export function buildSourceInventory({ files, sourceRoot, reporter }) {
  const roots = resolutionRoots(sourceRoot);
  const pages = [];
  for (const f of files) {
    if (!f.isPage || f.excluded) continue;
    let text;
    try {
      text = readFileSync(f.absPath, "utf8");
    } catch {
      continue; // unreadable: the build's own scan loop skips it the same way
    }
    let fields;
    if (f.relPath.endsWith(".md")) {
      fields = inventoryFields(text, { path: f.absPath, sourceRoot, roots, reporter });
    } else {
      // The page file's own <head>, as written: includes are not resolved.
      checkHtmlFrontmatter(text, { path: f.absPath, sourceRoot, roots, reporter });
      const doc = extractDocument(text);
      fields = {
        title: titleOf(doc),
        description: descriptionOf(doc),
        date: firstNonEmpty(metaValues(doc, "date")),
      };
    }
    pages.push({
      source: f.relPath,
      href: `/${f.relPath.replace(/\.md$/, ".html")}`,
      title: fields.title,
      description: fields.description,
      date: fields.date,
    });
  }
  return { schemaVersion: 1, pages };
}
