/**
 * `unify build` — the orchestrator (conformance-spec §2, pipeline order is
 * normative).
 *
 * This command owns sequencing: scan the source tree, run every page
 * through includes → Markdown conversion → layout resolution → composition
 * → head merge → root attributes (that last group is compose.js's
 * `compose()`, §7-§9) entirely in memory, then hand the completed set of
 * pages and assets to the sibling modules that own the later pipeline
 * stages — §11 URL rewriting (urls.js), §13 collision detection
 * (collisions.js), §12 the reference check (references.js), and §15
 * transactional publish (publish.js). This file wires those four together;
 * it does not implement any of their rules itself.
 *
 * The publish gate is `reporter.canPublish` (problems only), NOT
 * `reporter.exitCode === 0`. `--strict` changes the exit code without
 * changing what is published — product-spec §4 states it twice, with the
 * reason: "a stray `.psd` can never cost you a publish", so --strict gates
 * CI without withholding the site. An earlier version of this file gated on
 * exitCode because the kitchen-sink `strict` fixture asserted
 * `published: false`; that fixture was wrong, and it is the first fixture
 * defect found in this rewrite. It is corrected now. Recorded here because
 * the mistake is instructive: the fixture read as authority, the engine was
 * changed to satisfy it, and testing-strategy §5's resolution order — spec
 * beats fixture beats engine — exists precisely to stop that.
 *
 * PROVENANCE: `includes.js`'s `inlineIncludes` and `compose.js`'s `compose`
 * now return `{text, spans}` (each span `{start,end,file,fileOffset}` —
 * either module's own doc comment has the exact contract). This file is
 * where that lands: `buildPage`/`loadLayout` thread spans through composition
 * and this function builds, per composed page, a REAL `provenanceOf` for
 * `urls.rewriteUrls` (`urls.spansToLocator(spans, pageFile)`, replacing the
 * old same-file approximation `() => pageFile`) and a REAL `locate` for
 * `references.checkReferences` (`makeReferenceLocator` below — richer than
 * `spansToLocator` since a reference diagnostic needs a LINE, not just a
 * file, so it re-derives one from the true source file's own text using each
 * span's `fileOffset`). See `makeReferenceLocator`'s own comment for the one
 * honestly-named residual approximation.
 *
 * A line number therefore needs one thing no core module has: the raw text of
 * an arbitrary source file. This file is the only component that reads the
 * source tree, so it owns that half of §14.1's `FILE:LINE` contract for the
 * whole build — `makeSourceLineResolver` below, injected into `compose()` as
 * its `resolveLine` and consumed by `makeReferenceLocator`, so the compose
 * stage and the reference check answer "which line" through one function
 * rather than two.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import * as collisions from "../../core/collisions.js";
import * as compose from "../../core/compose.js";
import * as html from "../../core/html.js";
import * as includes from "../../core/includes.js";
import * as layout from "../../core/layout.js";
import * as markdown from "../../core/markdown.js";
import { contains, isNeverShipped, toRelative } from "../../core/paths.js";
import * as publishModule from "../../core/publish.js";
import * as references from "../../core/references.js";
import * as urls from "../../core/urls.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {string} context.output
 * @param {Record<string, any>} context.settings
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {boolean} [context.sourceDefaulted] - §4.4 EXC-11: true only when
 *   nothing chose the source root (no --source, no unify.yaml key, no src/)
 * @returns {Promise<number>}
 */
