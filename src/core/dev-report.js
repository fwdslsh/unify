/**
 * `dev-report.js` — conformance-spec §27, the local audit view served at
 * `/_unify/` by `unify dev` and by nothing else.
 *
 * It exists because `unify audit`'s stdout is a list and a site is a graph:
 * the same findings, arranged by page with the page's own record beside them,
 * answer "what is wrong with *this* page" in one look (§27).
 *
 * **One source, and no third (§27.3).** Everything rendered here arrives in
 * the payload `build.js` hands over at the end of the build that produced it —
 * the §20 manifest that build derived, the §24 findings computed at that
 * build's single `auditManifest` call, §17's own address line, and §14's
 * diagnostics in the printed order and printed form. This module therefore
 * imports no filesystem API, opens no file, and parses no markup: there is
 * nothing here for a second reading of the site to be, which is the point.
 * Product-spec §6.2 requires one final-output interpretation shared by every
 * consumer, and a development server is the least-observed place to break it —
 * a second extractor would agree with `unify audit` on every simple site and
 * diverge on the first interesting one, in a window nobody diffs against a
 * terminal. §27.5 states the consequence as a contract: if this view and
 * `unify audit` ever disagree, §27 is the defect.
 *
 * **Nothing here writes (§27.1).** The document is a string returned to an
 * HTTP response. No file is created for it, it is absent from `--dry-run`
 * (which lists what a build would *write*), and a page fetched from `dist/` by
 * a deploy or a `curl` is byte-identical whether or not `dev` ever ran.
 *
 * **What it must never grow.** No score, no grade, no percentage, no keyword
 * count, no character count — §24.5's rule is about the *output*, and a page
 * is output, so "12 issues — 78% healthy" is exactly as forbidden in this
 * document as in the terminal report. And no finding of its own: a check that
 * only the browser view can raise would be a second audit wearing HTML.
 *
 * It is HTML for a person, not an API (§27.5): readable with the stylesheet
 * removed, no external request of any kind, no framework, no `schemaVersion`
 * and no stable serialization. Machine-readable findings are `unify audit
 * --format json`, a different artifact.
 */

import { Reporter } from "./diagnostics.js";
import { formatFindings } from "./audit.js";

/**
 * Escape for HTML text and double-quoted attribute values alike. Every value
 * below is authored content — a title, a URL, a diagnostic quoting the
 * author's own markup — so nothing reaches the document unescaped.
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A record with nothing to show for a field says so, rather than showing an empty cell. */
const ABSENT = '<span class="absent">not declared</span>';

/**
 * §20.5 — `url` is null when no `--base-url` told unify where the site lives,
 * which is not the same as a page declaring nothing. Saying "not declared"
 * there would blame the page for a flag the author did not pass.
 */
const NO_BASE_URL = '<span class="absent">unknown — no --base-url</span>';

const CSS = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; max-width: 60rem; padding: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .5rem; border-bottom: 1px solid currentColor; padding-bottom: .2rem; }
  h3 { font-size: 1rem; margin: 1.25rem 0 .35rem; }
  .address { margin: 0 0 1.5rem; }
  .broken, .problem { font-weight: 700; }
  .absent { opacity: .6; font-style: italic; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .1rem .75rem; margin: .35rem 0 0; }
  dt { font-weight: 600; }
  dd { margin: 0; overflow-wrap: anywhere; }
  ul { margin: .35rem 0; padding-left: 1.25rem; }
  pre { overflow-x: auto; margin: .35rem 0; white-space: pre-wrap; }
  section > p { margin: .35rem 0; }
  article { margin: 0 0 1.25rem; }
`;

/**
 * Wrap a body in the one document shape this module emits. No `<link>`, no
 * `<script>`, no image: the CSP-free equivalent of a page that cannot phone
 * home is a page with nothing to phone home *with* (§27.5).
 * @param {string} body
 * @returns {string}
 */
function page(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>unify — local audit view</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * §27.4 — the answer to a request that arrives before any build has completed.
 * The server never blocks on a rebuild, so this is a real document rather than
 * a delay: the reload stream replaces it with the first report there is.
 * @returns {string}
 */
export function renderPending() {
  return page(`<h1>unify — local audit view</h1>
