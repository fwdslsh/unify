/** Static, document-relative checks of emitted markup. No sample JavaScript runs here. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parse as parseJavaScript } from "acorn";
import { parse as parseHtml, findAll, getAttr, innerText } from "../../src/core/html.js";
import { decodeEntities } from "../../src/core/entities.js";

const DYNAMIC = "RATIFY_DYNAMIC_SEGMENT_69342";
const attr = (node, key) => decodeEntities(getAttr(node, key) ?? "");
const named = (node, name) => node.type === "element" && node.tag.toLowerCase() === name;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (items) => items.slice(0, 4).join("; ") + (items.length > 4 ? `; … ${items.length - 4} more` : "");

function filesIn(dir, rel = "") {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      return entry.isDirectory() ? filesIn(dir, path) : entry.isFile() ? [path] : [];
    });
}

function markup(out, rel) {
  const text = readFileSync(join(out, rel), "utf8");
  const { root, doctype } = parseHtml(text);
  const elements = findAll(root, (n) => n.type === "element");
  const wrapped = Boolean(doctype || elements.some((n) => /^(html|head|body)$/i.test(n.tag)));
  const html = !text.includes("\0") && /^\s*</.test(text) && elements.length > 0;
  return { rel, text, root, elements, wrapped, html };
}

function inventory(out) {
  const files = filesIn(out);
  // Extensionless HTTP endpoints are common; don't mistake JS, SVG, JSON, or
  // arbitrary text for fragments just because those files contain angle brackets.
  const documents = files.filter((rel) => /\.html?$/i.test(rel) || !extname(rel))
    .map((rel) => markup(out, rel));
  const fragments = documents.filter((p) => p.rel.endsWith(".fragment.html") || (p.html && !p.wrapped));
  const pages = documents.filter((p) => p.html && (p.wrapped || /\.html?$/i.test(p.rel)) && !p.rel.endsWith(".fragment.html"));
  return { files, fragments, pages };
}

export function checkBareFragments(out) {
  if (!out || !existsSync(out)) return { pass: false, detail: "no build output" };
  const { fragments } = inventory(out);
  // An empty month list is a valid empty response, but cannot alone establish
  // that the requested reusable HTML panel exists.
  const bad = fragments.filter((p) => p.wrapped || (!p.html && p.text.replace(/<!--[\s\S]*?-->/g, "").trim())).map((p) => p.rel);
  return { pass: fragments.some((p) => p.html) && bad.length === 0,
    detail: !fragments.length ? "no bare HTML fragment published" : `${fragments.length} fragment(s)${bad.length ? `; wrapped or empty/non-HTML: ${list(bad)}` : ""}` };
}

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((n) => walkAst(n, visit));
    else if (value && typeof value === "object") walkAst(value, visit);
  }
}

/** Literal/template/concatenated paths, unambiguous const aliases and simple
 * path-returning functions. Unknown parts stay wildcards, never fabricated URLs.
 * Unsupported expressions remain visible as coverage gaps in the result. */