export async function build({ sourceRoot, output, settings, reporter, sourceDefaulted = false }) {
  const files = scanSourceTree(sourceRoot, output, settings.exclude, reporter);

  // §6.3/P08 — every .html/.md source file, excluded or not (§1: a "page" by
  // extension; only the never-shipped list, already applied in the scan,
  // escapes this). Independent of whether the build ever loads a given file
  // as a page/layout/include.
  for (const f of files) {
    if (!f.isPage) continue;
    let text;
    try {
      text = readFileSync(f.absPath, "utf8");
    } catch {
      continue;
    }
    layout.checkRetiredVocabulary({ text, file: f.relPath, reporter });
  }

  const layoutCache = new Map(); // absolute layout path -> Promise<{text, spans, file, broken}>
  const convertMarkdown = (absPath) => markdown.convertFragment(absPath, { sourceRoot, reporter });
  const resolveLine = makeSourceLineResolver(sourceRoot);
  // A10 (§14.3): every file consumed AS a layout or an include, anywhere in
  // the build — accumulated here (buildPage/loadLayout add to it as they go)
  // and checked below, once composition is done, against the pages that
  // actually got emitted.
  const consumedAsIncludeOrLayout = new Set();

  // ---- Pass 1: compose every non-excluded page, entirely in memory. -------
  const pageFiles = files.filter((f) => f.isPage && !f.excluded);
  const assetFiles = files.filter((f) => !f.isPage && !f.excluded);

  /** @type {{relPath: string, html: string, spans: {start:number,end:number,file:string,fileOffset:number}[], layoutFile: string|null}[]} */
  const composedPages = [];
  for (const page of pageFiles) {
    // `problemsReported`, not `problemCount`: this bracket asks "did THIS page
    // report a problem of its own", and the Reporter's dedup (diagnostics.js)
    // is precisely what erases identity across steps. Three pages including
    // one fragment with a broken <include src> report byte-identical P01s, so
    // a deduplicated count sees no change for pages two and three and lets
    // their malformed remnants downstream — reintroducing the spurious second
    // diagnostic the comment below exists to prevent.
    const problemsBefore = reporter.problemsReported;
    try {
      const composed = await buildPage(page, { sourceRoot, reporter, layoutCache, convertMarkdown, consumedAsIncludeOrLayout, resolveLine });
      // A page whose OWN processing reported a new problem (an unresolved
      // <include> left verbatim in the output by includes.js's own
      // best-effort splice, a P16/P09 mid-composition failure, …) is excluded
      // from every downstream stage below (§11 rewriting, §13 collisions, §12
      // references) exactly as if `buildPage` had returned null. Composition
      // continues best-effort (PIP-02) so THIS problem and every OTHER page's
      // own diagnostics still get reported in one pass — but this page's
      // possibly-malformed remnant (e.g. a literal `<include src="…">` tag
      // whose `src` is not a real reference) must not be handed to references.js,
      // which has no notion of unify's own markup and would otherwise raise a
      // second, undeclared "does not resolve to any emitted file" on top of
      // the include's own already-reported problem.
      const hadNewProblem = reporter.problemsReported > problemsBefore;
      if (composed !== null && !hadNewProblem) {
        composedPages.push({ relPath: page.relPath, html: composed.text, spans: composed.spans, layoutFile: composed.layoutFile });
      }
    } catch (err) {
      // Best-effort composition (PIP-02): one page's failure must not stop
      // analysis of the others. This is a defensive net for the unexpected
      // (a genuine crash is not itself a closed-catalogue diagnostic); every
      // *known* failure mode above already reports its own problem/advisory
      // and returns null instead of throwing.
      reporter.problem({ file: page.relPath, message: `internal error building this page: ${err.message}` });
    }
  }

  // A10 — a file used as a layout or include also ships as its own page —
  // "the non-underscored case" is the catalogue entry's own wording (§14.3
  // item 8), so an underscore-prefixed path (by page name or by a `_`
  // directory segment) is excluded here even if a custom --exclude set (like
  // underscore-guard's `--exclude drafts/**`, which REPLACES the default and
  // so no longer holds `_`-prefixed files back at all) lets it reach
  // `composedPages`: that combination is P14's territory (a problem, not an
  // advisory), already reported by collisions.js, and reporting BOTH would
  // be redundant noise about the same file for the same underlying fact.
  // Advisory only — both copies still ship (§14.3's own framing: it reports
  // what the build observed, it does not restructure anything).
  const composedPageRelPaths = new Set(composedPages.map((p) => p.relPath));
  for (const relPath of consumedAsIncludeOrLayout) {
    if (relPath.split("/").some((seg) => seg.startsWith("_"))) continue;
    if (!composedPageRelPaths.has(relPath)) continue;
    reporter.advisory({
      file: relPath,
      message: `${relPath} is used as a layout or include and also ships as its own page`,
    });
  }

  // ---- §13 — collision-aware output paths, for pages AND assets. ----------
  const entries = [
    ...composedPages.map((p) => ({ path: p.relPath, kind: "page" })),
    ...assetFiles.map((a) => ({ path: a.relPath, kind: "asset" })),
  ];
  const resolved = collisions.resolveOutputPaths({ entries, prettyUrls: settings.prettyUrls, reporter });
  const outputPathOf = new Map(resolved.map((r) => [r.source.path, r.outputPath]));

  // File-listing checks that share §13's shape (collisions.js's own scope
  // note): P14 the underscore guard, A09 working-format assets, A14 held-back
  // deployment files. None of these is composition (this file's own scope),
  // but they are cheap, self-contained passes over the same entry list this
  // function already assembled for §13, so they are wired in here rather than
  // left undone.
  collisions.underscoreGuardDiagnostics(entries, reporter);
  collisions.workingFormatDiagnostics(entries, reporter);
  const excludedRootNames = files
    .filter((f) => f.excluded && !f.relPath.includes("/"))
    .map((f) => basename(f.relPath));
  collisions.deploymentFileDiagnostics(excludedRootNames, reporter);

  // ---- §11 — URL rewriting, per page, using the collision-checked paths. --
  const baseConfig = settings.baseUrl ? urls.parseBaseUrl(settings.baseUrl) : null;
  // Every page's PRE-move .html path — what a link target is compared
  // against before §11.2 translates it to the pretty form (urls.js's own
  // `applyPrettyLinks` contract), independent of whether pretty-urls is on.
  const emittedHtmlPaths = new Set(
    composedPages.map((p) => collisions.computeOutputPath({ path: p.relPath, kind: "page" }, { prettyUrls: false })),
  );

  /** @type {Map<string, string|Buffer>} */
  const tempFiles = new Map();
  // Real per-output-file provenance spans (§12/§14.1 R3), keyed by the SAME
  // final output path `tempFiles`/`htmlFiles` use below — see
  // `makeReferenceLocator`'s own comment for how an offset in the
  // POST-rewrite text maps back through spans computed against the
  // PRE-rewrite composed text.
  const pageSpansByOutputPath = new Map();
  for (const p of composedPages) {
    const pageOutputPath = collisions.computeOutputPath({ path: p.relPath, kind: "page" }, { prettyUrls: false });
    const rewritten = urls.rewriteUrls(p.html, {
      provenanceOf: urls.spansToLocator(p.spans, p.relPath),
      pageFile: p.relPath,
      pageOutputPath,
      prettyUrls: settings.prettyUrls,
      emittedHtmlPaths,
      base: baseConfig,
    });
    const finalOutputPath = outputPathOf.get(p.relPath);
    tempFiles.set(finalOutputPath, rewritten);
    pageSpansByOutputPath.set(finalOutputPath, p.spans);
  }

  // §4.4/EXC-09 — mirror copy: every emitted asset, byte-for-byte, same
  // relative identity (only its OUTPUT path may move, under --pretty-urls
  // collision resolution — content never does).
  for (const asset of assetFiles) {
    tempFiles.set(outputPathOf.get(asset.relPath), readFileSync(asset.absPath));
  }

  // ---- §12 — the reference check, against the completed temp tree. --------
  const htmlFiles = new Map();
  const cssFiles = new Map();
  for (const [outPath, content] of tempFiles) {
    const text = typeof content === "string" ? content : null;
    if (extname(outPath) === ".html" && text !== null) htmlFiles.set(outPath, text);
    else if (extname(outPath) === ".css") cssFiles.set(outPath, text ?? content.toString("utf8"));
  }
  references.checkReferences({
    htmlFiles, cssFiles, emittedPaths: new Set(tempFiles.keys()), base: baseConfig, reporter,
    locate: makeReferenceLocator(pageSpansByOutputPath, htmlFiles, cssFiles, resolveLine),
    // §12's cascade exemption: the output paths of pages that exist in source
    // and failed to compose. Only this loop knows which absences are that —
    // from inside the check, a page that emitted nothing and a page that never
    // existed look identical. Both spellings are computed because a link to a
    // failed page is never pretty-rewritten (rewriting only moves links to
    // pages that emitted), so it arrives as `/about.html` even in a pretty
    // build, while a hand-written `/about/` arrives as `about/index.html`.
    unbuiltPagePaths: new Set(
      pageFiles
        .filter((f) => !composedPageRelPaths.has(f.relPath))
        .flatMap((f) => [false, settings.prettyUrls].map((prettyUrls) =>
          collisions.computeOutputPath({ path: f.relPath, kind: "page" }, { prettyUrls }))),
    ),
  });

  relocateDiagnosticsToCwd(reporter, sourceRoot);
  reporter.flush();

  // §4.4 — the defaulted-source notice: stdout summary text, never a
  // diagnostic (it names no problem, never touches the exit code), printed
  // for `build` and `--dry-run` alike, and only when the source root fell
  // all the way through to the working directory (cli.js's own argument
  // resolution — no marker files, no heuristics). Its two contract facts:
  // the count of files mirror copy is about to ship, and the --dry-run
  // pointer for listing them.
  if (sourceDefaulted) {
    const n = assetFiles.length;
    reporter.summary(
      `building from the working directory (no src/ here): ${n} file${n === 1 ? "" : "s"} will be copied as-is` +
      ` — run unify build --dry-run to list them`,
    );
  }

  // ---- §15 — transactional publish. ----------------------------------------
  if (shouldPublish(reporter) && !settings.dryRun) {
    if (settings.clean) await publishModule.performClean({ output, source: sourceRoot });
    await publishModule.publish({ tempFiles, outputDir: output, reporter });
  }

  // ---- §17 — the --dry-run report. ------------------------------------------
  // PUB-04/DRY-01..03: `--dry-run` is the branch above simply not running (no
  // clean, no publish — no writes at all, anywhere), plus this report on
  // stdout: one write row per composed page (naming, per DRY-02, the source
  // page and the layout it resolved to — `layoutFile`, threaded through
  // `buildPage`'s return above for exactly this), one copy row per mirrored
  // asset, and one delete row per file `planPublish` — a pure, read-only diff
  // (`snapshotDirectory` only reads `output`; it is never created or written
  // here) — finds stranded in the CURRENT output directory. Best-effort
  // (PIP-02): this runs even when the site has problems elsewhere, so a
  // partially-broken tree still reports what WOULD happen for its good pages
  // alongside the stderr diagnostics for its bad ones, which already print
  // unconditionally above regardless of --dry-run (DRY-03). Display paths use
  // `settings.output` (the CONFIGURED name, e.g. "dist") rather than `output`
  // (resolved to an absolute path for the filesystem calls above) — the
  // report's own contract (publish.js's DryRunRow doc comment) is to show
  // "whatever the configured --output directory name is", not an absolute path.
  if (settings.dryRun) {
    const outputFiles = await publishModule.snapshotDirectory(output);
    const plan = publishModule.planPublish({ tempFiles, outputFiles });
    const displayOutput = String(settings.output).replace(/\/+$/, "");
    const prefix = baseConfig ? baseConfig.pathPrefix : "/";
    const rows = [
      ...composedPages.map((p) => ({
        action: "write",
        outputPath: `${displayOutput}/${outputPathOf.get(p.relPath)}`,
        url: publishModule.urlForOutputPath(outputPathOf.get(p.relPath), prefix),
        from: p.layoutFile ? `${p.relPath} + ${p.layoutFile}` : `${p.relPath} (no layout)`,
      })),
      ...assetFiles.map((a) => ({
        action: "copy",
        outputPath: `${displayOutput}/${outputPathOf.get(a.relPath)}`,
        url: publishModule.urlForOutputPath(outputPathOf.get(a.relPath), prefix),
        from: a.relPath,
      })),
      ...plan.delete.map((rel) => ({ action: "delete", outputPath: `${displayOutput}/${rel}` })),
    ];

    // DRY-04 — the address the site is being built for, stated once, before
    // the list whose every row is relative to it. A site published to a
    // subpath with no --base-url builds clean and 404s on every link at the
    // deploy address (ratification round 11), because the reference check
    // validates against the output tree, which is correct and silent about
    // where that tree will live. This line is the one place the build says
    // out loud what it assumed.
    reporter.summary(
      baseConfig
        ? `serving from ${baseConfig.origin}${baseConfig.pathPrefix}`
        : "serving from / — the domain root (no --base-url)",
    );

    const report = publishModule.formatDryRunReport(rows);
    if (report) reporter.summary(report);

    // §17: the list above is what the pipeline PRODUCED. Publishing is step 10
    // and dry-run never reaches it, so without this line a page listed as
    // `write` could be one a real build would refuse to publish — a single
    // problem anywhere blocks the whole site (§15). State the outcome instead
    // of letting the verb imply it.
    if (shouldPublish(reporter)) {
      const count = rows.filter((r) => r.action !== "delete").length;
      reporter.summary(`would publish ${count} file${count === 1 ? "" : "s"} to ${displayOutput}/`);
    } else {
      const n = reporter.problemCount;
      reporter.summary(
        `would publish nothing — ${n} problem${n === 1 ? "" : "s"}; ${displayOutput}/ would be left untouched`,
      );
    }
  }

  return reporter.exitCode;
}

