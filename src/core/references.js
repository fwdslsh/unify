/**
 * references.js — conformance-spec §12 (the post-build reference check).
 *
 * Runs against the COMPLETED temporary output tree (§2 step 8, after §11
 * rewriting and §13 path computation) — content in, diagnostics out; no
 * filesystem access here, so the caller (the wiring pass) reads the temp
 * tree into memory once and passes it in as plain text maps. Checking is
 * broader than rewriting on purpose (§12's own text: "rewriting deliberately
 * never reaches these — §11.1 — but checking is not rewriting"): `url()` in
 * CSS files, `<style>` blocks, and `style` attributes are all in scope here
 * even though §11 never touches them.
 *
 * Resolution here is deliberately NOT provenance-based (contrast urls.js):
 * §12 resolves a relative reference "against the containing output file's
 * URL" — i.e. against the location of the file the reference-check is
 * currently reading, which this module always knows on its own (it is
 * iterating that file's own text). What §12 needs help with, and cannot
 * derive from the output tree alone, is DIAGNOSTIC ATTRIBUTION: §14.1's R3
 * rule locates a reference problem at the reference's true PROVENANCE file
 * (a page, layout, or include — see `stranded-underscore-asset`'s pinned
 * location `src/_includes/nav.html:2`, not the composed page's own path).
 * That is the identical need urls.js documents at length (its "PROVENANCE"
 * note) applied to attribution instead of rewriting. `checkReferences`
 * takes an optional `locate` callback for this reason; its default
 * attributes every diagnostic to the OUTPUT file itself, which is correct
 * for page-authored content and imprecise for anything inherited from a
 * layout or include — `src/cli/commands/build.js` supplies a real one, built
 * from `includes.js`/`compose.js`'s own spans, whenever it has one.
 *
 * One nuance the real `locate` in build.js has to account for that this
 * module intentionally stays ignorant of: `collectHtmlReferences` below
 * reads offsets from the FINAL, already-§11-rewritten output text, while a
 * page's provenance spans are computed against the PRE-rewrite composed
 * text — §11's rewrites only ever change attribute VALUE bytes, never
 * insert or remove a byte before an unrewritten attribute, so this is exact
 * whenever no EARLIER same-file URL rewrite in the same attribute changed
 * length; see build.js's own comment on its `locate` for the honest
 * accounting of where that stops being exact and why every fixture this
 * module is checked against still resolves correctly.
 *
 * `unbuiltPagePaths` is the second thing this module cannot derive from the
 * output tree and so takes from the caller. An absence in `emittedPaths` has
 * two causes that look identical from here — the target was never a source
 * file (§12's real subject) or the target IS a source page that failed to
 * compose and therefore emitted nothing. Only the caller ran composition, so
 * only the caller knows which. See `isCascade` for why the second is silent.
 */
import { posix } from "node:path";
import { findAll, getAttr, getAttrNode, isElement, lineOf, parse } from "./html.js";
import { decodeEntities } from "./entities.js";
import { decodePathSegments, isSkippedUrl, isUrlValuedMeta, splitUrl } from "./urls.js";
import { CHECK_SPELLING } from "./diagnostics.js";

// ------------------------------------------------------------- CSS url()

/** `url(...)`, matching bare/`"..."`/`'...'` forms, capturing whichever fired. */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s][^)]*?))\s*\)/gi;

/**
 * Every `url(...)` reference in a CSS text (a `.css` file's full content, a
 * `<style>` block's text, or a `style="…"` attribute's value), with byte
 * offsets relative to `text` itself (the caller adds `baseOffset` when
 * `text` is a substring of a larger document).
 * @param {string} text
 * @param {number} baseOffset
 * @returns {{raw:string, offset:number}[]}
 */
