/**
 * `preview.js` — conformance-spec §27.7, the source preview `unify dev` serves
 * at `/_unify/preview/<source path>` and nothing else.
 *
 * A page has an address once it is built; a layout and an include never do,
 * because neither ships (§4.2, §4.4). Yet both are where a design is made, and
 * both carry their own default content — a layout's slot fallbacks, a
 * fragment's slot fallbacks — that a browser can show without any page at all.
 * What a browser cannot do is follow `<include>` tags or resolve a fragment's
 * asset links from a URL that is not the file's own. This module does exactly
 * those two things with the build's own machinery (§5's inliner, §7's
 * composer, §11's provenance rewriting) scoped to one source file, and then
 * stops: nothing here is a second composition model, and nothing it produces
 * is ever written anywhere (§27.1).
 *
 * Three kinds of file, three renderings:
 *
 *   - a LAYOUT is shown as itself: includes inlined, slots left in place so
 *     their fallbacks render. With `?page=` it is shown composed with that
 *     page instead — §7 exactly, with this layout in place of the one the page
 *     would resolve.
 *   - an INCLUDE (a fragment) is shown on its own, inside a shell that carries
 *     the `<html>`, `<head>` and `<body>` start tag of a layout — so the
 *     fragment gets the site's stylesheets, scripts and body class — but none
 *     of the layout's body. The layout is `?layout=`, else the layout of
 *     `?page=`, else the one §6's walk finds from the fragment's own directory.
 *     With `?page=` the fragment's slots are filled the way that page fills
 *     them (§32), when that page includes it with content.
 *   - a PAGE is redirected to its served address, the page map's `path`.
 *
 * Every URL in the result is rewritten against the file that authored it
 * (§11.1), as if the document had moved, so `assets/style.css` written in
 * `site/_layout.html` is served from `/assets/style.css` whatever path the
 * preview is fetched from. The result is served, never written.
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, posix, join } from "node:path";
import { Reporter } from "./diagnostics.js";
import { contentSpan, findFirst, getAttr, isElement, parse, rawSpan } from "./html.js";
import { inlineIncludes } from "./includes.js";
import { resolveHtmlLayout, resolveMarkdownLayout, walkForLayout } from "./layout.js";
import { convert, convertFragment } from "./markdown.js";
import { assembleMarkdownDocument, compose } from "./compose.js";
import { locateExisting, nameOf, virtualOf } from "./paths.js";
import { applyPrettyLinks, rewriteProvenanceUrls, spansToLocator } from "./urls.js";

export const PREVIEW_PATH = "/_unify/preview/";

const LAYOUT_FILENAME = "_layout.html";

/** A reporter whose output goes nowhere: the preview shows problems itself (below). */
function quietReporter() {
  const sink = { write() {} };
  return new Reporter({ stdout: sink, stderr: sink });
}

/**
 * Which of §27.7's three kinds a source path is.
 * @param {string} relPath - virtual path
 * @param {Set<string>} knownLayouts - layouts the last build composed with
 * @returns {"layout"|"fragment"|"page"}
 */
export function kindOf(relPath, knownLayouts = new Set()) {
  if (posix.basename(relPath) === LAYOUT_FILENAME || knownLayouts.has(relPath)) return "layout";
  if (relPath.endsWith(".fragment.html") || relPath.split("/").some((s) => s.startsWith("_"))) return "fragment";
  return "page";
}

/**
 * Every `_layout.html` under the source root, source-root-relative, for the
 * selector. The scan is the preview's own and tiny; nothing else reads it.
 * @param {string} sourceRoot
 * @returns {string[]}
 */
function scanLayouts(sourceRoot) {
  const found = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), next);
      else if (e.name === LAYOUT_FILENAME) found.push(next);
    }
  };
  walk(sourceRoot, "");
  return found.sort();
}

/**
 * @param {object} args
 * @param {string} args.sourceRoot - absolute
 * @param {string[]} args.roots - the §33.3 namespace
 * @param {string} args.relPath - the source path after `/_unify/preview/`
 * @param {string|null} args.page - `?page=`: a page's source path, or null
 * @param {string|null} args.layout - `?layout=`: a layout's source path, or null
 * @param {{source: string, layout: string|null, path: string, outputPath: string}[]} args.pages - the page map's records (empty before the first build)
 * @param {boolean} args.prettyUrls
 * @returns {Promise<{status: number, html?: string, location?: string}>}
 */