/**
 * `(file, fileOffset) => line` for the whole build: the second half of every
 * span-based location (`urls.spansToSourceLocator` supplies the first —
 * which file, and where in it). Injected into `compose()` and used by
 * `makeReferenceLocator` below, so both stages number lines the same way.
 *
 * Reading the file is the only way to count its newlines, and it is cheap
 * here: the cache holds each source file once, and this runs per diagnostic,
 * never per byte or per reference.
 *
 * `.md` returns undefined — line unknown, printed without one (§14.1). A span
 * whose file is a Markdown source carries an offset into that file's
 * CONVERTED HTML, not into the `.md` text: §10.1 converts first and inlines
 * afterwards, so `md.html` (and every fragment spliced into it) is what the
 * offsets index, and markdown.js exposes no map back to source positions.
 * Reading `about.md` and counting to that offset would produce a real-looking
 * line in the wrong place — exactly the failure this resolver exists to end,
 * so it declines instead. (Closing it properly means a converted-offset →
 * source-line map out of markdown.js; noted, not attempted here.)
 * @param {string} sourceRoot
 * @returns {(file: string, fileOffset: number) => number|undefined}
 */
function makeSourceLineResolver(sourceRoot) {
  /** @type {Map<string, string|null>} source-root-relative path -> raw text, or null when unreadable */
  const cache = new Map();
  return (file, fileOffset) => {
    if (extname(file).toLowerCase() === ".md") return undefined;
    if (!cache.has(file)) {
      let text = null;
      try {
        text = readFileSync(resolve(sourceRoot, file), "utf8");
      } catch {
        text = null; // deleted mid-build, or a synthetic name: no line, never a guessed one
      }
      cache.set(file, text);
    }
    const text = cache.get(file);
    return text === null ? undefined : html.lineOf(text, fileOffset);
  };
}

