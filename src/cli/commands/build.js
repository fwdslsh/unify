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
 * One correction applied here rather than in diagnostics.js (out of scope
 * — see `shouldPublish` below): the publish gate uses `reporter.exitCode`,
 * not `reporter.canPublish`, because `canPublish` does not account for
 * `--strict` turning an advisory into a publish-blocking condition (§14.1:
 * "1 problems found (or advisories under `--strict`) ... nothing
 * published"), which the kitchen-sink `strict` profile fixture pins
 * (`published: false` with zero problems, one advisory, `--strict`) — see
 * the implementation report.
 *
 * Known, documented limitation inherited from urls.js/references.js: true
 * per-byte provenance (which file — page, layout, or include — authored a
 * given composed element) is lost once includes.js/compose.js splice text
 * together; neither of those modules returns span/file metadata, and
 * fixing that is out of scope for all of the modules involved here (see
 * urls.js's own "PROVENANCE GAP" comment). This file supplies the
 * same-file approximation both modules' docs recommend as the fallback
 * (`provenanceOf`/`locate` default to the composed page's own file) — exact
 * for page-authored content, imprecise for anything a layout or include
 * contributed. That imprecision is pre-existing and not something this
 * file's scope (§6 layout resolution + orchestration) can close.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import * as collisions from "../../core/collisions.js";
import * as compose from "../../core/compose.js";
import * as html from "../../core/html.js";
import * as includes from "../../core/includes.js";
import * as layout from "../../core/layout.js";
import * as markdown from "../../core/markdown.js";
import { isNeverShipped, toRelative } from "../../core/paths.js";
import * as publishModule from "../../core/publish.js";
import * as references from "../../core/references.js";
import * as urls from "../../core/urls.js";

/**
 * @param {object} context
 * @param {string} context.sourceRoot
 * @param {string} context.output
 * @param {Record<string, any>} context.settings
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @returns {Promise<number>}
 */
export async function build({ sourceRoot, output, settings, reporter }) {
  const files = scanSourceTree(sourceRoot, output, settings.exclude);

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

  const layoutCache = new Map(); // absolute layout path -> Promise<{text, file, broken}>
  const convertMarkdown = (absPath) => markdown.convertFragment(absPath, { sourceRoot, reporter });

  // ---- Pass 1: compose every non-excluded page, entirely in memory. -------
  const pageFiles = files.filter((f) => f.isPage && !f.excluded);
  const assetFiles = files.filter((f) => !f.isPage && !f.excluded);

  /** @type {{relPath: string, html: string}[]} */
  const composedPages = [];
  for (const page of pageFiles) {
    const problemsBefore = reporter.problemCount;
    try {
      const composedHtml = await buildPage(page, { sourceRoot, reporter, layoutCache, convertMarkdown });
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
      const hadNewProblem = reporter.problemCount > problemsBefore;
      if (composedHtml !== null && !hadNewProblem) composedPages.push({ relPath: page.relPath, html: composedHtml });
    } catch (err) {
      // Best-effort composition (PIP-02): one page's failure must not stop
      // analysis of the others. This is a defensive net for the unexpected
      // (a genuine crash is not itself a closed-catalogue diagnostic); every
      // *known* failure mode above already reports its own problem/advisory
      // and returns null instead of throwing.
      reporter.problem({ file: page.relPath, message: `internal error building this page: ${err.message}` });
    }
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
  for (const p of composedPages) {
    const pageOutputPath = collisions.computeOutputPath({ path: p.relPath, kind: "page" }, { prettyUrls: false });
    const rewritten = urls.rewriteUrls(p.html, {
      provenanceOf: () => p.relPath, // same-file approximation — see module docstring
      pageFile: p.relPath,
      pageOutputPath,
      prettyUrls: settings.prettyUrls,
      emittedHtmlPaths,
      base: baseConfig,
    });
    tempFiles.set(outputPathOf.get(p.relPath), rewritten);
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
  });

  relocateDiagnosticsToCwd(reporter, sourceRoot);
  reporter.flush();

  // ---- §15 — transactional publish. ----------------------------------------
  if (shouldPublish(reporter) && !settings.dryRun) {
    if (settings.clean) await publishModule.performClean({ output, source: sourceRoot });
    await publishModule.publish({ tempFiles, outputDir: output, reporter });
  }
  // SEAM (§17, the --dry-run report / build summary): publish.js's own
  // `formatDryRunReport` is ready to use; not wired in here because doing so
  // needs per-page "inputs" tracking (DRY-02: "the source page and the
  // layout it resolved to") this function does not currently retain past
  // `buildPage`'s return, and no fixture in this module's scope asserts
  // stdout content for `build`.

  return reporter.exitCode;
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
  return reporter.exitCode === 0;
}

// ------------------------------------------------------------- per-page build

/**
 * Run one page through §2 steps 2-4: includes → (Markdown conversion, for
 * `.md`) → layout resolution → composition. Returns the composed HTML text,
 * or `null` when the page has a problem of its own (already reported) —
 * best-effort composition continues with the next page regardless (the
 * caller's loop, not this function).
 * @returns {Promise<string|null>}
 */
async function buildPage(page, { sourceRoot, reporter, layoutCache, convertMarkdown }) {
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
      text: md.html, file: page.absPath, sourceRoot, reporter, convertMarkdown,
    });
    const assembled = { ...md, html: inlinedBody };

    if (resolution.none) {
      const pageText = compose.assembleMarkdownDocument(assembled, { standalone: true });
      return compose.compose({ pageText, pageFile, layoutText: null, reporter });
    }

    const loaded = await loadLayout(resolution.path, { sourceRoot, reporter, convertMarkdown, layoutCache });
    if (loaded.broken) return null; // P15 already reported once for the layout itself
    const pageText = compose.assembleMarkdownDocument(assembled, { standalone: false });
    return compose.compose({ pageText, pageFile, layoutText: loaded.text, layoutFile: loaded.file, reporter });
  }

  // .html
  const raw = readFileSync(page.absPath, "utf8");
  markdown.checkHtmlFrontmatter(raw, { path: page.absPath, sourceRoot, reporter }); // P10
  const inlined = await includes.inlineIncludes({ text: raw, file: page.absPath, sourceRoot, reporter, convertMarkdown });
  const { root } = html.parse(inlined);
  const resolution = layout.resolveHtmlLayout({ root, text: inlined, pageAbsPath: page.absPath, sourceRoot, reporter });
  if (resolution.problem) return null;

  if (resolution.none) {
    return compose.compose({ pageText: inlined, pageFile, layoutText: null, reporter });
  }

  const loaded = await loadLayout(resolution.path, { sourceRoot, reporter, convertMarkdown, layoutCache });
  if (loaded.broken) return null;
  return compose.compose({ pageText: inlined, pageFile, layoutText: loaded.text, layoutFile: loaded.file, reporter });
}

