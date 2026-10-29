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

export function checkAddresses(out, baseUrl) {
  if (!out || !existsSync(out)) return { pass: false, detail: "no build output" };
  const base = new URL(baseUrl);
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const { files, fragments, pages } = inventory(out);
  const fileSet = new Set(files);
  const bad = [], coverage = [], contexts = [];
  let seen = 0, fragmentLinks = 0;
  const localFile = (url) => {
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null;
    let rel;
    try { rel = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return null; }
    if (rel.split("/").some((s) => s === ".." || s === ".")) return null;
    if (fileSet.has(rel)) return rel;
    const index = `${rel.replace(/\/$/, "")}${rel ? "/" : ""}index.html`;
    return fileSet.has(index) ? index : null;
  };
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