<p class="address">No build has completed yet. This page reloads when one does.</p>`);
}

/**
 * §27.4 — "shows the new build, or shows why there is no new build", for the
 * one rebuild that produces neither: an internal error thrown out of the
 * pipeline (watcher.js catches it, records a problem on that rebuild's own
 * reporter, and writes §16's error pages) never reaches the end of `build()`,
 * so no report is assembled for it.
 *
 * Leaving the previous report in place would be the worse answer: it would
 * describe a build that is no longer the current one while looking exactly like
 * one that is, which is the failure §27.3 (4) exists to prevent, one level up.
 * This page says only what is known here — the rebuild ended early, and its
 * diagnostics went to the terminal — and invents nothing about the build that
 * did not finish.
 * @returns {string}
 */
export function renderInterrupted() {
  return page(`<h1>unify — local audit view</h1>
<p class="address">The last rebuild ended before the build could report on it. Its diagnostics are on the
terminal running <code>unify dev</code>. This page reloads when a rebuild completes.</p>`);
}

/**
 * §27.3's four sections, in the stated order.
 *
 * @param {object} evaluation - exactly what `build.js` hands over; nothing
 *   here reads anything else
 * @param {import('./manifest.js').PageRecord[]} evaluation.records - §20's
 *   manifest, in its own order (output path)
 * @param {import('./audit.js').Finding[]} evaluation.findings - §24's findings
 *   over those records, in §24.5's order (source path, then id)
 * @param {string} evaluation.address - §17's first line, verbatim
 * @param {import('./diagnostics.js').Diagnostic[]} evaluation.diagnostics -
 *   §14's diagnostics for this build, already deduplicated, already sorted,
 *   already relocated to the working directory
 * @param {boolean} evaluation.published - whether this build reached the
 *   output directory
 * @returns {string}
 */
export function renderReport({ records, findings, address, diagnostics, published }) {
  return page([
    summarySection({ findings, address, diagnostics, published }),
    findingsSection(findings, records),
    recordsSection(records),
    diagnosticsSection(diagnostics),
  ].join("\n"));
}

/**
 * §27.3 (1) — the counts `unify audit` prints, and the address the build
 * assumed, so a report read at a glance says which build it describes.
 *
 * The count line is taken from §24.5's own formatter rather than recomputed
 * from the array: "the counts `unify audit` prints" is the specification's
 * wording, and one formatter cannot drift from itself.
 */
function summarySection({ findings, address, diagnostics, published }) {
  const counts = formatFindings(findings).split("\n").at(-1);
  const problems = diagnostics.filter((d) => d.severity === "problem").length;
  const advisories = diagnostics.length - problems;
  // Exactly what §15 decided, and NOT ONE WORD MORE. Whether the build reached
  // `dist/` is the one fact a reader cannot infer from the sections below, and
  // it is the reason §27.3 (4) puts the diagnostics in the document at all.
  //
  // It said "not published — this build wrote nothing to the output directory"
  // until 2026-08-19, and that clause was false in the one case it existed
  // for: under `dev`, a rebuild that raises a problem writes §16's error pages
  // into the output directory — "the one thing a broken rebuild may write" —
  // and the browser reading this report is being served one. This module has
  // no input telling it whether any were written (nothing here opens a file,
  // §27.3), so the honest report is the publish state alone; describing the
  // output directory from here would be the invented claim product-spec §6.1
  // forbids, in the document whose whole purpose is to say what this build
  // actually did.
  const state = published ? "published" : "not published";
  return `<h1>unify — local audit view</h1>