function findCssUrls(text, baseOffset) {
  const out = [];
  for (const m of text.matchAll(CSS_URL_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    // Locate the captured group's own offset within the full match text.
    const withinMatch = m[0].indexOf(raw, m[0].indexOf("url"));
    out.push({ raw, offset: baseOffset + m.index + Math.max(withinMatch, 0) });
  }
  return out;
}

// --------------------------------------------------------- HTML collection

function isOgOrTwitterMeta(el) {
  const property = getAttr(el, "property");
  if (property && /^og:/i.test(property)) return true;
  const name = getAttr(el, "name");
  return Boolean(name && /^twitter:/i.test(name));
}


/**
 * Every checkable reference in one emitted HTML file's text: href/src/poster
 * (any element, any `<link>` rel — REF-01), srcset candidates, root-relative
 * og:/twitter: meta content, `<style>` block url(), and `style=` attribute
 * url() (B5). Byte offsets are relative to `text`.
 * @param {string} text
 * @returns {{raw:string, offset:number}[]}
 */
function collectHtmlReferences(text) {
  const { root } = parse(text);
  const refs = [];
  for (const el of findAll(root, (n) => n.type === "element")) {
    for (const attrName of ["href", "src", "poster"]) {
      const attr = getAttrNode(el, attrName);
      if (attr && attr.value) refs.push({ raw: attr.value, offset: attr.valueStart });
    }
    const srcset = getAttrNode(el, "srcset");
    if (srcset && srcset.value) {
      for (const m of srcset.value.matchAll(/(^|,)(\s*)([^\s,]+)/g)) {
        const urlStart = srcset.valueStart + m.index + m[1].length + m[2].length;
        refs.push({ raw: m[3], offset: urlStart });
      }
    }
    if (isElement(el, "meta") && isUrlValuedMeta(el)) {
      const content = getAttrNode(el, "content");
      // Root-relative values are §12's stated scope; absolute URLs are
      // collected too so REF-02's base-stripping can classify them — §11.3
      // absolutizes og:/twitter: values under --base-url, and §12 says those
      // "stay checkable instead of masquerading as external". (Collecting
      // only "/"-prefixed values made that sentence dead code: a broken
      // og:image under a base URL was never checked at all.) Non-URL content
      // (og:site_name "Meridian Coffee", twitter:card "summary") stays out
      // of scope.
      const v = content?.value ?? "";
      if (v !== "") refs.push({ raw: v, offset: content.valueStart });
    }
    if (isElement(el, "style")) {
      for (const child of el.children) {
        if (child.type === "text") refs.push(...findCssUrls(child.data, child.start));
      }
    }
    const styleAttr = getAttrNode(el, "style");
    if (styleAttr && styleAttr.value) refs.push(...findCssUrls(styleAttr.value, styleAttr.valueStart));
  }
  return refs;
}

// -------------------------------------------------------------- resolution

/**
 * Strip the `--base-url` prefix from a URL so a value §11.3 absolutized
 * stays checkable instead of masquerading as external (REF-02). Tries the
 * whole base (origin + path) first, which is what og:/twitter:/canonical
 * values carry, then the path prefix alone, which is what href/src carry. A
 * value matching neither is returned unchanged — it will be classified as
 * root-relative/relative/external normally by the caller.
 * @param {string} url
 * @param {import('./urls.js').BaseUrlConfig} base
 * @returns {string}
 */
export function stripBaseUrl(url, base) {
  // An absolute or protocol-relative URL is PARSED, never string-matched.
  //
  // Byte comparison against `base.origin` was wrong three ways at once, and
  // each way blocked the publish of a legal site:
  //
  //   - **No authority boundary.** Any host whose name merely begins with the
  //     base origin read as an internal path, so a site at `example.com` could
  //     not link to `example.community`, `example.company`, or an attacker's
  //     `example.com.evil.test` — each became a P13 quoting a fragment of the
  //     HOST (`.evil.test/x.css`) as a path the author had mistyped.
  //   - **No host equivalence.** `https://EXAMPLE.com:443/about.html` is the
  //     same URL by RFC 3986 §6.2.2.1 and §6.2.3, and raised a P13 quoting
  //     `:443/about.html`, a string in no file.
  //   - **Two encoding spaces.** `parseBaseUrl` stores `pathPrefix` as
  //     `new URL().pathname` gives it — percent-encoded — while the authored
  //     value carries whatever the author typed. Deploying under
  //     `--base-url https://example.com/café/` therefore failed to strip its
  //     own prefix and reported every page of an ordinary two-page site.
  //
  // `URL.pathname` answers all three: it normalizes the host, applies the
  // default-port and case rules, and returns the path in the same encoding
  // `pathPrefix` was stored in, so the two are comparable by construction.
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(url)) {
    let u;
    try {
      u = new URL(url, base.origin);
    } catch {
      return url; // not a URL this build can reason about — treat it as written
    }
    if (u.host !== new URL(base.origin).host) return url; // another site
    const rest = u.pathname + u.search + u.hash;
    if (rest.startsWith(base.pathPrefix)) return `/${rest.slice(base.pathPrefix.length)}`;
    return rest || "/";
  }
  if (base.pathPrefix !== "/" && url.startsWith(base.pathPrefix)) {
    return `/${url.slice(base.pathPrefix.length)}`;
  }
  return url;
}