/**
 * Build the `locate` callback `references.checkReferences` uses for §14.1
 * R3 attribution: given an EMITTED output path and a byte offset into that
 * file's FINAL (post-§11-rewrite) text, return the reference's true
 * provenance `{file, line}` — a page, layout, or include, not just the
 * composed page's own path (see `stranded-underscore-asset`'s pinned
 * `src/_includes/nav.html:2`).
 *
 * `pageSpansByOutputPath` holds each composed page's OWN spans, valid
 * against its PRE-rewrite composed text. §11's rewrites (`urls.rewriteUrls`)
 * only ever replace attribute VALUE bytes in place — never insert or delete
 * a byte before content that itself was not rewritten — so querying those
 * spans with an offset taken from the FINAL text is exact for any reference
 * with no EARLIER length-changing rewrite before it in the same output
 * file. A fully general fix would mean `urls.js` tracking spans through its
 * own edits too, which nothing this repository checks needs (every fixture
 * requiring real attribution — this one — resolves correctly under the
 * above); named here rather than silently assumed.
 *
 * Once the right span is found, its position in that file's OWN raw text
 * gives a real line number through `resolveLine` — the same resolver
 * `compose()` is given, so a diagnostic about a fragment reads the same
 * whether §7 or §12 raised it. `outputFile` is not always a composed PAGE,
 * though — a CSS file is only ever mirror-copied, never in
 * `pageSpansByOutputPath` at all, and even a page's own spans can fail to
 * cover an offset that a length-increasing §11 rewrite pushed past the
 * pre-rewrite text's end. Either way, when no span covers the query, the
 * OUTPUT file's own (already-loaded) text is itself the true provenance —
 * exactly references.js's own `defaultLocate` fallback, reused here rather
 * than reimplemented.
 * @param {Map<string, {start:number,end:number,file:string,fileOffset:number}[]>} pageSpansByOutputPath
 * @param {Map<string,string>} htmlFiles
 * @param {Map<string,string>} cssFiles
 * @param {(file: string, fileOffset: number) => number|undefined} resolveLine
 * @returns {import('../../core/references.js').Locate}
 */