<p class="address">${esc(address)}<br>${esc(counts)}<br>${esc(
    `build: ${problems} problem${problems === 1 ? "" : "s"}, ${advisories} advisor${advisories === 1 ? "y" : "ies"} — ${state}`,
  )}</p>`;
}

/**
 * §27.3 (2) — the findings, grouped by page, each with its severity, its
 * evidence, its fix, and its stable id: §24.5's four fields rearranged rather
 * than reworded.
 *
 * Grouped by the finding's own `file`, not by walking the records, because one
 * finding in this catalogue is not about a page at all: `robots-sitemap-missing`
 * is located at the source `robots.txt` and reads no record (§24.4). Grouping
 * the other way would have dropped it from the view while `unify audit` still
 * printed it, which is §27.5's disagreement in its most literal form.
 */
function findingsSection(findings, records) {
  if (findings.length === 0) {
    return `<section><h2>Findings</h2><p>Nothing to report.</p></section>`;
  }
  const anchors = new Map(records.map((r, i) => [r.sourcePath, `page-${i}`]));
  /** @type {Map<string, object[]>} insertion order is §24.5's order */
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.file)) groups.set(f.file, []);
    groups.get(f.file).push(f);
  }
  const parts = [`<section><h2>Findings</h2>`];
  for (const [file, group] of groups) {
    const anchor = anchors.get(file);
    const heading = anchor ? `<a href="#${anchor}">${esc(file)}</a>` : esc(file);
    parts.push(`<article><h3>${heading}</h3><ul>`);
    for (const f of group) {
      parts.push(
        `<li><span class="${esc(f.severity)}">${esc(f.severity)}</span>: ${esc(f.evidence)} [${esc(f.id)}]` +
        `<br>fix: ${esc(f.fix)}</li>`,
      );
    }
    parts.push(`</ul></article>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

/**
 * §27.3 (3) — every page's record, including pages with no findings: "a page
 * nothing is wrong with is the useful half of the answer to 'did my metadata
 * land'". Every field named in §27.3 is here, read straight off the record.
 */
function recordsSection(records) {
  if (records.length === 0) {
    return `<section><h2>Pages</h2><p>This build composed no pages.</p></section>`;
  }
  const parts = [`<section><h2>Pages</h2>`];
  for (const [i, r] of records.entries()) {
    const outline = r.headings.length === 0
      ? ABSENT
      : `<ul>${r.headings.map((h) => `<li>h${esc(h.level)}: ${esc(h.text)}</li>`).join("")}</ul>`;
    parts.push(`<article id="page-${i}">
<h3>${esc(r.sourcePath)}</h3>
<dl>
<dt>output path</dt><dd>${esc(r.outputPath)}</dd>
<dt>address</dt><dd>${esc(r.path)}</dd>
<dt>public URL</dt><dd>${r.url === null ? NO_BASE_URL : esc(r.url)}</dd>
<dt>title</dt><dd>${r.title === null ? ABSENT : esc(r.title)}</dd>
<dt>description</dt><dd>${r.description === null ? ABSENT : esc(r.description)}</dd>
<dt>language</dt><dd>${r.lang === null ? ABSENT : esc(r.lang)}</dd>
<dt>canonical</dt><dd>${r.canonical === null ? ABSENT : esc(r.canonical)}</dd>
<dt>indexable</dt><dd>${r.robots.indexable ? "yes" : "no"}</dd>
<dt>links in / out</dt><dd>${esc(r.linksIn.length)} / ${esc(r.linksOut.length)}</dd>
<dt>headings</dt><dd>${outline}</dd>
</dl>
</article>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}

/**
 * §27.3 (4) — the build's diagnostics, verbatim.
 *
 * `Reporter.format` is §14.1's printed form itself, so the bytes here and the
 * bytes on stderr are one function's output. Verbatim is load-bearing: a
 * rebuild that failed leaves the previous `dist/` in place (§15), so without
 * this section the report would describe a site the browser is no longer being
 * served, and with a *reworded* one it would describe it differently from the
 * terminal the author is also watching.
 */
function diagnosticsSection(diagnostics) {
  if (diagnostics.length === 0) {
    return `<section><h2>Diagnostics</h2><p>None.</p></section>`;
  }
  const parts = [`<section><h2>Diagnostics</h2>`];
  for (const d of diagnostics) {
    parts.push(`<pre class="${esc(d.severity)}">${esc(Reporter.format(d))}</pre>`);
  }
  parts.push(`</section>`);
  return parts.join("\n");
}
