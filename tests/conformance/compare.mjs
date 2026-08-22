/**
 * compare.mjs — the ONE tree comparator for the conformance suite.
 *
 * Contract (docs/testing-strategy.md §2, quoted here so a drift is visible):
 * tree comparison is bidirectional (a file missing from the output fails, an
 * extra emitted file fails). Non-HTML files are compared byte-for-byte. HTML
 * files (.html) are parsed and compared exactly on the file set, the doctype,
 * element structure, tag names, attributes (names, values, and order),
 * comments, and text content — with precisely ONE normalization: a text node
 * consisting entirely of whitespace, whose parent is not <pre>, <textarea>,
 * <script>, or <style>, is dropped from both sides before comparison. That is
 * the conformance-spec §3 waiver (whitespace between block-level elements is
 * not normative) and nothing more.
 *
 * Deliberately absent, because each was a failure mode of the previous
 * implementation (strategy §1 M5): no trimming, no entity decoding (entity
 * folding would equate `&amp;` and `&`), no attribute reordering, no tag-case
 * folding (`<DIV>` != `<div>`), no whitespace collapsing inside text. Text
 * nodes containing any non-whitespace are compared byte-for-byte including
 * surrounding whitespace.
 *
 * The parser is a small strict tokenizer, not a browser tree builder, on
 * purpose: it performs no error correction that could hide a difference, and
 * both sides of every comparison go through the identical code path. Known
 * (stated) deviations from browser parsing, harmless because they apply to
 * both sides equally: no implicit <html>/<head>/<body> synthesis, no
 * dropping of the newline right after <pre>/<textarea>, and `<div/>` is
 * treated as self-closing rather than open.
 *
 * Byte-level helpers (snapshotTree/diffSnapshots) exist for the claims the
 * strategy keeps byte-exact even for HTML: publish sentinels (PUB-01),
 * source-tree containment (PUB-03), and determinism (DIA-05/G6).
 */
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);
// The single normalization's exemption list — verbatim from the contract.
const WHITESPACE_SIGNIFICANT_PARENTS = new Set(["pre", "textarea", "script", "style"]);
const HTML_WS_ONLY = /^[ \t\n\r\f]+$/;

// ---------------------------------------------------------------- tree walk

/** Sorted relative paths of every regular file (and symlink) under dir. */
export function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    const abs = rel ? join(dir, rel) : dir;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

/** Map of relative path -> Buffer for every file under dir (symlinks recorded as their target string). */
export function snapshotTree(dir) {
  const snap = new Map();
  const walk = (rel) => {
    const abs = rel ? join(dir, rel) : dir;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(dir, childRel);
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isSymbolicLink()) snap.set(childRel, Buffer.from(`symlink:${readlinkSync(childAbs)}`));
      else snap.set(childRel, readFileSync(childAbs));
    }
  };
  walk("");
  return snap;
}

/** Byte-exact bidirectional diff of two snapshots. Returns human-readable difference strings. */
export function diffSnapshots(before, after, labelBefore = "before", labelAfter = "after") {
  const diffs = [];
  for (const [rel, bytes] of before) {
    if (!after.has(rel)) diffs.push(`${rel}: present ${labelBefore}, missing ${labelAfter}`);
    else if (!bytes.equals(after.get(rel))) diffs.push(`${rel}: bytes differ between ${labelBefore} and ${labelAfter}`);
  }
  for (const rel of after.keys()) {
    if (!before.has(rel)) diffs.push(`${rel}: absent ${labelBefore}, appeared ${labelAfter}`);
  }
  return diffs;
}

// ------------------------------------------------------------- HTML parsing