/**
 * Resolve one reference to the output path it names, per §12's own
 * resolution rule (relative to the CONTAINING OUTPUT FILE, never
 * provenance): root-relative URLs resolve from the tree root; relative ones
 * resolve against `dirname(containingOutputPath)`; a directory URL (empty
 * path or trailing `/`) resolves to `index.html` within it (REF-03).
 *
 * A relative reference that climbs ABOVE the tree root (`../../etc/passwd`
 * from a root-level file) is deliberately NOT special-cased to `null` here:
 * §12 exempts exactly one closed list from checking (external/mailto/tel/
 * data/fragment-only — `isSkippedUrl`), and an escaping relative path is
 * none of those — it is a malformed INTERNAL reference, exactly the kind
 * "fails here, loudly" exists for. Leaving the `..`-prefixed string intact
 * and letting the caller's `emittedPaths.has(...)` check fail naturally
 * (no real output path ever starts with `..`) is both simpler and correct;
 * a `null` return here is reserved for "not internal at all", never for
 * "internal but broken".
 * @param {string} url - already base-url-stripped
 * @param {string} containingOutputPath
 * @returns {string|null} an output path with no leading "/" (never found in
 *   `emittedPaths` when it escapes the tree, which is exactly the point —
 *   see above), or null only when the URL is out of scope entirely
 */
export function resolveReference(url, containingOutputPath) {
  if (isSkippedUrl(url)) return null;
  const { path: rawPath } = splitUrl(url); // query/fragment never participate (REF-06 for fragments)
  if (rawPath === "") return null;
  // Percent-decoded before matching (REF-08). §20.5 makes `/two%20words.html`
  // the URL the site publishes for `two words.html` — in the sitemap, in the
  // dry-run report, everywhere — so a link written that way must resolve, or
  // the build advertises an address it refuses to let the author use. Decoding
  // is per segment, so `%2F` becomes a literal slash inside one name rather
  // than a new path separator, and matches nothing. Both spellings name the
  // same file and both resolve; neither is rewritten.
  const path = decodePathSegments(rawPath);
  let resolved = path.startsWith("/")
    ? posix.normalize(path).replace(/^\/+/, "")
    : posix.normalize(posix.join(posix.dirname(containingOutputPath), path));
  if (resolved === ".") resolved = "";
  if (resolved === "" || resolved.endsWith("/")) resolved = posix.join(resolved, "index.html");
  return resolved;
}

// ------------------------------------------------------------------- check

/**
 * @typedef {(outputFile: string, offset: number) => {file: string, line?: number}} Locate
 *   Maps a byte offset within an emitted output file's text back to its true
 *   authoring source for diagnostic attribution (§14.1 R3). See the
 *   module-level docs. Defaults to attributing to the output file itself.
 */

/**
 * §12 — the post-build reference check.
 *
 * @param {object} args
 * @param {Map<string,string>} args.htmlFiles - emitted HTML output path
 *   (source-root-relative, posix, no leading "/") -> full text
 * @param {Map<string,string>} args.cssFiles - emitted CSS output path -> full text
 * @param {Set<string>} args.emittedPaths - every emitted output path,
 *   HTML/CSS/every other asset alike (superset of htmlFiles/cssFiles keys) —
 *   membership is what "resolves to an emitted file" means (REF-04)
 * @param {Set<string>} [args.unbuiltPagePaths] - the output paths that pages
 *   which EXIST IN SOURCE but failed to compose would have occupied. Empty
 *   (the default) means "every absence is a real absence", which is what a
 *   caller with no composition failures to report should pass. See
 *   `isCascade` for why these are not reported.
 * @param {import('./urls.js').BaseUrlConfig|null} [args.base] - the
 *   `--base-url` config, or null/omitted when not set
 * @param {Locate} [args.locate]
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {void} reports P13 problems via `reporter`
 */
export function checkReferences({ htmlFiles, cssFiles, emittedPaths, unbuiltPagePaths = new Set(), base = null, locate, reporter }) {
  const resolveLocate = locate ?? defaultLocate(htmlFiles, cssFiles);
  const ctx = { base, emittedPaths, unbuiltPagePaths, reporter, locate: resolveLocate };

  for (const [outputPath, text] of htmlFiles) {
    for (const ref of collectHtmlReferences(text)) checkOne(ref, outputPath, ctx);
  }
  for (const [outputPath, text] of cssFiles) {
    for (const ref of findCssUrls(text, 0)) checkOne(ref, outputPath, ctx);
  }
}