/**
 * Load and prepare a layout file: inline its own includes (§2 step 2 — every
 * layout, not only pages), then check it for P15 (declares its own
 * `data-layout` — chaining is not supported) and P07 (misplaced
 * `data-layout` elsewhere in the document). Cached by absolute path so a
 * layout shared by many pages is read/checked once and any P15 it carries is
 * reported exactly once (§14.1 exhaustiveness — a diagnostic repeated once
 * per referencing page would not match a fixture's declared count).
 */
function loadLayout(absPath, { sourceRoot, reporter, convertMarkdown, layoutCache }) {
  if (layoutCache.has(absPath)) return layoutCache.get(absPath);
  const promise = (async () => {
    const file = toRelative(sourceRoot, absPath);
    let raw;
    try {
      raw = readFileSync(absPath, "utf8");
    } catch {
      return { text: "", file, broken: true };
    }
    const inlined = await includes.inlineIncludes({ text: raw, file: absPath, sourceRoot, reporter, convertMarkdown });
    const { root } = html.parse(inlined);
    const { broken } = layout.checkLayoutDocument({ root, text: inlined, file, reporter });
    return { text: inlined, file, broken };
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
 * @returns {{absPath: string, relPath: string, isPage: boolean, excluded: boolean}[]} sorted by relPath (determinism, DIA-05)
 */
function scanSourceTree(sourceRoot, output, excludePatterns) {
  const root = resolve(sourceRoot);
  const outputAbs = resolve(output);
  /** @type {{absPath: string, relPath: string, isPage: boolean, excluded: boolean}[]} */
  const files = [];

  walk(root);
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return files;

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

      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue; // symlink-outside-root handling (A12/EXC-10) is not this module's scope

      const isPage = extname(entry.name) === ".html" || extname(entry.name) === ".md";
      files.push({ absPath: abs, relPath: rel, isPage, excluded: isExcluded(rel, excludePatterns) });
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