function parseHtml(text) {
  const root = { type: "root", tag: null, children: [] };
  const stack = [root];
  let doctype = null;
  let i = 0;
  const top = () => stack[stack.length - 1];
  const pushText = (s) => { if (s) top().children.push({ type: "text", data: s }); };

  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) { pushText(text.slice(i)); break; }
    if (lt > i) pushText(text.slice(i, lt));

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      top().children.push({ type: "comment", data: text.slice(lt + 4, end === -1 ? text.length : end) });
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    if (/^<!doctype/i.test(text.slice(lt, lt + 9))) {
      const gt = text.indexOf(">", lt);
      doctype = text.slice(lt, gt === -1 ? text.length : gt + 1);
      i = gt === -1 ? text.length : gt + 1;
      continue;
    }
    if (text.startsWith("<!", lt) || text.startsWith("<?", lt)) {
      const gt = text.indexOf(">", lt);
      top().children.push({ type: "bogus", raw: text.slice(lt, gt === -1 ? text.length : gt + 1) });
      i = gt === -1 ? text.length : gt + 1;
      continue;
    }
    if (text.startsWith("</", lt)) {
      const m = /^<\/([^\s>]+)\s*>/.exec(text.slice(lt));
      if (!m) { pushText("<"); i = lt + 1; continue; }
      const name = m[1].toLowerCase();
      let found = -1;
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tag.toLowerCase() === name) { found = s; break; }
      }
      if (found === -1) top().children.push({ type: "stray-endtag", tag: m[1] });
      else stack.length = found; // closes intermediates too; deterministic on both sides
      i = lt + m[0].length;
      continue;
    }
    const tm = /^<([a-zA-Z][^\s/>]*)/.exec(text.slice(lt));
    if (!tm) { pushText("<"); i = lt + 1; continue; }
    const tag = tm[1];
    let j = lt + tm[0].length;
    const attrs = [];
    let selfClosing = false;
    for (;;) {
      while (j < text.length && /[ \t\n\r\f]/.test(text[j])) j++;
      if (j >= text.length) break;
      if (text[j] === ">") { j++; break; }
      if (text[j] === "/") {
        if (text[j + 1] === ">") { selfClosing = true; j += 2; break; }
        j++; continue;
      }
      const am = /^[^\s=/>]+/.exec(text.slice(j));
      if (!am) { j++; continue; }
      const aname = am[0];
      j += aname.length;
      let k = j;
      while (k < text.length && /[ \t\n\r\f]/.test(text[k])) k++;
      let avalue = null;
      if (text[k] === "=") {
        k++;
        while (k < text.length && /[ \t\n\r\f]/.test(text[k])) k++;
        const q = text[k];
        if (q === '"' || q === "'") {
          const endq = text.indexOf(q, k + 1);
          avalue = text.slice(k + 1, endq === -1 ? text.length : endq);
          k = endq === -1 ? text.length : endq + 1;
        } else {
          const vm = /^[^\s>]*/.exec(text.slice(k));
          avalue = vm[0];
          k += vm[0].length;
        }
        j = k;
      }
      attrs.push([aname, avalue]); // value null = bare attribute, distinct from =""
    }
    const node = { type: "element", tag, attrs, children: [] };
    top().children.push(node);
    const lower = tag.toLowerCase();
    if (RAW_TEXT_ELEMENTS.has(lower)) {
      const rest = text.slice(j);
      const cm = new RegExp(`</${lower}[\\s/>]`, "i").exec(rest);
      const rawEnd = cm ? j + cm.index : text.length;
      const raw = text.slice(j, rawEnd);
      if (raw) node.children.push({ type: "text", data: raw });
      if (cm) {
        const gt = text.indexOf(">", rawEnd);
        i = gt === -1 ? text.length : gt + 1;
      } else i = text.length;
      continue;
    }
    if (!VOID_ELEMENTS.has(lower) && !selfClosing) stack.push(node);
    i = j;
  }
  return { doctype, root };
}

/** Apply the contract's single normalization, in place. */
function dropInsignificantWhitespace(node) {
  const parentTag = node.type === "element" ? node.tag.toLowerCase() : null;
  const exempt = parentTag !== null && WHITESPACE_SIGNIFICANT_PARENTS.has(parentTag);
  node.children = node.children.filter(
    (c) => !(c.type === "text" && !exempt && HTML_WS_ONLY.test(c.data)),
  );
  for (const c of node.children) if (c.children) dropInsignificantWhitespace(c);
}

function nodeLabel(n, index) {
  if (n.type === "element") return `${n.tag}[${index}]`;
  return `#${n.type}[${index}]`;
}