export async function renderPreview({ sourceRoot, roots, relPath, page = null, layout = null, pages = [], prettyUrls = false }) {
  const rel = posix.normalize(relPath).replace(/^\/+/, "");
  const abs = locateExisting(roots, rel);
  const ext = extname(rel).toLowerCase();
  if (!abs || (ext !== ".html" && ext !== ".md")) {
    return { status: 404, html: message("Not a source file", `<code>${esc(rel)}</code> is not an <code>.html</code> or <code>.md</code> file under the source root.`) };
  }
  const knownLayouts = new Set(pages.map((p) => p.layout).filter(Boolean));
  const kind = kindOf(rel, knownLayouts);
  const reporter = quietReporter();
  const ctx = { sourceRoot, roots, reporter, convertMarkdown: (p) => convertFragment(p, { sourceRoot, roots, reporter }) };
  const emittedHtmlPaths = new Set(pages.map((p) => p.outputPath.replace(/\/index\.html$/, (m, o, s) => (s === "index.html" ? m : m))));
  const finish = (text, spans, file) => {
    let out = rewriteProvenanceUrls(text, { provenanceOf: spansToLocator(spans, file), pageFile: file, pageMoved: true });
    if (prettyUrls && pages.length) out = applyPrettyLinks(out, { pageOutputPath: "index.html", emittedHtmlPaths: new Set(pages.map((p) => p.outputPath)) });
    return out;
  };
  const selector = (opts) => widget({ rel, kind, page, layout, pages, layouts: [...new Set([...scanLayouts(sourceRoot), ...knownLayouts])].sort(), ...opts });

  if (kind === "page") {
    const record = pages.find((p) => p.source === rel);
    if (record) return { status: 302, location: record.path };
    return { status: 404, html: message("Not built yet", `<code>${esc(rel)}</code> is a page, and the last build did not emit it. This preview reloads when the next build does.`) };
  }

  const pageAbs = page ? locateExisting(roots, posix.normalize(page)) : null;
  if (page && !pageAbs) return { status: 404, html: message("No such page", `<code>${esc(page)}</code> is not a file under the source root.`) };
  const layoutAbs = layout ? locateExisting(roots, posix.normalize(layout)) : null;
  if (layout && !layoutAbs) return { status: 404, html: message("No such layout", `<code>${esc(layout)}</code> is not a file under the source root.`) };

  if (kind === "layout") {
    let text, spans, file;
    if (pageAbs) {
      const composed = await composePage({ pageAbs, layoutAbs: abs, ctx });
      if (!composed) return { status: 200, html: problems(reporter, rel) + selector({}) };
      ({ text, spans } = composed);
      file = nameOf(roots, pageAbs);
    } else {
      ({ text, spans, file } = await loadInlined(abs, ctx));
    }
    const html = problems(reporter, rel) ? insertBeforeBodyEnd(finish(text, spans, file), problems(reporter, rel)) : finish(text, spans, file);
    return { status: 200, html: insertBeforeBodyEnd(insertBeforeHeadEnd(html, SLOT_STYLE), selector({ withLayout: false })) };
  }

  // fragment
  const shellAbs = layoutAbs ?? (pageAbs ? layoutOfPage(pageAbs, pages, roots) : null) ?? walkForLayout(abs, roots);
  let body;
  if (pageAbs) {
    body = await fragmentAsIncludedBy({ fragmentAbs: abs, fragmentRel: rel, pageAbs, ctx });
  }
  if (!body) {
    body = ext === ".md"
      ? { text: await convertFragment(abs, { sourceRoot, roots, reporter }), spans: null, file: rel }
      : await loadInlined(abs, ctx);
  }
  const fragmentHtml = finish(body.text, body.spans ?? [{ start: 0, end: body.text.length, file: body.file, fileOffset: 0 }], body.file);
  const shell = shellAbs ? await loadInlined(shellAbs, ctx) : null;
  const html = shellDocument(shell ? finish(shell.text, shell.spans, shell.file) : null, fragmentHtml, rel);
  return { status: 200, html: insertBeforeBodyEnd(html, problems(reporter, rel) + selector({ withLayout: true })) };
}