function makeReferenceLocator(pageSpansByOutputPath, htmlFiles, cssFiles, resolveLine) {
  return (outputFile, offset) => {
    const spans = pageSpansByOutputPath.get(outputFile);
    const hit = spans ? urls.spansToSourceLocator(spans, outputFile)(offset) : null;
    if (!hit || hit.fileOffset === null) {
      const text = htmlFiles.get(outputFile) ?? cssFiles.get(outputFile) ?? "";
      return { file: outputFile, line: html.lineOf(text, offset) };
    }
    return { file: hit.file, line: resolveLine(hit.file, hit.fileOffset) };
  };
}

/**
 * `reporter.canPublish` (diagnostics.js, out of scope here) is `problemCount
 * === 0` only — it does not account for `--strict` turning an advisory into
 * a publish-blocking condition, which the kitchen-sink `strict` profile
 * fixture requires (one advisory, `--strict`, zero problems, `published:
 * false`). `reporter.exitCode` already encodes the correct condition
 * (`problemCount === 0 && !(strict && advisoryCount > 0)`), so this function
 * uses that instead — a one-line workaround in this file rather than an edit
 * to diagnostics.js or publish.js (both out of scope). Whenever this
 * returns true, `canPublish` is also true (a strict superset), so
 * `publish()`'s own internal `canPublish` gate never disagrees.
 */