function describeNode(n) {
  switch (n.type) {
    case "element": return `<${n.tag}${n.attrs.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}="${v}"`)).join("")}>`;
    case "text": return `text ${JSON.stringify(n.data.length > 80 ? n.data.slice(0, 77) + "..." : n.data)}`;
    case "comment": return `comment ${JSON.stringify(n.data.length > 60 ? n.data.slice(0, 57) + "..." : n.data)}`;
    case "bogus": return `markup ${JSON.stringify(n.raw)}`;
    case "stray-endtag": return `stray </${n.tag}>`;
    default: return n.type;
  }
}

function diffNodeLists(expected, actual, path, diffs) {
  const n = Math.max(expected.length, actual.length);
  for (let idx = 0; idx < n; idx++) {
    if (diffs.length >= 25) return;
    const e = expected[idx];
    const a = actual[idx];
    if (!e) { diffs.push(`${path}: unexpected extra node: ${describeNode(a)}`); continue; }
    if (!a) { diffs.push(`${path}: missing node: ${describeNode(e)}`); continue; }
    const where = `${path} > ${nodeLabel(e, idx)}`;
    if (e.type !== a.type) { diffs.push(`${where}: expected ${describeNode(e)}, got ${describeNode(a)}`); continue; }
    switch (e.type) {
      case "text":
        if (e.data !== a.data) diffs.push(`${where}: text differs: expected ${JSON.stringify(e.data)}, got ${JSON.stringify(a.data)}`);
        break;
      case "comment":
        if (e.data !== a.data) diffs.push(`${where}: comment differs: expected ${JSON.stringify(e.data)}, got ${JSON.stringify(a.data)}`);
        break;
      case "bogus":
        if (e.raw !== a.raw) diffs.push(`${where}: markup differs: expected ${JSON.stringify(e.raw)}, got ${JSON.stringify(a.raw)}`);
        break;
      case "stray-endtag":
        if (e.tag !== a.tag) diffs.push(`${where}: stray end tag differs: </${e.tag}> vs </${a.tag}>`);
        break;
      case "element": {
        if (e.tag !== a.tag) { diffs.push(`${where}: tag differs: expected <${e.tag}>, got <${a.tag}> (no case folding by contract)`); break; }
        if (e.attrs.length !== a.attrs.length) {
          diffs.push(`${where}: attribute count differs: expected ${describeNode(e)}, got ${describeNode(a)}`);
        } else {
          for (let ai = 0; ai < e.attrs.length; ai++) {
            const [ek, ev] = e.attrs[ai];
            const [ak, av] = a.attrs[ai];
            if (ek !== ak) { diffs.push(`${where}: attribute #${ai} differs (order is significant): expected ${ek}, got ${ak}`); break; }
            if (ev !== av) { diffs.push(`${where}: attribute ${ek} value differs: expected ${ev === null ? "(bare)" : JSON.stringify(ev)}, got ${av === null ? "(bare)" : JSON.stringify(av)}`); break; }
          }
        }
        diffNodeLists(e.children, a.children, where, diffs);
        break;
      }
    }
  }
}

/** Compare two HTML texts under the §2 contract. Returns difference strings (empty = equal). */
export function compareHtml(expectedText, actualText, label = "html") {
  const e = parseHtml(expectedText);
  const a = parseHtml(actualText);
  dropInsignificantWhitespace(e.root);
  dropInsignificantWhitespace(a.root);
  const diffs = [];
  if ((e.doctype ?? "(none)") !== (a.doctype ?? "(none)")) {
    diffs.push(`${label}: doctype differs: expected ${JSON.stringify(e.doctype ?? null)}, got ${JSON.stringify(a.doctype ?? null)}`);
  }
  diffNodeLists(e.root.children, a.root.children, label, diffs);
  return diffs;
}

/**
 * Bidirectional tree comparison: expectedDir is the declared output tree,
 * actualDir the produced one. Missing files fail; extra files fail; .html
 * compared per the parsed contract above; every other file byte-for-byte.
 */
export function compareTrees(expectedDir, actualDir) {
  const diffs = [];
  const expected = listFiles(expectedDir);
  const actual = listFiles(actualDir);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const rel of expected) if (!actualSet.has(rel)) diffs.push(`missing from output: ${rel}`);
  for (const rel of actual) if (!expectedSet.has(rel)) diffs.push(`unexpected file in output: ${rel}`);
  for (const rel of expected) {
    if (!actualSet.has(rel)) continue;
    const eAbs = join(expectedDir, rel);
    const aAbs = join(actualDir, rel);
    if (rel.endsWith(".html")) {
      diffs.push(...compareHtml(readFileSync(eAbs, "utf8"), readFileSync(aAbs, "utf8"), rel));
    } else if (!readFileSync(eAbs).equals(readFileSync(aAbs))) {
      diffs.push(`${rel}: bytes differ (non-HTML files are compared byte-for-byte)`);
    }
  }
  return diffs;
}