/**
 * §12's one exemption that is NOT about the URL's form: a reference whose
 * target is a source page that exists and simply failed to compose.
 *
 * That page emitted no file, so every link to it fails `emittedPaths` — and
 * the failure is reported at the LINK's provenance (§14.1 R3), which for site
 * chrome is a shared fragment, with `fix: check the path spelling and casing`.
 * All three halves of that are wrong: the path is spelled correctly, the
 * fragment is not where the fault is, and the page the author must actually
 * open is named only by its OWN diagnostic — which, since diagnostics are
 * path-ordered, may print far below. Measured on a 40-page fixture with one
 * page failing to compose: 40 problems printed, 1 of them real, and the real
 * one printed last, behind 39 identical false ones. Deduplication alone would
 * not fix this; it would leave one confidently wrong line instead of forty.
 *
 * Nothing is lost by staying quiet. The target page reported its own problem,
 * that problem already blocks the publish (§15 — one problem anywhere and the
 * previous output is untouched), and when the author fixes it this reference
 * resolves with no further edit. A cascade diagnostic can only ever describe
 * a consequence of a fault that is already on screen.
 *
 * The two absences that are NOT this, and that must keep failing loudly,
 * because they are what §12 exists for: a target with no source file at all
 * (the renamed page, the typo), and a target whose source file exists but is
 * EXCLUDED — §12 names that one itself, "an asset stranded in an underscore
 * folder". Neither is in this set: the caller builds it from pages it
 * actually attempted to compose and failed on.
 * @param {string} resolved
 * @param {Set<string>} unbuiltPagePaths
 * @returns {boolean}
 */
function isCascade(resolved, unbuiltPagePaths) {
  return unbuiltPagePaths.has(resolved);
}

function checkOne({ raw, offset }, containingOutputPath, { base, emittedPaths, unbuiltPagePaths, reporter, locate }) {
  // An attribute's VALUE is its bytes with character references resolved —
  // `href="/a&amp;b.html"` is the correct HTML spelling for a file named
  // `a&b.html`, and a browser fetches the decoded form. §12 read the bytes, so
  // a page written correctly failed to publish with a diagnostic quoting a
  // spelling that was right. Present since v0.7.0 and reproduced there; reached
  // in a new way by §22, whose synthesized href must be escaped for exactly the
  // same reason. Decoding on read and escaping on write are one rule.
  const value = decodeEntities(raw);
  const stripped = base ? stripBaseUrl(value, base) : value;
  const resolved = resolveReference(stripped, containingOutputPath);
  if (resolved === null) return; // out of scope: external/mailto/tel/data/fragment-only/escaping
  if (emittedPaths.has(resolved)) return; // REF-05: exact, case-sensitive membership
  if (isCascade(resolved, unbuiltPagePaths)) return;

  const { file, line } = locate(containingOutputPath, offset);
  // §14.1: the `in:` continuation is the offending SOURCE text. `raw` is the
  // output form — under --base-url, §11.3 has already prefixed it, and the
  // author's file contains no such string (a round-8-style repair agent was
  // told to "check the spelling" of a path it could not find anywhere).
  // `stripped` is the pre-§11.3 value: byte-identical to the source for the
  // root-relative URLs §11.3 touches, and identical to `raw` for everything
  // else.
  reporter.problem({
    file,
    line,
    message: `${stripped} does not resolve to any emitted file`,
    context: stripped,
    fixes: [CHECK_SPELLING],
    // The reporter deduplicates byte-identical diagnostics (diagnostics.js's
    // own `_record` doc): one broken href in a fragment included into forty
    // pages is one fault located at one line of one file, and printing it
    // forty times told the author nothing extra. But the printed form quotes
    // the SOURCE spelling, and §12 resolves a relative reference against the
    // containing OUTPUT file — so one relative URL in shared chrome can be
    // two genuinely different faults with identical text. §11.1 rewrites
    // href/src/srcset/poster out of that situation (provenance-relative
    // becomes root-relative); it deliberately never touches `url()` in
    // <style>/style= (URL-03), which this module checks anyway, so the case
    // is live there. `resolved` is exactly what distinguishes them.
    discriminator: resolved,
  });
}

/**
 * Default `locate`: attribute every diagnostic to the output file itself, at
 * that file's own line. Correct for page-authored content; see the
 * module-level docs for why this is an approximation for inherited content.
 * @param {Map<string,string>} htmlFiles
 * @param {Map<string,string>} cssFiles
 * @returns {Locate}
 */
function defaultLocate(htmlFiles, cssFiles) {
  return (file, offset) => {
    const text = htmlFiles.get(file) ?? cssFiles.get(file) ?? "";
    return { file, line: lineOf(text, offset) };
  };
}