function shouldPublish(reporter) {
  return reporter.canPublish;
}

// ------------------------------------------------------------- per-page build

/**
 * Every file `inlineIncludes` attributed any text to, OTHER than `entryFile`
 * itself, was consumed as an include (directly or transitively) — A10's own
 * accumulation, fed by every `inlineIncludes` call below (page and layout
 * alike). A zero-length span (an empty include target — includes.js's own
 * doc comment) still records the file's identity, so an empty fragment
 * still counts as "used".
 */
function trackIncludedFiles(spans, entryFile, consumedAsIncludeOrLayout) {
  for (const s of spans) if (s.file !== entryFile) consumedAsIncludeOrLayout.add(s.file);
}

/**
 * Run one page through §2 steps 2-4: includes → (Markdown conversion, for
 * `.md`) → layout resolution → composition. Returns `{text, spans}` (see
 * includes.js/compose.js for the spans contract) plus `layoutFile` — the
 * resolved layout's source-root-relative path, or `null` when the page has
 * no layout (§17/DRY-02's "the layout it resolved to"; nothing upstream of
 * this function retained that fact past the resolution step) — or `null`
 * when the page has a problem of its own (already reported) — best-effort
 * composition continues with the next page regardless (the caller's loop,
 * not this function).
 * @returns {Promise<{text: string, spans: {start:number,end:number,file:string,fileOffset:number}[], layoutFile: string|null}|null>}
 */
async function buildPage(page, { sourceRoot, reporter, layoutCache, convertMarkdown, consumedAsIncludeOrLayout, resolveLine }) {
  const pageFile = page.relPath;

  if (extname(page.absPath) === ".md") {
    const source = readFileSync(page.absPath, "utf8");
    const md = markdown.convert(source, { path: page.absPath, sourceRoot, reporter });

    // Layout selection reads the frontmatter value markdown.js already
    // parsed — resolved BEFORE assembly, because §10.7's shell (charset
    // synthesized) and the to-be-composed shape (no charset — the layout
    // supplies it) are different documents for the exact same page (see the
    // seam this task exists to close, described in CLAUDE.md/the task brief).
    const resolution = layout.resolveMarkdownLayout({
      layoutValue: md.layout, mdSource: source, pageAbsPath: page.absPath, sourceRoot, file: pageFile, reporter,
    });
    if (resolution.problem) return null;

    // §10.1: includes resolve AFTER conversion, on the converted body — same
    // machinery as an HTML page, applied to `md.html` instead of raw source.
    const inlinedBody = await includes.inlineIncludes({
      // DIA-13: `md.html` is converted output, so its newline count numbers a
      // document the author never wrote — includes.js omits the line rather
      // than guessing one (the file is still exact).
      text: md.html, file: page.absPath, sourceRoot, reporter, convertMarkdown, linesAreSource: false,
    });
    trackIncludedFiles(inlinedBody.spans, pageFile, consumedAsIncludeOrLayout);
    const assembled = { ...md, html: inlinedBody.text, htmlSpans: inlinedBody.spans };

    if (resolution.none) {
      const { text: pageText, spans: pageSpans } = compose.assembleMarkdownDocument(assembled, { standalone: true, pageFile });
      return { ...compose.compose({ pageText, pageFile, pageSpans, layoutText: null, resolveLine, reporter }), layoutFile: null };
    }

    const loaded = await loadLayout(resolution.path, { sourceRoot, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine });
    if (loaded.broken) return null; // P15 already reported once for the layout itself
    const { text: pageText, spans: pageSpans } = compose.assembleMarkdownDocument(assembled, { standalone: false, pageFile });
    return {
      ...compose.compose({
        pageText, pageFile, pageSpans, layoutText: loaded.text, layoutFile: loaded.file, layoutSpans: loaded.spans,
        resolveLine, reporter,
      }),
      layoutFile: loaded.file,
    };
  }

  // .html
  const raw = readFileSync(page.absPath, "utf8");
  markdown.checkHtmlFrontmatter(raw, { path: page.absPath, sourceRoot, reporter }); // P10
  const inlined = await includes.inlineIncludes({ text: raw, file: page.absPath, sourceRoot, reporter, convertMarkdown });
  trackIncludedFiles(inlined.spans, pageFile, consumedAsIncludeOrLayout);
  const { root } = html.parse(inlined.text);
  // Same `spans`/`resolveLine` pair `compose()` gets below: §6's diagnostics
  // (P07 on a misplaced data-layout, P04/P05 on a bad path) are measured in
  // the include-inlined text too, so they need the same translation back to a
  // real source line as §7's — layout.js's own DIAGNOSTIC LOCATION note.
  const resolution = layout.resolveHtmlLayout({
    root, text: inlined.text, spans: inlined.spans, resolveLine, pageAbsPath: page.absPath, sourceRoot, reporter,
  });
  if (resolution.problem) return null;

  if (resolution.none) {
    return { ...compose.compose({ pageText: inlined.text, pageFile, pageSpans: inlined.spans, layoutText: null, resolveLine, reporter }), layoutFile: null };
  }

  const loaded = await loadLayout(resolution.path, { sourceRoot, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine });
  if (loaded.broken) return null;
  return {
    ...compose.compose({
      pageText: inlined.text, pageFile, pageSpans: inlined.spans,
      layoutText: loaded.text, layoutFile: loaded.file, layoutSpans: loaded.spans, resolveLine, reporter,
    }),
    layoutFile: loaded.file,
  };
}