// ------------------------------------------------------------- composition

/** Read a file and inline its includes, as §2 step 2 does for a layout or an HTML page. */
async function loadInlined(absPath, ctx) {
  const file = nameOf(ctx.roots, absPath);
  const raw = readFileSync(absPath, "utf8");
  const inlined = await inlineIncludes({ text: raw, file: absPath, ...ctx });
  return { text: inlined.text, spans: inlined.spans, file };
}

/**
 * §2 steps 2–4 for one page, with `layoutAbs` in place of the layout the page
 * would resolve (the layout being previewed). Null when the page itself has a
 * problem the reporter already carries.
 */
async function composePage({ pageAbs, layoutAbs, ctx }) {
  const { sourceRoot, roots, reporter } = ctx;
  const pageFile = nameOf(roots, pageAbs);
  const layoutLoaded = await loadInlined(layoutAbs, ctx);
  if (extname(pageAbs).toLowerCase() === ".md") {
    const source = readFileSync(pageAbs, "utf8");
    const md = convert(source, { path: pageAbs, sourceRoot, roots, reporter });
    const inlinedBody = await inlineIncludes({ text: md.html, file: pageAbs, ...ctx, linesAreSource: false });
    const assembled = { ...md, html: inlinedBody.text, htmlSpans: inlinedBody.spans };
    const { text: pageText, spans: pageSpans } = assembleMarkdownDocument(assembled, { standalone: false, pageFile });
    return compose({ pageText, pageFile, pageSpans, layoutText: layoutLoaded.text, layoutFile: layoutLoaded.file, layoutSpans: layoutLoaded.spans, reporter });
  }
  const inlined = await loadInlined(pageAbs, ctx);
  return compose({ pageText: inlined.text, pageFile, pageSpans: inlined.spans, layoutText: layoutLoaded.text, layoutFile: layoutLoaded.file, layoutSpans: layoutLoaded.spans, reporter });
}

/** The layout a page composes with: the page map's answer, else §6's resolution. */
function layoutOfPage(pageAbs, pages, roots) {
  const rel = nameOf(roots, pageAbs);
  const record = pages.find((p) => p.source === rel);
  if (record) return record.layout ? locateExisting(roots, record.layout) : null;
  const reporter = quietReporter();
  if (extname(pageAbs).toLowerCase() === ".md") {
    const source = readFileSync(pageAbs, "utf8");
    const md = convert(source, { path: pageAbs, sourceRoot: roots[0], roots, reporter });
    const r = resolveMarkdownLayout({ layoutValue: md.layout, mdSource: source, pageAbsPath: pageAbs, sourceRoot: roots[0], roots, file: rel, reporter });
    return r.path ?? null;
  }
  const text = readFileSync(pageAbs, "utf8");
  const r = resolveHtmlLayout({ root: parse(text).root, text, pageAbsPath: pageAbs, sourceRoot: roots[0], roots, reporter });
  return r.path ?? null;
}

/**
 * §32 from the fragment's side: the first `<include>` in `pageAbs` that names
 * this fragment, expanded exactly as the page expands it — fills and all —
 * by running §5's inliner over that one element with the page as its author.
 * Null when the page does not include the fragment.
 */
async function fragmentAsIncludedBy({ fragmentAbs, fragmentRel, pageAbs, ctx }) {
  const { roots, reporter } = ctx;
  let hostText = readFileSync(pageAbs, "utf8");
  if (extname(pageAbs).toLowerCase() === ".md") hostText = convert(hostText, { path: pageAbs, sourceRoot: roots[0], roots, reporter }).html;
  const { root } = parse(hostText);
  const el = findFirst(root, (n) => {
    if (!isElement(n, "include")) return false;
    const src = getAttr(n, "src");
    if (!src) return false;
    const target = src.startsWith("/") ? src.slice(1) : posix.join(posix.dirname(virtualOf(roots, pageAbs) ?? ""), src);
    return posix.normalize(target) === fragmentRel;
  });
  if (!el) return null;
  const inlined = await inlineIncludes({ text: rawSpan(hostText, el), file: pageAbs, ...ctx, linesAreSource: false });
  return { text: inlined.text, spans: inlined.spans, file: nameOf(roots, pageAbs) };
}

