/** Open Graph defaults, from the completed document rather than source metadata. */
import { canonicalOf, descriptionOf, titleOf } from "./document-selectors.js";
import { extractDocument } from "./document.js";
import { decodeEntities } from "./entities.js";
import { applyEdits, findAll, findFirst, getAttr, isElement, parse } from "./html.js";

const FIELDS = ["og:title", "og:description", "og:url"];
const keyOf = (node) => decodeEntities(getAttr(node, "property") ?? "").trim().toLowerCase();
const escapeAttr = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const headOf = (text) => findFirst(parse(text).root, (node) => isElement(node, "head"));

/** Presence, including empty content, after PAGE includes but before layout merge. */
export function declaredOpenGraph(text) {
  const head = headOf(text);
  return new Set(head ? findAll(head, (node) => isElement(node, "meta"))
    .map(keyOf).filter((key) => FIELDS.includes(key)) : []);
}

/**
 * Page declarations win; final document values replace layout fallbacks;
 * missing values leave those fallbacks alone. No new head is synthesized.
 * Edits are applied right-to-left; their positions are therefore valid in
 * application order, and reversed here for the existing diagnostic locator.
 */
export function completeOpenGraph(text, pageKeys) {
  const head = headOf(text);
  if (!head || head.endTagStart === null) return { text, insertions: [] };
  const doc = extractDocument(text);
  const values = [titleOf(doc), descriptionOf(doc), canonicalOf(doc)];
  const metas = findAll(head, (node) => isElement(node, "meta"));
  const lead = /(\r?\n[ \t]*)$/.exec(text.slice(head.openTagEnd, head.endTagStart))?.[1] ?? "";
  const edits = [];
  const missing = [];
  for (const [index, key] of FIELDS.entries()) {
    if (pageKeys.has(key) || values[index] === null) continue;
    const tag = `<meta property="${key}" content="${escapeAttr(values[index])}">`;
    const inherited = metas.filter((node) => keyOf(node) === key);
    if (!inherited.length) missing.push(tag);
    else inherited.forEach((node, i) => edits.push({ start: node.start, end: node.end, replacement: i ? "" : tag }));
  }
  if (missing.length) edits.push({ start: head.endTagStart, end: head.endTagStart, replacement: missing.join(lead) + lead });
  return {
    text: applyEdits(text, edits),
    insertions: edits.sort((a, b) => a.start - b.start).map((edit) => ({
      at: edit.start, length: edit.replacement.length, replacedLength: edit.end - edit.start,
    })),
  };
}