/**
 * Load and prepare a layout file: inline its own includes (§2 step 2 — every
 * layout, not only pages), then check it for P15 (declares its own
 * `data-layout` — chaining is not supported) and P07 (misplaced
 * `data-layout` elsewhere in the document). Cached by absolute path so a
 * layout shared by many pages is read/checked once and any P15 it carries is
 * reported exactly once (§14.1 exhaustiveness — a diagnostic repeated once
 * per referencing page would not match a fixture's declared count); the
 * A10 "used as a layout" fact is likewise recorded exactly once here rather
 * than once per referencing page.
 */
function loadLayout(absPath, { sourceRoot, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine }) {
  if (layoutCache.has(absPath)) return layoutCache.get(absPath);
  const promise = (async () => {
    const file = toRelative(sourceRoot, absPath);
    consumedAsIncludeOrLayout.add(file);
    let raw;
    try {
      raw = readFileSync(absPath, "utf8");
    } catch {
      return { text: "", spans: [], file, broken: true };
    }
    const inlined = await includes.inlineIncludes({ text: raw, file: absPath, sourceRoot, reporter, convertMarkdown });
    trackIncludedFiles(inlined.spans, file, consumedAsIncludeOrLayout);
    const { root } = html.parse(inlined.text);
    const { broken } = layout.checkLayoutDocument({
      root, text: inlined.text, spans: inlined.spans, resolveLine, file, reporter,
    });
    return { text: inlined.text, spans: inlined.spans, file, broken };
  })();
  layoutCache.set(absPath, promise);
  return promise;
}

/**
 * Every core module that reports its own diagnostics (includes.js,
 * markdown.js, layout.js) computes the `file` field as source-root-relative
 * — confirmed deliberate, not a bug in those modules: compose.js's own unit
 * tests assert e.g. `diagnostics[0].file === "_layout.html"`, never
 * `"src/_layout.html"`. compose.js/head-merge.js do the same with whatever
 * `pageFile`/`layoutFile` strings this file hands them (also source-root-relative
 * throughout this module); collisions.js does too (it echoes back the
 * `SourceEntry.path` this file supplied). references.js's diagnostics are
 * the one approximation on top of an approximation — its `file` is the
 * OUTPUT path, which only equals the source-root-relative source path when a
 * page is neither `.md`-converted nor `--pretty-urls`-moved; that residual
 * imprecision is inherited from its own documented provenance gap, not
 * introduced here. But every worked example in the conformance spec, and
 * every fixture manifest's declared diagnostics, show the location the way a
 * user invoking `unify build -s src` would type it: `src/_layout.html` —
 * i.e. relative to the process's cwd, not the source root.
 *
 * Bridging that gap belongs here: this is the one place that knows both the
 * source root's absolute path and the process's cwd. Rewrites every
 * collected diagnostic's `file` field, once, in place, right before
 * reporting — never touching `message`/`context`/`fixes` text (an
 * include-cycle chain's own embedded file list, for instance, stays
 * source-root-relative, matching the spec's own cycle example verbatim).
 */