// --------------------------------------------------------------- documents

const SLOT_STYLE = `<style>slot{display:contents}</style>`;

/**
 * A fragment inside a layout's chrome-less shell: the layout's `<html>` start
 * tag, its whole `<head>`, and its `<body>` start tag (for the class), then the
 * fragment alone. With no layout, a minimal document.
 */
function shellDocument(layoutHtml, fragmentHtml, rel) {
  let htmlOpen = "<html>";
  let head = `<meta charset="utf-8">\n<title>${esc(rel)}</title>`;
  let bodyOpen = "<body>";
  if (layoutHtml) {
    const { root } = parse(layoutHtml);
    const html = findFirst(root, (n) => isElement(n, "html"));
    const headEl = findFirst(root, (n) => isElement(n, "head"));
    const body = findFirst(root, (n) => isElement(n, "body"));
    if (html) htmlOpen = layoutHtml.slice(html.start, html.openTagEnd);
    if (headEl) { const [s, e] = contentSpan(headEl); head = layoutHtml.slice(s, e); }
    if (body) bodyOpen = layoutHtml.slice(body.start, body.openTagEnd);
  }
  return `<!doctype html>\n${htmlOpen}\n<head>\n${head}\n${SLOT_STYLE}\n</head>\n${bodyOpen}\n${fragmentHtml}\n</body>\n</html>\n`;
}

function insertBeforeBodyEnd(html, insertion) {
  const i = html.lastIndexOf("</body>");
  return i === -1 ? html + insertion : html.slice(0, i) + insertion + html.slice(i);
}

function insertBeforeHeadEnd(html, insertion) {
  const i = html.indexOf("</head>");
  return i === -1 ? html : html.slice(0, i) + insertion + html.slice(i);
}

/** §14's diagnostics for this preview, shown in the document rather than lost. */
function problems(reporter, rel) {
  if (reporter.diagnostics.length === 0) return "";
  const items = reporter.sorted().map((d) => `<pre>${esc(Reporter.format(d))}</pre>`).join("\n");
  return `<section id="unify-preview-problems" style="position:fixed;left:0;right:0;bottom:44px;max-height:40vh;overflow:auto;background:#fff3cd;color:#1b1b1b;border-top:2px solid #e0a800;font:13px/1.4 ui-monospace,monospace;padding:8px 12px;z-index:2147483646">
<strong>unify: what the build would report for ${esc(rel)}</strong>
${items}
</section>`;
}

function message(title, body) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>unify preview — ${esc(title)}</title></head>\n<body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">\n<h1>${esc(title)}</h1>\n<p>${body}</p>\n</body></html>\n`;
}

/**
 * The selector (§27.7): a plain GET form to the preview's own path, so the
 * choice is the URL and survives a reload. No script beyond submitting on
 * change; nothing of it is in the site.
 */
function widget({ rel, kind, page, layout, pages, layouts, withLayout }) {
  const opt = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
  const pageOptions = [opt("", kind === "layout" ? "no page (the layout's own defaults)" : "no page (the fragment's own defaults)", !page), ...pages.filter((p) => !p.generated).map((p) => opt(p.source, p.source, p.source === page))].join("");
  const layoutOptions = [opt("", "default layout", !layout), ...layouts.map((l) => opt(l, l, l === layout))].join("");
  return `<form id="unify-preview" method="get" style="position:fixed;bottom:8px;right:8px;z-index:2147483647;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 16px);background:#1b1b1b;color:#f4f4f4;border-radius:6px;padding:6px 8px;font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)">
<strong style="font-weight:600">unify preview</strong> <code style="opacity:.8">${esc(rel)}</code>
${withLayout ? `<label>layout <select name="layout" onchange="this.form.submit()" style="font:inherit">${layoutOptions}</select></label>` : ""}
<label>page <select name="page" onchange="this.form.submit()" style="font:inherit">${pageOptions}</select></label>
<noscript><button style="font:inherit">apply</button></noscript>
</form>`;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
