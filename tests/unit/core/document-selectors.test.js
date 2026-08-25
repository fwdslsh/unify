/**
 * Unit tests for src/core/document-selectors.js — the shared interpretation
 * layer over a `{document, analysis}` envelope (Tier 3; testing-strategy §2
 * gives these no conformance authority of their own — the conformance
 * spec's own rewrite of §20 lands with the model-swap batch).
 *
 * Every expectation below is written against the batch contract
 * (`_notes/batches/b2-contract.md`): the relocated value-level cores port
 * `manifest.js`/`sitemap.js`'s exact semantics, and the new doc-level
 * selectors follow the contract's per-selector rules (first-wins, trimming,
 * document order, og-over-twitter as spellings, etc).
 */
import { describe, expect, test } from "bun:test";
import { extractDocument } from "../../../src/core/document.js";
import {
  authorOf,
  canonicalOf,
  classifyCanonicalValue,
  declaredType,
  declaredTypes,
  descriptionOf,
  intOrNull,
  isoDate,
  isPublicDestination,
  langOf,
  linksWithRel,
  metadataConflicts,
  metaValues,
  parseRobotsValue,
  preferredImageOf,
  propertyValues,
  publicationDatesOf,
  refreshOf,
  robotsPolicyOf,
  titleOf,
} from "../../../src/core/document-selectors.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/** Wrap a head/body fragment in the smallest complete emitted document. */
const doc = (head = "", body = "", htmlAttrs = "") =>
  `<!doctype html>\n<html${htmlAttrs ? ` ${htmlAttrs}` : ""}>\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

/** Build the `{document, analysis, outputPath}` envelope every selector takes. */
function envelope(html, { outputPath = "p.html", path = null, url = null } = {}) {
  const { document, analysis } = extractDocument(html, { path, url });
  return { document, analysis, outputPath };
}

// ================================================================
// Headless / malformed documents — no <head>, no <html>, empty input,
// metadata nested in <template>. `extractDocument` reads the whole tree as
// head when there is no <head> element (§20's headless reading); selectors
// see whatever `extractDocument` hands them, so this pins the reading at
// this layer before consumers migrate onto it.
// ================================================================

describe("selectors over headless/malformed input", () => {
  test("no <head> element: the whole document is read as head", () => {
    const e = envelope('<html><body><title>NoHead</title><meta name="description" content="d"></body></html>');
    expect(titleOf(e)).toBe("NoHead");
    expect(descriptionOf(e)).toBe("d");
  });

  test("no <html> element: a bare <head>/<title> is still read", () => {
    const e = envelope('<head><title>NoHtml</title></head><body></body>');
    expect(titleOf(e)).toBe("NoHtml");
  });

  test("empty string input: every selector answers its empty case, no throw", () => {
    const e = envelope("");
    expect(titleOf(e)).toBeNull();
    expect(descriptionOf(e)).toBeNull();
    expect(canonicalOf(e)).toBeNull();
    expect(robotsPolicyOf(e)).toEqual({ raw: null, directives: [], indexable: true, followable: true });
  });

  test("a <link rel=canonical> nested inside <template> is never touched", () => {
    const e = envelope(
      "<!doctype html><html><head><title>t</title>"
        + '<template><link rel="canonical" href="/nope"></template>'
        + "</head><body></body></html>",
    );
    expect(canonicalOf(e)).toBeNull();
  });
});

// ================================================================
// titleOf / langOf / descriptionOf / authorOf
// ================================================================

describe("titleOf", () => {
  test("delegates to document.head.title", () => {
    const e = envelope(doc("<title>Hello</title>"));
    expect(titleOf(e)).toBe("Hello");
  });

  test("null when no title", () => {
    expect(titleOf(envelope(doc()))).toBeNull();
  });
});

describe("langOf", () => {
  test("trims a declared lang", () => {
    const e = envelope(doc("", "", 'lang="  fr  "'));
    expect(langOf(e)).toBe("fr");
  });

  test("empty lang attribute is null", () => {
    const e = envelope(doc("", "", 'lang=""'));
    expect(langOf(e)).toBeNull();
  });

  test("whitespace-only lang attribute is null", () => {
    const e = envelope(doc("", "", 'lang="   "'));
    expect(langOf(e)).toBeNull();
  });

  test("absent lang attribute is null", () => {
    expect(langOf(envelope(doc()))).toBeNull();
  });
});

describe("descriptionOf / authorOf", () => {
  test("an empty declaration is skipped in favor of the next non-empty one, trimmed", () => {
    const e = envelope(
      doc('<meta name="description" content="   "><meta name="description" content="  Real one  ">'),
    );
    expect(descriptionOf(e)).toBe("Real one");
  });

  test("first-wins between two differing non-empty declarations", () => {
    const e = envelope(
      doc('<meta name="description" content="First one"><meta name="description" content="Second one">'),
    );
    expect(descriptionOf(e)).toBe("First one");
  });

  test("no description meta: null", () => {
    expect(descriptionOf(envelope(doc()))).toBeNull();
  });

  test("an empty author declaration is skipped in favor of the next non-empty one, trimmed", () => {
    const e = envelope(doc('<meta name="author" content="">  <meta name="author" content=" Ada ">'));
    expect(authorOf(e)).toBe("Ada");
  });

  test("first-wins between two differing non-empty authors", () => {
    const e = envelope(doc('<meta name="author" content="Ada"><meta name="author" content="Bob">'));
    expect(authorOf(e)).toBe("Ada");
  });

  test("no author meta: null", () => {
    expect(authorOf(envelope(doc()))).toBeNull();
  });
});

// ================================================================
// metaValues / propertyValues / linksWithRel
// ================================================================

describe("metaValues", () => {
  test("case-insensitive name match, order preserved, no filtering of empties", () => {
    const e = envelope(
      doc('<meta NAME="Keywords" content="a"><meta name="keywords" content=""><meta name="keywords" content="b">'),
    );
    expect(metaValues(e, "KEYWORDS")).toEqual(["a", "", "b"]);
  });

  test("entry without a content attribute contributes empty string", () => {
    const e = envelope(doc('<meta name="x">'));
    expect(metaValues(e, "x")).toEqual([""]);
  });

  test("no match: empty array", () => {
    expect(metaValues(envelope(doc()), "nope")).toEqual([]);
  });

  test("a leading/trailing-whitespace name attribute is still matched, trimmed", () => {
    const e = envelope(doc('<meta name="  Description  " content="hi">'));
    expect(metaValues(e, "description")).toEqual(["hi"]);
  });
});

describe("propertyValues", () => {
  test("case-insensitive property match, order preserved", () => {
    const e = envelope(doc('<meta property="OG:Title" content="A"><meta property="og:title" content="B">'));
    expect(propertyValues(e, "og:title")).toEqual(["A", "B"]);
  });

  test("name= and property= are distinct axes", () => {
    const e = envelope(doc('<meta name="og:title" content="wrong-axis">'));
    expect(propertyValues(e, "og:title")).toEqual([]);
  });
});

describe("linksWithRel", () => {
  test("case-insensitive rel match against a whitespace-split token list", () => {
    const e = envelope(doc('<link rel="Alternate Canonical" href="/a"><link rel="stylesheet" href="/s.css">'));
    const found = linksWithRel(e, "canonical");
    expect(found).toHaveLength(1);
    expect(found[0].href).toBe("/a");
  });

  test("a rel token that merely contains the target as a substring does not match", () => {
    const e = envelope(doc('<link rel="canonicalized" href="/a">'));
    expect(linksWithRel(e, "canonical")).toEqual([]);
  });

  test("a leading/trailing-whitespace rel value is still matched, trimmed then split", () => {
    const e = envelope(doc('<link rel="  canonical alternate  " href="/a">'));
    const found = linksWithRel(e, "canonical");
    expect(found).toHaveLength(1);
    expect(found[0].href).toBe("/a");
  });

  test("order preserved across repeats", () => {
    const e = envelope(doc('<link rel="canonical" href="/first"><link rel="canonical" href="/second">'));
    expect(linksWithRel(e, "canonical").map((l) => l.href)).toEqual(["/first", "/second"]);
  });

  test("no match: empty array", () => {
    expect(linksWithRel(envelope(doc()), "canonical")).toEqual([]);
  });
});

// ================================================================
// canonicalOf
// ================================================================

describe("canonicalOf", () => {
  test("an empty href is skipped in favor of the next non-empty one, trimmed", () => {
    const e = envelope(
      doc('<link rel="canonical" href="   "><link rel="canonical" href="  /real.html  ">'),
    );
    expect(canonicalOf(e)).toBe("/real.html");
  });

  test("first-wins between two differing non-empty canonicals", () => {
    const e = envelope(doc('<link rel="canonical" href="/a"><link rel="canonical" href="/b">'));
    expect(canonicalOf(e)).toBe("/a");
  });

  test("no canonical link: null", () => {
    expect(canonicalOf(envelope(doc()))).toBeNull();
  });

  test("a stray canonical outside head does not count", () => {
    const e = envelope(doc("", '<link rel="canonical" href="/c">'));
    expect(canonicalOf(e)).toBeNull();
  });
});

// ================================================================
// robotsPolicyOf
// ================================================================

describe("robotsPolicyOf", () => {
  test("no robots meta: indexable/followable default true, raw null", () => {
    const policy = robotsPolicyOf(envelope(doc()));
    expect(policy).toEqual({ raw: null, directives: [], indexable: true, followable: true });
  });

  test("noindex + nofollow split across two metas unions into one policy", () => {
    const e = envelope(
      doc('<meta name="robots" content="noindex"><meta name="robots" content="nofollow">'),
    );
    const policy = robotsPolicyOf(e);
    expect(policy.raw).toBe("noindex, nofollow");
    expect(policy.directives).toEqual(["noindex", "nofollow"]);
    expect(policy.indexable).toBe(false);
    expect(policy.followable).toBe(false);
  });

  test('"none" makes both indexable and followable false', () => {
    const e = envelope(doc('<meta name="robots" content="none">'));
    const policy = robotsPolicyOf(e);
    expect(policy.indexable).toBe(false);
    expect(policy.followable).toBe(false);
  });

  test("unknown directives are preserved verbatim in directives/raw, don't affect the booleans", () => {
    const e = envelope(doc('<meta name="robots" content="max-snippet:-1, noarchive">'));
    const policy = robotsPolicyOf(e);
    expect(policy.directives).toEqual(["max-snippet:-1", "noarchive"]);
    expect(policy.indexable).toBe(true);
    expect(policy.followable).toBe(true);
  });

  test("empty/whitespace-only robots metas contribute nothing to the union", () => {
    const e = envelope(doc('<meta name="robots" content="   "><meta name="robots" content="noindex">'));
    expect(robotsPolicyOf(e).raw).toBe("noindex");
  });
});

// ================================================================
// metadataConflicts
// ================================================================

describe("metadataConflicts", () => {
  test("multiple differing canonicals: first-wins, conflict recorded", () => {
    const e = envelope(
      doc('<link rel="canonical" href="/a"><link rel="canonical" href="/b">'),
    );
    expect(metadataConflicts(e)).toEqual([{ field: "canonical", kept: "/a", discarded: ["/b"] }]);
  });

  test("identical repeated canonicals are not a conflict", () => {
    const e = envelope(
      doc('<link rel="canonical" href="/a"><link rel="canonical" href="/a">'),
    );
    expect(metadataConflicts(e)).toEqual([]);
  });

  test("a single canonical is not a conflict", () => {
    const e = envelope(doc('<link rel="canonical" href="/a">'));
    expect(metadataConflicts(e)).toEqual([]);
  });

  test("title conflict from analysis.titleTexts", () => {
    const e = envelope(doc("<title>First</title><title>Second</title>"));
    expect(metadataConflicts(e)).toEqual([{ field: "title", kept: "First", discarded: ["Second"] }]);
  });

  test("description conflict from repeated non-empty description metas", () => {
    const e = envelope(
      doc('<meta name="description" content="A"><meta name="description" content="B">'),
    );
    expect(metadataConflicts(e)).toEqual([{ field: "description", kept: "A", discarded: ["B"] }]);
  });

  test("a single <html> lang is not a conflict", () => {
    const e = envelope(doc("", "", 'lang="en"'));
    expect(metadataConflicts(e).some((c) => c.field === "lang")).toBe(false);
  });

  test("two <html> elements with differing lang: conflict recorded from analysis.langTexts", () => {
    // `document.js`'s snapshot keeps only the FIRST <html> element
    // (`findFirst`), so `langOf` alone cannot see a second one — reachable
    // through a textual <include> of a full document. `analysis.langTexts`
    // collects every <html> element's lang document-wide, which is what
    // this conflict is read from.
    const e = envelope('<!doctype html><html lang="en"><head><title>x</title></head><body>'
      + '<html lang="fr"></html></body></html>');
    expect(metadataConflicts(e)).toEqual([{ field: "lang", kept: "en", discarded: ["fr"] }]);
  });

  test("conflicts are ordered by field name", () => {
    const e = envelope(
      doc(
        '<meta name="description" content="A"><meta name="description" content="B">' +
          '<link rel="canonical" href="/a"><link rel="canonical" href="/b">' +
          "<title>First</title><title>Second</title>",
      ),
    );
    expect(metadataConflicts(e).map((c) => c.field)).toEqual(["canonical", "description", "title"]);
  });

  test("a repeat that differs only after the first differing value is still discarded", () => {
    // A third value equal to the FIRST (kept) value is not re-reported —
    // §20.4's own rule: discarded is a filter over values[1:] against kept.
    const e = envelope(
      doc('<link rel="canonical" href="/a"><link rel="canonical" href="/b"><link rel="canonical" href="/a">'),
    );
    expect(metadataConflicts(e)).toEqual([{ field: "canonical", kept: "/a", discarded: ["/b"] }]);
  });
});

// ================================================================
// publicationDatesOf
// ================================================================

describe("publicationDatesOf", () => {
  test("no declarations: both null", () => {
    expect(publicationDatesOf(envelope(doc()))).toEqual({ published: null, modified: null });
  });

  test("name=date wins when it comes before article:published_time in head order", () => {
    const e = envelope(
      doc('<meta name="date" content="2026-01-02"><meta property="article:published_time" content="2026-06-01">'),
    );
    expect(publicationDatesOf(e).published).toEqual({ raw: "2026-01-02", iso: "2026-01-02" });
  });

  test("article:published_time wins when it comes first in head order", () => {
    const e = envelope(
      doc('<meta property="article:published_time" content="2026-06-01"><meta name="date" content="2026-01-02">'),
    );
    expect(publicationDatesOf(e).published).toEqual({ raw: "2026-06-01", iso: "2026-06-01" });
  });

  test("name=lastmod wins when it comes before article:modified_time", () => {
    const e = envelope(
      doc('<meta name="lastmod" content="2026-02-02"><meta property="article:modified_time" content="2026-07-01">'),
    );
    expect(publicationDatesOf(e).modified).toEqual({ raw: "2026-02-02", iso: "2026-02-02" });
  });

  test("article:modified_time wins when it comes first", () => {
    const e = envelope(
      doc('<meta property="article:modified_time" content="2026-07-01"><meta name="lastmod" content="2026-02-02">'),
    );
    expect(publicationDatesOf(e).modified).toEqual({ raw: "2026-07-01", iso: "2026-07-01" });
  });

  test("a non-date value is kept verbatim in raw with iso null", () => {
    const e = envelope(doc('<meta name="date" content="soon">'));
    expect(publicationDatesOf(e).published).toEqual({ raw: "soon", iso: null });
  });

  test("empty date meta declares nothing; next non-empty one wins", () => {
    const e = envelope(doc('<meta name="date" content="  "><meta name="date" content="2026-03-04">'));
    expect(publicationDatesOf(e).published).toEqual({ raw: "2026-03-04", iso: "2026-03-04" });
  });

  test("a meta dual-spelled name=date property=article:modified_time plays only its name role, matching manifest.js's exclusive chain", () => {
    const e = envelope(doc('<meta name="date" property="article:modified_time" content="2026-01-02">'));
    const dates = publicationDatesOf(e);
    expect(dates.published).toEqual({ raw: "2026-01-02", iso: "2026-01-02" });
    expect(dates.modified).toBeNull();
  });
});

// ================================================================
// preferredImageOf
// ================================================================

describe("preferredImageOf", () => {
  test("no image metas: null", () => {
    expect(preferredImageOf(envelope(doc()))).toBeNull();
  });

  test("og:image wins even when twitter:image comes first in document order", () => {
    const e = envelope(
      doc('<meta name="twitter:image" content="/tw.png"><meta property="og:image" content="/og.png">'),
    );
    const img = preferredImageOf(e);
    expect(img.url).toBe("/og.png");
    expect(img.fromOg).toBe(true);
  });

  test("og:image wins when it comes first too", () => {
    const e = envelope(
      doc('<meta property="og:image" content="/og.png"><meta name="twitter:image" content="/tw.png">'),
    );
    const img = preferredImageOf(e);
    expect(img.url).toBe("/og.png");
    expect(img.fromOg).toBe(true);
  });

  test("twitter:image used only when no og:image declared", () => {
    const e = envelope(doc('<meta name="twitter:image" content="/tw.png">'));
    const img = preferredImageOf(e);
    expect(img).toEqual({ url: "/tw.png", width: null, height: null, fromOg: false });
  });

  test("dimensions read only from og:image:width/height, only when fromOg", () => {
    const e = envelope(
      doc(
        '<meta property="og:image" content="/og.png">' +
          '<meta property="og:image:width" content="600">' +
          '<meta property="og:image:height" content="400">',
      ),
    );
    expect(preferredImageOf(e)).toEqual({ url: "/og.png", width: 600, height: 400, fromOg: true });
  });

  test("dimensions stay null on a twitter:image even if og:image:width is (nonsensically) present", () => {
    const e = envelope(
      doc('<meta name="twitter:image" content="/tw.png"><meta property="og:image:width" content="600">'),
    );
    const img = preferredImageOf(e);
    expect(img.fromOg).toBe(false);
    expect(img.width).toBeNull();
    expect(img.height).toBeNull();
  });

  test("non-integer dimension values read as null", () => {
    const e = envelope(
      doc(
        '<meta property="og:image" content="/og.png">' +
          '<meta property="og:image:width" content="large">' +
          '<meta property="og:image:height" content="12.5">',
      ),
    );
    const img = preferredImageOf(e);
    expect(img.width).toBeNull();
    expect(img.height).toBeNull();
  });

  test("first-wins within a spelling", () => {
    const e = envelope(
      doc('<meta property="og:image" content="/first.png"><meta property="og:image" content="/second.png">'),
    );
    expect(preferredImageOf(e).url).toBe("/first.png");
  });

  test("a meta dual-spelled name=twitter:image property=og:image plays only its name role, matching manifest.js's exclusive chain", () => {
    const e = envelope(
      doc(
        '<meta name="twitter:image" property="og:image" content="/card.png">' +
          '<meta property="og:image:width" content="600"><meta property="og:image:height" content="315">',
      ),
    );
    expect(preferredImageOf(e)).toEqual({ url: "/card.png", width: null, height: null, fromOg: false });
  });
});

// ================================================================
// declaredTypes
// ================================================================

describe("declaredTypes", () => {
  test("no declarations: empty array", () => {
    expect(declaredTypes(envelope(doc()))).toEqual([]);
  });

  test("meta name=schema declarations listed before JSON-LD ones", () => {
    const e = envelope(
      doc(
        '<meta name="schema" content="Article">' +
          '<script type="application/ld+json">{"@type":"BlogPosting"}</script>',
      ),
    );
    expect(declaredTypes(e)).toEqual(["Article", "BlogPosting"]);
  });

  test("multiple meta schema declarations, all kept, in head order", () => {
    const e = envelope(doc('<meta name="schema" content="Article"><meta name="schema" content="NewsArticle">'));
    expect(declaredTypes(e)).toEqual(["Article", "NewsArticle"]);
  });

  test("multiple JSON-LD entries, all kept, document order", () => {
    const e = envelope(
      doc(
        '<script type="application/ld+json">{"@type":"WebSite"}</script>' +
          '<script type="application/ld+json">{"@type":"Article"}</script>',
      ),
    );
    expect(declaredTypes(e)).toEqual(["WebSite", "Article"]);
  });

  test("a @graph object declares nothing", () => {
    const e = envelope(doc('<script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script>'));
    expect(declaredTypes(e)).toEqual([]);
  });

  test("an array root declares nothing", () => {
    const e = envelope(doc('<script type="application/ld+json">[{"@type":"Article"}]</script>'));
    expect(declaredTypes(e)).toEqual([]);
  });

  test("a non-string @type declares nothing", () => {
    const e = envelope(doc('<script type="application/ld+json">{"@type":5}</script>'));
    expect(declaredTypes(e)).toEqual([]);
  });

  test("invalid JSON-LD (parse error) declares nothing but does not throw", () => {
    const e = envelope(doc('<script type="application/ld+json">{not json</script>'));
    expect(() => declaredTypes(e)).not.toThrow();
    expect(declaredTypes(e)).toEqual([]);
  });

  test("empty schema meta contributes nothing", () => {
    const e = envelope(doc('<meta name="schema" content="  ">'));
    expect(declaredTypes(e)).toEqual([]);
  });
});

// ================================================================
// refreshOf
// ================================================================

describe("refreshOf", () => {
  test("accessor over analysis.refresh", () => {
    const e = envelope(doc('<meta http-equiv="refresh" content="5; url=/x.html">'));
    expect(refreshOf(e)).toEqual({ raw: "5; url=/x.html", seconds: 5, url: "/x.html", hasSecondPart: true });
  });

  test("null when no refresh declared", () => {
    expect(refreshOf(envelope(doc()))).toBeNull();
  });
});

// ================================================================
// classifyCanonicalValue / isPublicDestination (membership)
// ================================================================

describe("classifyCanonicalValue", () => {
  const base = parseBaseUrl("https://example.com/");

  test("none: no canonical declared", () => {
    expect(classifyCanonicalValue(null, "p.html", base)).toBe("none");
  });

  test("self: resolves to the page's own output path", () => {
    expect(classifyCanonicalValue("/p.html", "p.html", base)).toBe("self");
    expect(classifyCanonicalValue("p.html", "p.html", base)).toBe("self");
    expect(classifyCanonicalValue("https://example.com/p.html", "p.html", base)).toBe("self");
  });

  test("elsewhere: resolves to a different output path", () => {
    expect(classifyCanonicalValue("/other.html", "p.html", base)).toBe("elsewhere");
  });

  test("elsewhere: off-origin absolute URL, with base supplied", () => {
    expect(classifyCanonicalValue("https://elsewhere.example/p.html", "p.html", base)).toBe("elsewhere");
  });

  test("unknown: absolute URL with no base to compare against", () => {
    expect(classifyCanonicalValue("https://example.com/p.html", "p.html", null)).toBe("unknown");
  });

  test("unknown: an unresolvable value (mailto:)", () => {
    expect(classifyCanonicalValue("mailto:me@example.com", "p.html", base)).toBe("unknown");
  });

  test("unknown: empty value", () => {
    expect(classifyCanonicalValue("", "p.html", base)).toBe("unknown");
  });

  test("root-relative canonical resolves relative to the site root, not the page's directory", () => {
    expect(classifyCanonicalValue("/docs/p.html", "docs/p.html", base)).toBe("self");
    expect(classifyCanonicalValue("/p.html", "docs/p.html", base)).toBe("elsewhere");
  });
});

describe("isPublicDestination", () => {
  const base = parseBaseUrl("https://example.com/");

  test("a page with no canonical and no robots meta is included", () => {
    const e = envelope(doc());
    expect(isPublicDestination(e, base)).toBe(true);
  });

  test("noindex excludes", () => {
    const e = envelope(doc('<meta name="robots" content="noindex">'));
    expect(isPublicDestination(e, base)).toBe(false);
  });

  test("404.html is excluded by output path", () => {
    const e = envelope(doc(), { outputPath: "404.html" });
    expect(isPublicDestination(e, base)).toBe(false);
  });

  test("a page merely named like 404 elsewhere in the tree is not excluded", () => {
    const e = envelope(doc(), { outputPath: "docs/404.html" });
    expect(isPublicDestination(e, base)).toBe(true);
  });

  test("a canonical resolving to another page excludes this one", () => {
    const e = envelope(doc('<link rel="canonical" href="/other.html">'), { outputPath: "p.html" });
    expect(isPublicDestination(e, base)).toBe(false);
  });

  test("a self-canonical includes the page", () => {
    const e = envelope(doc('<link rel="canonical" href="/p.html">'), { outputPath: "p.html" });
    expect(isPublicDestination(e, base)).toBe(true);
  });

  test("no canonical at all includes the page", () => {
    const e = envelope(doc(), { outputPath: "p.html" });
    expect(isPublicDestination(e, base)).toBe(true);
  });
});

// ================================================================
// Value-level cores — relocation pins (byte-identical behavior to the
// pre-B2 manifest.js/sitemap.js implementations these were extracted from).
// ================================================================

describe("isoDate (relocated core)", () => {
  test("accepts date-only and full date-time forms", () => {
    expect(isoDate("2026-01-02")).toBe("2026-01-02");
    expect(isoDate("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05Z");
    expect(isoDate("2026-01-02T03:04:05+02:00")).toBe("2026-01-02T03:04:05+02:00");
  });

  test("rejects a space separator and a bare local time", () => {
    expect(isoDate("2026-01-02 03:04:05Z")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05")).toBeNull();
  });

  test("rejects an impossible calendar day", () => {
    expect(isoDate("2025-02-29")).toBeNull();
    expect(isoDate("2024-02-29")).toBe("2024-02-29");
  });

  test("rejects an out-of-range clock value", () => {
    expect(isoDate("2026-01-02T24:00:00Z")).toBeNull();
    expect(isoDate("2026-01-02T23:59:60Z")).toBeNull();
  });

  test("rejects an out-of-range offset", () => {
    expect(isoDate("2026-01-02T03:04:05+15:00")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05+14:00")).toBe("2026-01-02T03:04:05+14:00");
  });

  test("non-string input is null", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
  });
});

describe("parseRobotsValue (relocated core)", () => {
  test("null raw: indexable/followable default true", () => {
    expect(parseRobotsValue(null)).toEqual({ raw: null, directives: [], indexable: true, followable: true });
  });

  test("splits on comma, trims, lowercases", () => {
    expect(parseRobotsValue(" NOINDEX , NoFollow ")).toEqual({
      raw: " NOINDEX , NoFollow ",
      directives: ["noindex", "nofollow"],
      indexable: false,
      followable: false,
    });
  });
});

describe("declaredType (relocated core)", () => {
  test("reads a single object's string @type", () => {
    expect(declaredType({ "@type": "Article" })).toBe("Article");
  });

  test("null for @graph, array, missing, or non-string @type", () => {
    expect(declaredType({ "@graph": [] })).toBeNull();
    expect(declaredType([{ "@type": "Article" }])).toBeNull();
    expect(declaredType({})).toBeNull();
    expect(declaredType({ "@type": 5 })).toBeNull();
    expect(declaredType(null)).toBeNull();
  });
});

describe("intOrNull (relocated core)", () => {
  test("parses a pure-digit string", () => {
    expect(intOrNull("600")).toBe(600);
  });

  test("null for non-digit content, empty, or non-string", () => {
    expect(intOrNull("large")).toBeNull();
    expect(intOrNull("12.5")).toBeNull();
    expect(intOrNull("")).toBeNull();
    expect(intOrNull(null)).toBeNull();
  });

  test("bounded at the safe-integer ceiling", () => {
    expect(intOrNull("99999999999999999999999999")).toBeNull();
  });
});
