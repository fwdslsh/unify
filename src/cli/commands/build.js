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
import { contains, isNeverShipped, locateVirtual, nameOf, resolutionRoots, toRelative } from "../../core/paths.js";
import * as publishModule from "../../core/publish.js";
import * as references from "../../core/references.js";
import * as urls from "../../core/urls.js";
import { buildManifest } from "../../core/manifest.js";
import { auditManifest, formatFindings } from "../../core/audit.js";
import * as sitemap from "../../core/sitemap.js";
import * as feed from "../../core/feed.js";
import * as searchIndex from "../../core/search-index.js";
import { completeCanonical } from "../../core/canonical.js";
import { checkSchemaDeclarations, generateStructuredData } from "../../core/structured-data.js";
import * as robots from "../../core/robots.js";
import * as generate from "../../core/generate.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {string} context.output
 * @param {Record<string, any>} context.settings
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @param {boolean} [context.sourceDefaulted] - §4.4 EXC-11: true only when
 *   nothing chose the source root (no --source, no unify.yaml key, no src/)
 * @returns {Promise<number>}
 *
 * Two keys on `settings` are set by a command rather than by a flag, and both
 * only select which of this one pipeline's tails runs: `audit` (§24, set by
 * `audit.js`) and `onEvaluation` (§27, set by `dev.js`). Neither is parseable
 * from the command line — `options.js` is the whole flag surface — and
 * `unify build` and `unify watch` set neither, which is what keeps §24.7
 * literally true of them: they never call the evaluator at all.
 *
 * `onEvaluation` rides on `settings` because `settings` is the one thing
 * `watch.js` forwards to every rebuild it runs (`{...settings, clean: false}`),
 * and `unify dev` IS `unify watch` plus a server — there is no other seam
 * between the two that reaches a rebuild.
 */
export async function build({ sourceRoot, output, settings, reporter, sourceDefaulted = false }) {
  // ---- §33 — the generator seam, BEFORE §2 step 1 --------------------------
  // It runs before the scan on purpose (§33.5): it sees the source tree as it
  // is on disk and nothing else — no manifest, no composed pages, no output —
  // which is the boundary that keeps this a seam rather than a plugin API. A
  // generator cannot observe unify's intermediate state, so no future change
  // to that state can break one.
  let overlayDir = null;
  if (settings.generate) {
    const generatorAbs = generate.resolveGeneratorPath(settings.generate, sourceRoot);
    overlayDir = generate.makeOverlayDir();
    const ok = await generate.runGenerator({ generatorAbs, sourceRoot, overlayDir, reporter });
    if (!ok) {
      // P29 stops the build BEFORE the scan: a partial overlay is a site
      // nobody described, and §15's transaction leaves the previous dist/
      // untouched exactly as any other problem would.
      //
      // The two lines before the return are not optional. Returning straight
      // out skipped them and the build exited 1 having printed NOTHING —
      // a silent failure, which is worse than the fault it was reporting and
      // exactly what §14 exists to forbid. Every other exit from this
      // function passes through the same pair; this one had to as well.
      relocateDiagnosticsToCwd(reporter, sourceRoot);
      reporter.flush();
      generate.removeOverlayDir(overlayDir);
      return 1;
    }
  }

  try {
    return await runBuild({ sourceRoot, output, settings, reporter, sourceDefaulted, overlayDir });
  } finally {
    if (overlayDir !== null) generate.removeOverlayDir(overlayDir);
  }
}