function relocateDiagnosticsToCwd(reporter, sourceRoot) {
  const cwd = process.cwd();
  for (const d of reporter.diagnostics) {
    d.file = toRelative(cwd, resolve(sourceRoot, d.file));
  }
}

// ------------------------------------------------------------------ scanning

/**
 * §2 step 1 (scan) + §4 (classification) + §4.1 (exclusion), the minimum
 * needed to feed the composition pipeline and the §13 entry list: walk the
 * source tree once (skipping the never-shipped list, §4.3 — the only thing
 * that escapes scanning entirely), classify each file as a page
 * (`.html`/`.md`, §1) or asset, and mark it excluded per the effective
 * `--exclude` glob set.
 *
 * §4.4/A12 — symlinks: followed only while the resolved target stays inside
 * the source root. A directory symlink is walked at its LOGICAL (symlink)
 * path, exactly as an ordinary directory would be, so its children's
 * `relPath`s reflect where the link sits in the tree, not where the target
 * physically lives. One resolving outside the root — or broken entirely —
 * is treated as absent; the outside case additionally carries advisory A12,
 * located at the symlink's own path (no line: it is a whole-file fact).
 *
 * @param {string} sourceRoot
 * @param {string} output
 * @param {string[]} excludePatterns
 * @param {import('../../core/diagnostics.js').Reporter} reporter
 * @returns {{absPath: string, relPath: string, isPage: boolean, excluded: boolean}[]} sorted by relPath (determinism, DIA-05)
 */
function scanSourceTree(sourceRoot, output, excludePatterns, reporter) {
  const root = resolve(sourceRoot);
  const outputAbs = resolve(output);
  /** @type {{absPath: string, relPath: string, isPage: boolean, excluded: boolean}[]} */
  const files = [];

  walk(root);
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return files;

  function pushFile(abs, rel) {
    const isPage = extname(rel) === ".html" || extname(rel) === ".md";
    files.push({ absPath: abs, relPath: rel, isPage, excluded: isExcluded(rel, excludePatterns) });
  }

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (abs === outputAbs) continue; // never re-scan the build's own output as source material
      const rel = toRelative(root, abs);
      if (isNeverShipped(rel)) continue; // §4.3 — the only scan-time exemption

      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = realpathSync(abs);
        } catch {
          continue; // broken target: not a path the build can read — treated as absent, silently (not the A12 case)
        }
        if (!contains(root, real)) {
          reporter.advisory({ file: rel, message: `${rel} is a symlink resolving outside the source root — treated as absent` });
          continue;
        }
        let targetStat;
        try {
          targetStat = statSync(real);
        } catch {
          continue;
        }
        if (targetStat.isDirectory()) walk(abs);
        else if (targetStat.isFile()) pushFile(abs, rel);
        continue;
      }
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      pushFile(abs, rel);
    }
  }
}

/**
 * §4.1: a pattern with no `/` is tested against every path segment; a
 * pattern with `/` is tested against the full relative path, with `*`
 * (within a segment), `**` (across segments), `?`, and `[...]` supported.
 */
function isExcluded(relPath, patterns) {
  const segments = relPath.split("/");
  for (const pattern of patterns) {
    if (pattern.includes("/")) {
      if (globToRegExp(pattern, { multiSegment: true }).test(relPath)) return true;
    } else {
      const re = globToRegExp(pattern, { multiSegment: false });
      if (segments.some((seg) => re.test(seg))) return true;
    }
  }
  return false;
}

const GLOB_CACHE = new Map();

function globToRegExp(pattern, { multiSegment }) {
  const cacheKey = `${multiSegment} ${pattern}`;
  const cached = GLOB_CACHE.get(cacheKey);
  if (cached) return cached;

  let src = "";
  for (let i = 0; i < pattern.length; i++) {
    if (multiSegment && pattern.startsWith("**", i)) {
      src += ".*";
      i++;
      continue;
    }
    const c = pattern[i];
    if (c === "*") {
      src += "[^/]*";
    } else if (c === "?") {
      src += "[^/]";
    } else if (c === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) {
        src += "\\[";
      } else {
        src += pattern.slice(i, close + 1);
        i = close;
      }
    } else {
      src += c.replace(/[.+^${}()|\\]/g, "\\$&");
    }
  }
  const re = new RegExp(`^${src}$`);
  GLOB_CACHE.set(cacheKey, re);
  return re;
}