function fetchPatterns(code) {
  let ast;
  try { ast = parseJavaScript(code, { ecmaVersion: "latest", sourceType: "module" }); }
  catch { return { patterns: [], unknown: ["JavaScript could not be parsed"] }; }
  const bindings = new Map();
  const bind = (name, value) => { if (name) bindings.set(name, bindings.has(name) ? null : value); };
  const calls = [];
  let inserts = false;
  let readsText = false;
  const member = (n, key) => n?.type === "MemberExpression" && !n.computed && n.property.name === key;
  walkAst(ast, (n) => {
    if (n.type === "VariableDeclarator") bind(n.id.name, n.init);
    if (n.type === "FunctionDeclaration") bind(n.id?.name, n);
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) {
      for (const param of n.params) if (param.type === "Identifier") bind(param.name, null);
    }
    if (n.type === "AssignmentExpression" || n.type === "UpdateExpression") {
      const left = n.left ?? n.argument;
      if (left.type === "Identifier") bindings.set(left.name, null);
      if (member(left, "innerHTML") || member(left, "outerHTML")) inserts = true;
    }
    if (n.type === "CallExpression") {
      if (n.callee.type === "Identifier" && n.callee.name === "fetch") calls.push(n);
      if (member(n.callee, "text")) readsText = true;
      if (member(n.callee, "insertAdjacentHTML")) inserts = true;
    }
  });
  const pattern = (n, seen = new Set()) => {
    if (!n || seen.has(n)) return DYNAMIC;
    const next = new Set([...seen, n]);
    if (n.type === "Literal" && typeof n.value === "string") return n.value;
    if (n.type === "TemplateLiteral") return n.quasis.map((q, i) => (q.value.cooked ?? q.value.raw) + (i < n.expressions.length ? pattern(n.expressions[i], next) : "")).join("");
    if (n.type === "BinaryExpression" && n.operator === "+") return pattern(n.left, next) + pattern(n.right, next);
    if (n.type === "Identifier") return pattern(bindings.get(n.name), next);
    if (n.type === "CallExpression" && n.callee.type === "Identifier") {
      const fn = bindings.get(n.callee.name);
      if (fn && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(fn.type)) {
        const returns = fn.body.type === "BlockStatement" ? fn.body.body.filter((x) => x.type === "ReturnStatement") : [{ argument: fn.body }];
        if (returns.length === 1) return pattern(returns[0].argument, next);
      }
    }
    return DYNAMIC;
  };
  const patterns = [], unknown = [];
  for (const call of calls) {
    const value = pattern(call.arguments[0]);
    if (!inserts || !readsText || !value.replaceAll(DYNAMIC, "")) {
      unknown.push(code.slice(call.start, call.end));
    } else patterns.push(value);
  }
  return { patterns, unknown };
}

/**
 * The published file a URL under the site's address names, or null. A directory address
 * names its `index.html`; with `exact`, only one written with its trailing slash does —
 * the form a static host serves without redirecting.
 */
function publishedFile(fileSet, base, prefix, url, { exact = false } = {}) {
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null;
  let rel;
  try { rel = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return null; }
  if (rel.split("/").some((s) => s === ".." || s === ".")) return null;
  if (rel && !rel.endsWith("/") && fileSet.has(rel)) return rel;
  if (exact && rel && !rel.endsWith("/")) return null;
  const index = `${rel.replace(/\/$/, "")}${rel ? "/" : ""}index.html`;
  return fileSet.has(index) ? index : null;
}