/** The build proper, with §33's overlay already produced (or absent). */
async function runBuild({ sourceRoot, output, settings, reporter, sourceDefaulted, overlayDir }) {
  // §33.3 — THE RESOLUTION NAMESPACE, computed once and threaded everywhere a
  // path is resolved or named. The overlay joins the scan (below) and this: a
  // generated page walks for `_layout.html` and an `<include src>` finds a
  // generated fragment because both ask the namespace, not one directory.
  const roots = resolutionRoots(sourceRoot, overlayDir);
  const files = scanSourceTree(sourceRoot, output, settings.exclude, reporter, overlayDir);

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
  const convertMarkdown = (absPath) => markdown.convertFragment(absPath, { sourceRoot, roots, reporter });
  const resolveLine = makeSourceLineResolver(roots);
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
      const composed = await buildPage(page, { sourceRoot, roots, reporter, layoutCache, convertMarkdown, consumedAsIncludeOrLayout, resolveLine });
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
        composedPages.push({ relPath: page.relPath, html: composed.text, spans: composed.spans, layoutFile: composed.layoutFile, generated: page.generated === true });
      }
    } catch (err) {
      // Best-effort composition (PIP-02): one page's failure must not stop
      // analysis of the others. This is a defensive net for the unexpected
      // (a genuine crash is not itself a closed-catalogue diagnostic); every
      // *known* failure mode above already reports its own problem/advisory
      // and returns null instead of throwing.
      reporter.problem({
        file: page.relPath,
        message: `internal error building this page: ${err.message}`,
        fixes: ["this is a bug in unify, not in your site — re-run with DEBUG=1 for the stack trace, and please report it"],
      });
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
  // §33.4 — a relative path present in BOTH trees is P12, and the message has
  // to name which is which: "index.html and index.html both produce
  // index.html" tells an author nothing. `label` is display-only, so §13's
  // keying and every downstream consumer are untouched.
  const label = (rel, generated) => (generated ? `${rel} (generated)` : rel);
  const entries = [
    ...composedPages.map((p) => ({ path: p.relPath, kind: "page", label: label(p.relPath, p.generated) })),
    ...assetFiles.map((a) => ({ path: a.relPath, kind: "asset", label: label(a.relPath, a.generated) })),
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
  // §20.1's membership set, accumulated as each page's FINAL text is produced
  // — the manifest reads the bytes §15 would publish (§20.2), so it is filled
  // from the rewritten text below rather than from `composedPages`.
  /** @type {{sourcePath: string, outputPath: string, html: string, generated: boolean, layout: string|null}[]} */
  const manifestPages = [];
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
    // §33.4 — a generated page has no file in the author's source tree, so
    // every surface that NAMES its source has to know. Without this the
    // audit reported `log.html` at a path the author cannot open, under a
    // fix line telling them to rename a file they never wrote.
    //
    // §20.3 — `layout` is the same shape one step over: the layout this page
    // resolved to, or `null` when it composed with none (`data-layout="none"`,
    // `layout: none`, no `_layout.html` above it). It rides along here rather
    // than being re-derived downstream because `buildPage` is the only place
    // that KNOWS — §17's report already prints the same fact as `← page +
    // layout` vs `← page (no layout)`, from this very value.
    manifestPages.push({
      sourcePath: p.relPath,
      outputPath: finalOutputPath,
      html: rewritten,
      generated: p.generated === true,
      layout: p.layoutFile ?? null,
    });
  }

  // §4.4/EXC-09 — mirror copy: every emitted asset, byte-for-byte, same
  // relative identity (only its OUTPUT path may move, under --pretty-urls
  // collision resolution — content never does).
  for (const asset of assetFiles) {
    tempFiles.set(outputPathOf.get(asset.relPath), readFileSync(asset.absPath));
  }

  // ---- §22 — canonical completion, before the manifest is derived. ---------
  // A preliminary manifest decides which pages qualify, the completion is
  // applied to the emitted text, and §20's manifest is then derived from the
  // result — so §20.2's "every field is read from the emitted text" stays
  // literally true rather than being patched around. The extra pass runs only
  // under --canonical auto.
  /**
   * Output path -> the byte insertions §22 and §26 made, so §14.1's locator can
   * undo them — in **reverse application order**, most recent first. Each `at`
   * is a position in the text that insertion was applied to, so the locator
   * has to peel them off newest-first to keep asking each `at` about an offset
   * measured in its own text (see `makeReferenceLocator`).
   */
  const insertionsByOutputPath = new Map();
  /**
   * Output path -> the page's emitted text as it stood BEFORE §22 or §26 wrote
   * into it. The span table `makeReferenceLocator` queries describes exactly
   * that text, so its own last-resort fallback — numbering an offset against a
   * whole file when no span covers it — has to number it against this and not
   * against the taller final text. Numbering the final text added every line an
   * insertion contributed to the printed number, which on a 16-line page put a
   * §12 problem at line 22: a number the file cannot hold, which is DIA-06's
   * "checkable-looking and wrong" reached by arithmetic rather than by a guess.
   */
  const preInsertionByOutputPath = new Map();
  /**
   * Record one feature's insertions into a page — newest first, since each
   * `at` is measured in the text ITS feature was applied to — and remember the
   * page's pre-insertion text the first time anything writes into it. Called
   * BEFORE `page.html` is replaced, which is what makes that text the right one.
   *
   * Each insertion carries the page's OWN source path: §1's provenance is "the
   * source file whose text contained an element's start tag" and a generated
   * element has none, so a reference §12 finds inside these bytes is located at
   * the page the block was generated for (§26.7) rather than at whichever file
   * happened to contribute the `</head>` it was spliced before — a layout, or
   * an include's fragment, neither of which contains the reference.
   */
  const noteInsertions = (page, insertions) => {
    if (!preInsertionByOutputPath.has(page.outputPath)) {
      preInsertionByOutputPath.set(page.outputPath, page.html);
    }
    insertionsByOutputPath.set(page.outputPath, [
      ...insertions.map((ins) => ({ ...ins, file: page.sourcePath })),
      ...(insertionsByOutputPath.get(page.outputPath) ?? []),
    ]);
  };
  let completedCount = 0;
  if (settings.canonical === "auto") {
    const preliminary = buildManifest({ pages: manifestPages, base: baseConfig });
    for (const page of manifestPages) {
      const record = preliminary.byOutputPath.get(page.outputPath);
      if (!record) continue;
      const completed = completeCanonical(page.html, record, baseConfig);
      if (completed.text === page.html) continue;
      noteInsertions(page, completed.insertions);
      page.html = completed.text;
      tempFiles.set(page.outputPath, completed.text);
      completedCount++;
    }
  }

  // ---- §26 — structured data: P23, then bounded generation. ----------------
  // Ordered here for §22's own reason, one section on: the manifest reads
  // emitted bytes (§20.2), so anything that writes into a page must have
  // written before the reading every consumer shares. AFTER §22 specifically,
  // because a page whose canonical `--canonical auto` supplied must generate
  // THAT url rather than a second opinion about its own address (§26.7).
  //
  // The declaration is the whole opt-in — §26 has no flag — so `audit` runs
  // this exactly as `build` does, and the two emit the same bytes.
  const schemaLocate = makeReferenceLocator(
    pageSpansByOutputPath,
    new Map(manifestPages.map((p) => [p.outputPath, p.html])),
    new Map(),
    resolveLine,
    insertionsByOutputPath,
    preInsertionByOutputPath,
  );
  // P23 first, and unconditionally: a `schema` value naming a type unify does
  // not generate is a problem whether or not anything else about the page would
  // have generated (§26.4). It is located at the declaration — the `<meta>` and
  // its line for an HTML page, the `.md` file with no line for a Markdown one
  // (§14.1), which is what `schemaLocate` answers.
  let anyDeclaration = false;
  for (const page of manifestPages) {
    const declares = checkSchemaDeclarations({
      html: page.html, outputPath: page.outputPath, locate: schemaLocate, reporter,
    });
    anyDeclaration ||= declares;
  }
  // The preliminary manifest §26.5 decides against — derived from the
  // POST-completion text, exactly as §22's is derived from the pre-completion
  // one. Skipped when no page declared a generable type: that return value is a
  // superset of the pages that can generate (§26.5's conditions 1 and 2 leave
  // the meta as the only surviving source of `schemaType`), so skipping it can
  // never suppress a block — it only spares a site that opted into nothing the
  // derivation, which is what "a site that writes none is the golden path,
  // unchanged" costs to mean.
  let generatedCount = 0;
  if (anyDeclaration) {
    const preliminary = buildManifest({ pages: manifestPages, base: baseConfig });
    for (const page of manifestPages) {
      const record = preliminary.byOutputPath.get(page.outputPath);
      if (!record) continue;
      const block = generateStructuredData(page.html, record);
      if (block.text === page.html) continue;
      // Prepended, not appended: §26 wrote into the text §22 had already
      // lengthened, so it is the one the locator must undo first (`noteInsertions`).
      noteInsertions(page, block.insertions);
      page.html = block.text;
      tempFiles.set(page.outputPath, block.text);
      generatedCount++;
    }
  }

  // ---- §20 — the final-output page manifest. -------------------------------
  // Derived here, between §11 and §12, because this is the first moment every
  // page's emitted bytes exist and the last moment before anything reads them.
  // It observes only: no diagnostic, no write, no effect on the exit code
  // (§20.2). Every discovery, evaluation, and publication feature downstream
  // consumes THIS — adding a second extractor is the defect product-spec §6.2
  // exists to forbid.
  //
  // Derived unconditionally, including on builds no consumer below reads it
  // for: that is what holds §20.2's "changes nothing" invariant to the whole
  // fixture corpus rather than to the pages a discovery feature happens to
  // touch. An extractor that threw on some real emitted document would fail
  // the suite here, not at the first site that enabled a sitemap.
  const manifest = buildManifest({ pages: manifestPages, base: baseConfig });

  // ---- §21 — sitemap generation, the manifest's first projection. ----------
  // §21.5 must know which paths the site already emits from its own source
  // before it claims one. That set is `emittedFromSource` below, built from
  // `composedPages` and `assetFiles` directly rather than from `tempFiles` —
  // so ordering against the mirror copy is not what makes it correct, and this
  // block would work above it too. Generated files then join `tempFiles` like
  // any other output, which is what makes them appear in --dry-run, participate
  // in §15's transactional publish, and fall under §12's checks with no
  // special-casing in any of the three.
  const emittedFromSource = new Map([
    ...composedPages.map((p) => [outputPathOf.get(p.relPath), p.relPath]),
    ...assetFiles.map((a) => [outputPathOf.get(a.relPath), a.relPath]),
  ]);
  const generated = sitemap.generateSitemap({
    records: manifest.records, base: baseConfig, emittedFromSource, reporter,
  });
  for (const [outPath, text] of generated) tempFiles.set(outPath, text);

  // ---- §29 — feed generation, the manifest's second projection. -----------
  // Same shape as §21 immediately above, one document type over: reads
  // `manifest.records` and nothing else about the page (`pageHtml` is the one
  // exception, and only under --feed-full — see feed.js's own module comment
  // for why that still isn't a second interpretation of the site). No
  // ordering dependency against sitemap generation either direction; wired
  // beside it because both are manifest projections that join `tempFiles`
  // before §12's reference check and §15's transactional publish. Reuses
  // `emittedFromSource` — built once, immediately above, for exactly this
  // sharing (§29.7/§21.5's suppression test).
  //
  // `manifestPages[i].html` is each page's FINAL emitted HTML: it was
  // mutated in place by §22's canonical completion and §26's structured-data
  // generation above (`page.html = completed.text` / `page.html =
  // block.text`), and it is the exact text `buildManifest` just read to
  // produce `manifest` itself — so `pageHtml` never disagrees with what
  // `record.title`/`record.canonical`/etc. say about the same page.
  const pageHtml = settings.feedFull
    ? new Map(manifestPages.map((p) => [p.outputPath, p.html]))
    : null;
  const generatedFeed = feed.generateFeed({
    records: manifest.records, base: baseConfig, feedFull: settings.feedFull,
    pageHtml, emittedFromSource, reporter,
  });
  for (const [outPath, text] of generatedFeed) tempFiles.set(outPath, text);

  // ---- §30 — the search manifest, the manifest's third projection. --------
  // Unlike sitemap/feed, activation is the flag ALONE (§30.1) — nothing about
  // a page declares "index me", so there is no record-derived condition to
  // check the way `generateSitemap`/`generateFeed` check `base`/`schemaType`.
  // Unconditional on `baseConfig`: `searchIndexEntry` already falls back to
  // `record.path` with no --base-url (§30.2), so gating this on `base` would
  // make the flag useless for the local-preview case it exists for.
  const generatedSearchIndex = settings.searchIndex
    ? searchIndex.generateSearchIndex({ records: manifest.records, base: baseConfig, emittedFromSource })
    : new Map();
  for (const [outPath, text] of generatedSearchIndex) tempFiles.set(outPath, text);

  // ---- §12 — the reference check, against the completed temp tree. --------
  const htmlFiles = new Map();
  const cssFiles = new Map();
  for (const [outPath, content] of tempFiles) {
    const text = typeof content === "string" ? content : null;
    if (extname(outPath) === ".html" && text !== null) htmlFiles.set(outPath, text);
    else if (extname(outPath) === ".css") cssFiles.set(outPath, text ?? content.toString("utf8"));
  }
  // §21.6 — every internal <loc> in an emitted output-root sitemap must name a
  // file the site emits. Both kinds are checked: what unify generated (where
  // this can only pass, and is the executable form of "the sitemap and the tree
  // agree") and what the author wrote (where it is a real check). Attribution
  // is the SOURCE path for an authored file — `dist/sitemap.xml` is not a file
  // anyone can edit.
  //
  // Gated on `baseConfig` because §21.1's activation governs the whole section.
  // Without --base-url an authored sitemap is an ordinary mirror-copied asset
  // and unify says nothing about it, which is what keeps a working site that
  // shipped one building exactly as it did before: nothing the author wrote
  // changed, and no flag opted them in. It is also the only coherent reading —
  // a <loc> is an absolute URL, and deciding whether one points inside THIS
  // site is not answerable without the site's address.
  let sitemapLocs = new Map();
  if (baseConfig) {
    const sitemapFiles = new Map();
    for (const outPath of [sitemap.SITEMAP_PATH, ...generated.keys()]) {
      const content = tempFiles.get(outPath);
      if (typeof content !== "string" && !Buffer.isBuffer(content)) continue;
      sitemapFiles.set(outPath, {
        text: typeof content === "string" ? content : content.toString("utf8"),
        file: emittedFromSource.get(outPath) ?? outPath,
      });
    }
    sitemap.checkSitemapLocs({
      sitemaps: sitemapFiles, emittedPaths: new Set(tempFiles.keys()), base: baseConfig, reporter,
    });
    // §24.4 — the same resolution, kept for the evaluator: which pages does a
    // sitemap this build emits actually list? Computed here rather than in
    // audit.js so the check and the comparison read one answer — see
    // `sitemapListings` for what a second resolver costs: the two would agree
    // on every ASCII path and diverge on the first escaped one, which is the
    // one-interpretation law product-spec §6.1 states for URLs.
    sitemapLocs = sitemap.sitemapListings({ sitemaps: sitemapFiles, base: baseConfig });

    // §29.7 — every <id>/<link href> in an emitted feed.xml (generated or
    // authored) must resolve to a file the site emits, exactly as §21.6
    // checks a sitemap's <loc> — same gate on `baseConfig` as the sitemap
    // check immediately above, and for the same reason: a feed is generated
    // only under --base-url (§29.1), and this is where an AUTHORED feed.xml
    // is checked too (§29.7's suppression is silent about --base-url, so it
    // is read the way §21.5/§21.6 read an authored sitemap.xml — checked
    // whenever this build knows the site's address). Must run before
    // references.checkReferences below, for the same reason the sitemap
    // check does: both raise P13 against the SAME emittedPaths set, and
    // ordering relative to each other does not matter, only ordering before
    // §12's own pass over the rest of the tree.
    const feedContent = tempFiles.get(feed.FEED_PATH);
    if (typeof feedContent === "string" || Buffer.isBuffer(feedContent)) {
      feed.checkFeedLocs({
        text: typeof feedContent === "string" ? feedContent : feedContent.toString("utf8"),
        file: emittedFromSource.get(feed.FEED_PATH) ?? feed.FEED_PATH,
        emittedPaths: new Set(tempFiles.keys()),
        base: baseConfig, reporter,
      });
    }
  }

  // §23 — the one reference in an authored robots.txt. Ungated, unlike §21.6:
  // a `<loc>` is absolute by protocol and genuinely needs the site's address to
  // classify, but `Sitemap: /sitemap.xml` is internal by inspection. `base` may
  // be null; it governs only the stripping step, exactly as in §12.
  //
  // The return value is §23.3's exemption — the `Sitemap:` lines the check
  // DECLINED to report — carried to the only command that reports them (§24.4's
  // `robots-sitemap-missing`). Threaded exactly as `sitemapLocs` above is:
  // computed by the module that owns the question, empty for the builds where
  // the question never arose, and read only inside the audit branch below. A
  // `build` receives it and ignores it, which is §24.7.
  /** @type {{file: string, value: string}[]} */
  let exemptedSitemaps = [];
  const robotsContent = tempFiles.get(robots.ROBOTS_PATH);
  if (robotsContent !== undefined) {
    exemptedSitemaps = robots.checkRobots({
      text: typeof robotsContent === "string" ? robotsContent : robotsContent.toString("utf8"),
      file: emittedFromSource.get(robots.ROBOTS_PATH) ?? robots.ROBOTS_PATH,
      emittedPaths: new Set(tempFiles.keys()),
      base: baseConfig,
      reporter,
    });
  }

  // §12's second fix line for the three generated root names. Computed here,
  // not in references.js, because only this loop knows WHY a file was not
  // generated this run — and only for names absent from the output, so a
  // build that emitted (or shipped an authored) file never consults it.
  const wouldGenerate = new Map();
  if (!tempFiles.has(feed.FEED_PATH)) {
    const candidates = manifest.records.some((rec) => feed.isFeedCandidate(rec));
    wouldGenerate.set(feed.FEED_PATH,
      baseConfig === null
        ? "feed.xml is generated, not authored: this build generates it only under --base-url, from pages declaring schema: Article or BlogPosting with a dated time"
        : candidates
          ? "feed.xml is generated, not authored: the declared posts' dates carry no time of day, so none is a feed entry (each is reported above)"
          : "feed.xml is generated, not authored: no page on this build declares schema: Article or BlogPosting");
  }
  if (!tempFiles.has(sitemap.SITEMAP_PATH) && baseConfig === null) {
    wouldGenerate.set(sitemap.SITEMAP_PATH,
      "sitemap.xml is generated, not authored: this build generates it only under --base-url");
  }
  if (!tempFiles.has(searchIndex.SEARCH_INDEX_PATH) && settings.searchIndex !== true) {
    wouldGenerate.set(searchIndex.SEARCH_INDEX_PATH,
      "search-index.json is generated, not authored: this build generates it only under --search-index");
  }

  references.checkReferences({
    htmlFiles, cssFiles, emittedPaths: new Set(tempFiles.keys()), base: baseConfig, reporter, wouldGenerate,
    locate: makeReferenceLocator(
      pageSpansByOutputPath, htmlFiles, cssFiles, resolveLine, insertionsByOutputPath, preInsertionByOutputPath),
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

  // ---- §24 — evaluation, for `unify audit` and `unify dev`. ----------------
  // `unify build` and `unify watch` reach neither the call nor the branch
  // below, which is §24.7 in one line: no finding can affect a build's output,
  // its diagnostics, or its exit code. The pipeline above ran identically
  // either way — that is what makes a finding a fact about the bytes the build
  // would publish rather than about a cheaper approximation of them (§24.1).
  //
  // ONE call site, two readers: `unify audit`'s report (§24.5) and `unify
  // dev`'s local audit view (§27.3). §27.5's "not a second audit" — no finding
  // exists that only the view can raise, and none it shows is absent from
  // `unify audit` — is held here by construction rather than by two
  // implementations agreeing, which is the only way it can be held: a second
  // predicate set would agree on every simple site and diverge on the first
  // interesting one, unobserved, inside a development server.
  const findings = settings.audit || settings.onEvaluation
    ? auditManifest({
      records: manifest.records,
      byOutputPath: manifest.byOutputPath,
      base: baseConfig,
      sitemapLocs,
      exemptedSitemaps,
      // §31.3 — carried through to `lastAuditRun` for `--external`'s own use
      // (`cli/commands/audit.js`, via `consumeLastAuditRun()`); not read by
      // any finding predicate. The SAME map §12's reference check just
      // scanned — reused, not recomputed, so an off-origin URL `--external`
      // fetches and an internal one §12 already checked came from one pass
      // over one page's text.
      htmlFiles,
    })
    : null;

  if (settings.audit) {
    reporter.summary(formatFindings(findings));
    // §24.6 — a pipeline problem exits 1 regardless: evaluating output that
    // cannot be built is meaningless, and the findings printed beside it
    // describe a site that would never ship. Otherwise --strict is the gate,
    // on any finding of either severity.
    if (reporter.exitCode !== 0) return reporter.exitCode;
    return settings.strict && findings.length > 0 ? 1 : 0;
  }

  // ---- §15 — transactional publish. ----------------------------------------
  // Named rather than inlined so the §27 sink at the end of this function can
  // state whether this build reached the output directory without asking the
  // question a second way. `publish()` records no diagnostic (its own PUB-01
  // gate only declines), so the value cannot go stale between here and there.
  const published = shouldPublish(reporter) && !settings.dryRun;
  if (published) {
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
        // §33.3 — a generated row says so. It must: a file in dist/ with no
        // source file behind it is otherwise unexplainable to a reader of
        // this report, which is the one place §33's overlay is visible.
        from: p.generated
          ? (p.layoutFile ? `generated + ${p.layoutFile}` : "generated")
          : (p.layoutFile ? `${p.relPath} + ${p.layoutFile}` : `${p.relPath} (no layout)`),
      })),
      ...assetFiles.map((a) => ({
        action: "copy",
        outputPath: `${displayOutput}/${outputPathOf.get(a.relPath)}`,
        url: publishModule.urlForOutputPath(outputPathOf.get(a.relPath), prefix),
        // GEN-04 applies to every row, not only pages: a generated ASSET has no
        // source file behind it either, and naming its overlay-relative path
        // pointed the reader at something that does not exist in src/. The
        // vendoring recipe (integrations.md) makes this the common case.
        from: a.generated ? "generated" : a.relPath,
      })),
      // §21.1 — a generated artifact is a write like any other, so it carries
      // the same address the report gives every other row. `from` names what
      // produced it rather than a source file, because there is no source file.
      ...[...generated.keys()].map((outPath) => ({
        action: "write",
        outputPath: `${displayOutput}/${outPath}`,
        url: publishModule.urlForOutputPath(outPath, prefix),
        from: "generated (--base-url)",
      })),
      // §29.7 — a generated feed is a write like any other, named the same
      // way the sitemap's row above is (it too can only exist under
      // --base-url — §29.1).
      ...[...generatedFeed.keys()].map((outPath) => ({
        action: "write",
        outputPath: `${displayOutput}/${outPath}`,
        url: publishModule.urlForOutputPath(outPath, prefix),
        from: "generated (--base-url)",
      })),
      // §30.4 — likewise, named for the flag that actually produced it rather
      // than --base-url: §30.1/§30.2 activate on --search-index alone, with
      // or without a site address.
      ...[...generatedSearchIndex.keys()].map((outPath) => ({
        action: "write",
        outputPath: `${displayOutput}/${outPath}`,
        url: publishModule.urlForOutputPath(outPath, prefix),
        from: "generated (--search-index)",
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
    reporter.summary(addressLine(baseConfig));

    // §6.1 — anything that writes published output appears in --dry-run. The
    // sitemap gets a write row of its own; completion edits pages that already
    // have one, so it reports a count instead. Without it the report was
    // byte-identical with and without the flag, and a reader checking before
    // publish could not tell it had done anything.
    if (settings.canonical === "auto") {
      reporter.summary(
        `canonical completion: ${completedCount} page${completedCount === 1 ? "" : "s"} would gain a canonical link`,
      );
    }
    // §26.7 — the same accounting one section over. The gate is the count
    // rather than a flag because §26 has none: "the declaration is the whole
    // opt-in" (§26.5), so a site that declared nothing has no work to name and
    // reads exactly as it did before this section existed.
    if (generatedCount > 0) {
      reporter.summary(
        `structured data: ${generatedCount} page${generatedCount === 1 ? "" : "s"} would gain a JSON-LD block`,
      );
    }

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

  // ---- §27 — the local audit view's one source. ----------------------------
  // Set only by `unify dev`. Everything the report is allowed to show is
  // handed over here, at the end of the build that produced it: the §20
  // manifest this build derived, the §24 findings computed at the single call
  // site above, §17's own address line, and §14's diagnostics in the printed
  // order and printed form (`file` already relocated to the working
  // directory). §27.3's one-source rule is therefore a property of this call
  // rather than a discipline the report has to keep — there is nothing in the
  // payload the view could have re-read the site for, and product-spec §6.2's
  // second interpretation has nowhere to appear.
  //
  // Fired last, after publish, so what the view describes is a build that
  // finished (§27.4: never a half-assembled report). A rebuild that threw never
  // reaches this line at all, which is exactly the signal `dev.js` reads to say
  // so rather than leave a stale report looking current.
  settings.onEvaluation?.({
    records: manifest.records,
    findings,
    address: addressLine(baseConfig),
    diagnostics: reporter.sorted(),
    published,
  });

  return reporter.exitCode;
}

/**
 * §17's first line: the address the build assumed, stated once. Shared by the
 * `--dry-run` report and §27's summary line so a reader cannot be shown two
 * answers to "where does this site think it lives".
 * @param {{origin: string, pathPrefix: string}|null} baseConfig
 * @returns {string}
 */
function addressLine(baseConfig) {
  return baseConfig
    ? `serving from ${baseConfig.origin}${baseConfig.pathPrefix}`
    : "serving from / — the domain root (no --base-url)";
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
 * @param {string[]} roots - the §33.3 namespace: `file` is a VIRTUAL path, so
 *   the line of a fault inside a generated fragment is read out of the overlay
 *   copy that actually holds it, not guessed at from a source path with no file
 *   behind it.
 * @returns {(file: string, fileOffset: number) => number|undefined}
 */
function makeSourceLineResolver(roots) {
  /** @type {Map<string, string|null>} virtual path -> raw text, or null when unreadable */
  const cache = new Map();
  return (file, fileOffset) => {
    if (extname(file).toLowerCase() === ".md") return undefined;
    if (!cache.has(file)) {
      let text = null;
      try {
        text = readFileSync(locateVirtual(roots, file), "utf8");
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
function makeReferenceLocator(
  pageSpansByOutputPath, htmlFiles, cssFiles, resolveLine,
  insertionsByOutputPath = new Map(), preInsertionByOutputPath = new Map(),
) {
  return (outputFile, offset) => {
    const spans = pageSpansByOutputPath.get(outputFile);
    // §22's completion INSERTS bytes after the spans were computed, which is
    // the one thing the invariant below never allowed for: §11's rewrites only
    // ever replace attribute values in place, so a final-text offset indexed
    // the span table exactly. An insertion breaks that, and it broke it
    // silently — a broken link inside an include was attributed to a different
    // file at a line holding unrelated content, which is worse than no location
    // at all. Subtracting the insertions that precede the offset maps a
    // final-text position back to the pre-insertion text the spans describe.
    // The list is in REVERSE APPLICATION ORDER (see `insertionsByOutputPath`),
    // and that is what makes this loop total rather than merely lucky. Each
    // insertion's `at` is a position in the text IT was applied to, so §26's
    // block sits at an offset in the text §22 had already lengthened. Undoing
    // the most recent first means `offset - shift` is always expressed in the
    // space the next `at` was measured in; undoing them in application order
    // compares a §26-space position against a §22-space offset, which happens
    // to come out right only because a JSON-LD block is longer than a canonical
    // link. One insertion cannot show the difference, which is why the order
    // had to be decided the moment a second feature wrote into the same head.
    //
    // An offset that lands INSIDE an insertion has no preimage at all, and the
    // three cases have to be separated rather than lumped together: §26's
    // generated block carries references §12 checks (`url`, `image` — §26.7),
    // so a page whose `og:image` names nothing produces a P13 inside bytes no
    // source file contains. Subtracting the whole insertion for such an offset
    // walks BACKWARDS past the insertion point by however much of the block
    // preceded the reference, which on a page with a long description crossed
    // into another file entirely: one missing image reported at `_layout.html`
    // line 2, `<html lang="en">`, holding nothing of the kind. §1's provenance
    // is "the source file whose text contained the element's start tag" and a
    // generated element has none, so the position is mapped to the insertion
    // POINT — a real position in the pre-insertion text — and §14.1's rule
    // decides the rest: a line is omitted rather than guessed.
    //
    // The FILE is decided the same way and had to be, because mapping to the
    // insertion point answers the line question and then silently answers the
    // file question wrong: the insertion point is wherever `</head>` came from,
    // which for a Markdown page under a layout is the LAYOUT, and for a layout
    // that includes its head chrome is that FRAGMENT — files that contain no
    // such reference and that the author can grep to no effect. §26.7 fixes
    // the answer instead: a reference inside a generated block is located at
    // the page the block was generated for, which every insertion carries.
    const insertions = insertionsByOutputPath.get(outputFile) ?? [];
    let shift = 0;
    /** The page an insertion was generated FOR, when the offset lands inside one. */
    let generatedFile = null;
    for (const ins of insertions) {
      const local = offset - shift;
      if (local >= ins.at + ins.length) shift += ins.length;
      else if (local >= ins.at) { shift += local - ins.at; generatedFile = ins.file ?? outputFile; }
    }
    const generated = generatedFile !== null;
    const spanOffset = offset - shift;
    const hit = spans ? urls.spansToSourceLocator(spans, outputFile)(spanOffset) : null;
    // The last resort: no span covers this offset, so the OUTPUT file is its
    // own provenance. The text numbered has to be the PRE-INSERTION one, and
    // the offset the un-shifted one — §22 and §26 add whole LINES before
    // `</head>`, so numbering the final text against the raw offset moved every
    // later reference down by the height of the block and printed line 22 of a
    // 16-line file. §14.1 forbids a guessed line for being checkable and wrong;
    // an impossible one is that fault with the checking already done.
    const text = preInsertionByOutputPath.get(outputFile)
      ?? htmlFiles.get(outputFile) ?? cssFiles.get(outputFile) ?? "";
    if (!hit || hit.fileOffset === null) {
      return { file: generatedFile ?? outputFile, line: generated ? undefined : html.lineOf(text, spanOffset) };
    }
    return { file: generatedFile ?? hit.file, line: generated ? undefined : resolveLine(hit.file, hit.fileOffset) };
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
async function buildPage(page, { sourceRoot, roots, reporter, layoutCache, convertMarkdown, consumedAsIncludeOrLayout, resolveLine }) {
  const pageFile = page.relPath;

  if (extname(page.absPath) === ".md") {
    const source = readFileSync(page.absPath, "utf8");
    const md = markdown.convert(source, { path: page.absPath, sourceRoot, roots, reporter });

    // Layout selection reads the frontmatter value markdown.js already
    // parsed — resolved BEFORE assembly, because §10.7's shell (charset
    // synthesized) and the to-be-composed shape (no charset — the layout
    // supplies it) are different documents for the exact same page (see the
    // seam this task exists to close, described in CLAUDE.md/the task brief).
    const resolution = layout.resolveMarkdownLayout({
      layoutValue: md.layout, mdSource: source, pageAbsPath: page.absPath, sourceRoot, roots, file: pageFile, reporter,
    });
    if (resolution.problem) return null;

    // §10.1: includes resolve AFTER conversion, on the converted body — same
    // machinery as an HTML page, applied to `md.html` instead of raw source.
    const inlinedBody = await includes.inlineIncludes({
      // DIA-13: `md.html` is converted output, so its newline count numbers a
      // document the author never wrote — includes.js omits the line rather
      // than guessing one (the file is still exact).
      text: md.html, file: page.absPath, sourceRoot, roots, reporter, convertMarkdown, linesAreSource: false,
    });
    trackIncludedFiles(inlinedBody.spans, pageFile, consumedAsIncludeOrLayout);
    const assembled = { ...md, html: inlinedBody.text, htmlSpans: inlinedBody.spans };

    if (resolution.none) {
      const { text: pageText, spans: pageSpans } = compose.assembleMarkdownDocument(assembled, { standalone: true, pageFile });
      return { ...compose.compose({ pageText, pageFile, pageSpans, layoutText: null, resolveLine, reporter }), layoutFile: null };
    }

    const loaded = await loadLayout(resolution.path, { sourceRoot, roots, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine });
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
  markdown.checkHtmlFrontmatter(raw, { path: page.absPath, sourceRoot, roots, reporter }); // P10
  const inlined = await includes.inlineIncludes({ text: raw, file: page.absPath, sourceRoot, roots, reporter, convertMarkdown });
  trackIncludedFiles(inlined.spans, pageFile, consumedAsIncludeOrLayout);
  const { root } = html.parse(inlined.text);
  // Same `spans`/`resolveLine` pair `compose()` gets below: §6's diagnostics
  // (P07 on a misplaced data-layout, P04/P05 on a bad path) are measured in
  // the include-inlined text too, so they need the same translation back to a
  // real source line as §7's — layout.js's own DIAGNOSTIC LOCATION note.
  const resolution = layout.resolveHtmlLayout({
    root, text: inlined.text, spans: inlined.spans, resolveLine, pageAbsPath: page.absPath, sourceRoot, roots, reporter,
  });
  if (resolution.problem) return null;

  if (resolution.none) {
    return { ...compose.compose({ pageText: inlined.text, pageFile, pageSpans: inlined.spans, layoutText: null, resolveLine, reporter }), layoutFile: null };
  }

  const loaded = await loadLayout(resolution.path, { sourceRoot, roots, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine });
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
function loadLayout(absPath, { sourceRoot, roots, reporter, convertMarkdown, layoutCache, consumedAsIncludeOrLayout, resolveLine }) {
  if (layoutCache.has(absPath)) return layoutCache.get(absPath);
  const promise = (async () => {
    // §33.3 — a layout is named by its virtual path, so a generated one is
    // `docs/_layout.html` (the name its generator gave it) in every diagnostic
    // and in §17's `from` column, and the A10 bookkeeping below keys on the
    // same string the scan used.
    const file = nameOf(roots, absPath);
    consumedAsIncludeOrLayout.add(file);
    let raw;
    try {
      raw = readFileSync(absPath, "utf8");
    } catch {
      return { text: "", spans: [], file, broken: true };
    }
    const inlined = await includes.inlineIncludes({ text: raw, file: absPath, sourceRoot, roots, reporter, convertMarkdown });
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
function scanSourceTree(sourceRoot, output, excludePatterns, reporter, overlayDir = null) {
  let root = resolve(sourceRoot);
  const outputAbs = resolve(output);
  /** @type {{absPath: string, relPath: string, isPage: boolean, excluded: boolean, generated: boolean}[]} */
  const files = [];
  // §33.3 — files in the generated directory are scanned EXACTLY as source
  // files are: pages by extension, mirror copy for everything else, the
  // underscore exclusion, `.fragment.html`. Only the origin differs, and it
  // differs for one visible reason: §17 marks a generated row `← generated`,
  // because a file in dist/ with no source file behind it is otherwise
  // unexplainable to a reader of the report.
  let generated = false;

  walk(root);
  if (overlayDir !== null) {
    root = resolve(overlayDir);
    generated = true;
    walk(root);
  }
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return files;

  function pushFile(abs, rel) {
    // §4.4 — a name ending `.fragment.html` opts out of page-ness: it mirror
    // copies byte-for-byte (never composed, never rewritten, never moved by
    // --pretty-urls) so a bare HTML snippet can ship at a URL for <include>,
    // embed, or fetch. Everything downstream keys off this one classification.
    const ext = extname(rel);
    const isPage = (ext === ".html" || ext === ".md") && !rel.endsWith(".fragment.html");
    files.push({ absPath: abs, relPath: rel, isPage, excluded: isExcluded(rel, excludePatterns), generated });
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