export function checkAddresses(out, baseUrl) {
  if (!out || !existsSync(out)) return { pass: false, detail: "no build output" };
  const base = new URL(baseUrl);
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const { files, fragments, pages } = inventory(out);
  const fileSet = new Set(files);
  const bad = [], coverage = [], contexts = [];
  let seen = 0, fragmentLinks = 0;
  const localFile = (url) => publishedFile(fileSet, base, prefix, url);
  const checkLinks = (document, pageBase, from) => {
    for (const node of document.elements.filter((n) => named(n, "a"))) {
      const href = attr(node, "href");
      if (!href || href.startsWith("#")) continue;
      let url;
      try { url = new URL(href, pageBase); } catch { bad.push(`${from}: ${href} (invalid URL)`); continue; }
      if (!/^https?:$/.test(url.protocol) || url.origin !== base.origin) continue;
      seen++;
      if (from !== document.rel) fragmentLinks++;
      if (!url.pathname.startsWith(prefix)) bad.push(`${from}: ${href} (outside ${prefix})`);
      else if (url.pathname.endsWith(".html") && !/(\/404|\.fragment)\.html$/.test(url.pathname)) bad.push(`${from}: ${href} (.html)`);
      else if (!localFile(url)) bad.push(`${from}: ${href} (no published target)`);
    }
  };
  const scriptCache = new Map();
  for (const page of pages) {
    const pageUrl = new URL(page.rel.replace(/(^|\/)index\.html$/, "$1"), base);
    const baseElement = page.elements.find((n) => named(n, "base") && getAttr(n, "href") !== null);
    let pageBase = pageUrl;
    try { if (baseElement) pageBase = new URL(attr(baseElement, "href"), pageUrl); }
    catch { bad.push(`${page.rel}: invalid <base href>`); }
    checkLinks(page, pageBase, page.rel);
    const patterns = [];
    for (const node of page.elements) {
      if (getAttr(node, "hx-get") !== null) patterns.push(attr(node, "hx-get"));
      if (!named(node, "script") || (attr(node, "type") && !/^(module|(?:text|application)\/javascript)$/i.test(attr(node, "type")))) continue;
      const src = attr(node, "src");
      let code = innerText(page.text, node), source = page.rel;
      if (src) {
        let path;
        try { path = localFile(new URL(src, pageBase)); } catch { /* unresolved script */ }
        if (!path) { coverage.push(`${page.rel}: script ${src} unavailable`); continue; }
        source = path;
        code = readFileSync(join(out, path), "utf8");
      }
      if (!scriptCache.has(code)) scriptCache.set(code, fetchPatterns(code));
      const parsed = scriptCache.get(code);
      patterns.push(...parsed.patterns);
      coverage.push(...parsed.unknown.map((u) => `${page.rel} via ${source}: ${u}`));
    }
    const matched = new Set();
    for (const pattern of patterns) {
      let target;
      try { target = new URL(pattern, pageBase); } catch { coverage.push(`${page.rel}: unresolvable fetch ${pattern}`); continue; }
      if (target.origin !== base.origin) continue;
      const re = new RegExp(`^${target.pathname.split(DYNAMIC).map(escapeRe).join(".*")}$`);
      const hits = fragments.filter((f) => re.test(new URL(f.rel, base).pathname));
      if (!hits.length) coverage.push(`${page.rel}: no bare fragment matched ${pattern.replaceAll(DYNAMIC, "*")}`);
      if (pattern.includes(DYNAMIC)) coverage.push(`${page.rel}: dynamic fetch matched emitted files only`);
      hits.forEach((f) => matched.add(f));
    }
    for (const fragment of matched) {
      // A fragment's own URL is NOT the base of links inserted with innerHTML.
      // The including document's first <base>, if present, still applies.
      contexts.push({ page: page.rel, fragment: fragment.rel, base: pageBase.href });
      checkLinks(fragment, pageBase, `${page.rel} ← ${fragment.rel}`);
    }
  }
  return { pass: bad.length === 0,
    detail: `${seen} internal links (${fragmentLinks} in fetched fragments)${bad.length ? `; ${bad.length} invalid: ${list(bad)}` : `, all extensionless under ${prefix} with published targets`}${coverage.length ? `; ${coverage.length} static-analysis coverage note(s)` : ""}`,
    contexts, coverage: [...new Set(coverage)], failures: bad };
}

const inside = (node, outer) => node.start >= outer.start && node.end <= outer.end;
const underTemplate = (node) => { for (let p = node.parent; p; p = p.parent) if (named(p, "template")) return true; return false; };
/** An element's text as a reader gets it: tags dropped, entities decoded, whitespace folded. */
const textOf = (page, node) => decodeEntities(innerText(page.text, node).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Every published page has exactly one `<main>` (a meta-refresh redirect aside). Then, as
 * the brief asks:
 *   skipLink   a same-page link placed before the `<main>` targets it, or an element in it
 *   labelled   at least this many pages give their `<main>` an accessible name of its own —
 *              `aria-label`, or `aria-labelledby` naming an element of the page — no two
 *              of those names the same
 *   outside    no element that names one of these files (`src`, `srcset`, `poster`,
 *              `style`) sits inside a `<main>`; a page whose markup names none is noted
 */
export function checkMainLandmarks(out, { skipLink = false, labelled = 0, outside = [] } = {}) {
  if (!out || !existsSync(out)) return { pass: false, detail: "no build output" };
  const pages = inventory(out).pages.filter((p) => !p.elements.some((n) => named(n, "meta") && /^refresh$/i.test(attr(n, "http-equiv"))));
  const bad = [], coverage = [], labels = new Set();
  let placed = 0;
  for (const page of pages) {
    const mains = page.elements.filter((n) => named(n, "main") && !underTemplate(n));
    if (mains.length !== 1) { bad.push(`${page.rel}: ${mains.length} <main> elements`); continue; }
    const [main] = mains;
    const byId = (id) => page.elements.find((n) => attr(n, "id") === id);
    if (skipLink) {
      const reaches = page.elements.some((n) => {
        if (!named(n, "a") || n.start > main.start || !/^#./.test(attr(n, "href"))) return false;
        let target;
        try { target = byId(decodeURIComponent(attr(n, "href").slice(1))); } catch { return false; }
        return Boolean(target) && inside(target, main);
      });
      if (!reaches) bad.push(`${page.rel}: no link before its <main> jumps to it`);
    }
    if (labelled) {
      const by = attr(main, "aria-labelledby").trim().split(/\s+/)[0];
      const name = attr(main, "aria-label").trim() || (by && byId(by) ? textOf(page, byId(by)) : "");
      if (name) labels.add(name.toLowerCase());
    }
    if (outside.length) {
      const filesNamed = (n) => outside.filter((file) => ["src", "srcset", "poster", "style"].some((k) => attr(n, k).includes(file)));
      const uses = page.elements.filter((n) => filesNamed(n).length);
      const within = uses.find((n) => inside(n, main));
      if (within) bad.push(`${page.rel}: ${filesNamed(within)[0]} is inside <main>`);
      else if (uses.length) placed++;
    }
  }
  if (labelled && labels.size < labelled) bad.push(`${labels.size} distinct <main> names (needs ${labelled})`);
  if (outside.length && placed === 0) coverage.push("no page's markup names the listed files: where they sit could not be read from the HTML (a stylesheet may place them)");
  return { pass: pages.length > 0 && bad.length === 0,
    detail: !pages.length ? "no pages published"
      : bad.length ? `${bad.length} failing: ${list(bad)}`
        : `${pages.length} pages, one <main> each${skipLink ? ", each reached by a link before it" : ""}${labelled ? `; ${labels.size} distinct <main> names` : ""}${outside.length ? `; ${placed} page(s) keep the listed files outside <main>` : ""}${coverage.length ? `; ${coverage.length} coverage note(s)` : ""}`,
    coverage, failures: bad };
}

/**
 * `path` is published JSON: an array of at least `min` entries, each with a non-empty
 * `title` and `date` and a `url` that is the full public address of a published page —
 * under the site's address, not ending in `.html`, no two the same, and exactly the form a
 * static host serves without redirecting (a directory address keeps its trailing slash).
 */
export function checkJsonListing(out, baseUrl, { path, min = 1 }) {
  if (!out || !existsSync(out)) return { pass: false, detail: "no build output" };
  if (!existsSync(join(out, path))) return { pass: false, detail: `no ${path}` };
  let entries;
  try { entries = JSON.parse(readFileSync(join(out, path), "utf8")); } catch (e) { return { pass: false, detail: `${path} is not JSON: ${e.message}` }; }
  if (!Array.isArray(entries)) return { pass: false, detail: `${path} is not a JSON array` };
  const base = new URL(baseUrl);
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const fileSet = new Set(filesIn(out));
  const bad = [], seen = new Set();
  entries.forEach((entry, i) => {
    const at = `${path}[${i}]`;
    for (const key of ["title", "date"]) if (typeof entry?.[key] !== "string" || !entry[key].trim()) bad.push(`${at}: no ${key}`);
    let url;
    try { url = new URL(entry?.url); } catch { bad.push(`${at}: url ${JSON.stringify(entry?.url)} is not a full address`); return; }
    if (seen.has(url.href)) bad.push(`${at}: ${url.href} is listed twice`);
    seen.add(url.href);
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) bad.push(`${at}: ${url.href} (outside ${base.origin}${prefix})`);
    else if (url.pathname.endsWith(".html")) bad.push(`${at}: ${url.href} (.html)`);
    else if (!publishedFile(fileSet, base, prefix, url, { exact: true })?.endsWith(".html")) bad.push(`${at}: ${url.href} (no published page at exactly that address)`);
  });
  return { pass: entries.length >= min && bad.length === 0,
    detail: `${entries.length} entries (needs ${min})${bad.length ? `; ${bad.length} invalid: ${list(bad)}` : ", each the address of a published page"}`,
    failures: bad };
}
