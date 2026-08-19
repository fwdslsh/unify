/**
 * URLs inside `<script type="application/ld+json">` — REF-10 and AUD-14.
 *
 * §12 checks the root-relative value of a URL-valued property — `url`, `logo`,
 * `image`, `thumbnailUrl`, `contentUrl` — because the property is what makes a
 * value a locator. It checks *only* those: a shape test ("is it root-relative?")
 * blocked the publish of `urlTemplate`, `@id`, `identifier` and
 * `softwareRequirements`, all conforming. §11 rewrites none of them,
 * which is why §24.4 rather than §11.3 is what tells a subpath deploy that its
 * structured data names the origin's root.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const page = (name, { head = "", body = "" } = {}) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="The ${name} page of the example site.">
${head}
</head>
<body>
${body}
<main><h1>${name}</h1><p>Words about ${name}.</p></main>
</body>
</html>
`;

const block = (json) => `<script type="application/ld+json">\n${json}\n</script>`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectIncludes(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
}

const ids = (stdout) => [...stdout.matchAll(/\[([a-z0-9-]+)\]$/gm)].map((m) => m[1]);

function expectFinding(r, id, what) {
  if (!ids(r.stdout).includes(id)) throw new Error(`${what}: expected a ${id} finding\nstdout:\n${r.stdout}`);
}

function expectNoFinding(r, id, what) {
  if (ids(r.stdout).includes(id)) throw new Error(`${what}: expected NO ${id} finding\nstdout:\n${r.stdout}`);
}

// --------------------------------------------------------------------- §12

test("REF-10 — a URL-valued property naming nothing blocks the publish, at the file that wrote it", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    // The block lives in the LAYOUT: §14.1 R3 locates a reference at its
    // provenance, and the shared chrome is where a site-wide logo is written.
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Site</title>
${block('{"@context":"https://schema.org","@type":"Organization","logo":"/img/logo-missing.png"}')}
</head>
<body><main></main></body>
</html>
`,
    "src/index.html": page("Home"),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 1, "a structured-data URL naming no emitted file");
  expectIncludes(r.stderr, "src/_layout.html:", "located at the file that wrote the block");
  expectIncludes(r.stderr, "/img/logo-missing.png does not resolve to any emitted file", "P13's message");
  if (existsSync(join(dir, "dist"))) throw new Error("a problem must leave dist/ unwritten (§15)");
  covers("REF-10");
}, TEST_MS);

/**
 * The shapes a SHAPE-based criterion reported as broken links, all in one
 * block, because they arrive in one block on a real site. Every root-relative
 * string here is conforming markup that no file answers, and the build must
 * publish it:
 *
 *   - `urlTemplate` — Google's sitelinks-search-box shape, verbatim: an RFC
 *     6570 template, expanded by the consumer, never fetched as written.
 *   - `@id` — a node identifier; this site has no root `index.html`, and is
 *     not supposed to need one to name an entity.
 *   - `identifier` — an identifier in a slash-shaped scheme.
 *   - `softwareRequirements` — a path on a machine that is not this one.
 *
 * Three more values pin the conditions around them: `contentUrl` is a template
 * under a LISTED property (the property list alone would check it), `image`
 * holds a relative IRI (which resolves against `@base`, unread here), and
 * `sameAs` is root-relative under a property deliberately left off the list.
 * `thumbnailUrl` is the control: a listed property naming a file that exists,
 * so a green build is evidence the check ran rather than evidence it is dead.
 */
const conforming = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "/#website",
  url: "https://example.com/",
  identifier: "/ISBN/9780000000000",
  softwareRequirements: "/usr/bin/node",
  foundingDate: "2019",
  sku: "ABC-123",
  description: "/r/coffee is worth reading",
  image: "logo.png",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: "/search?q={search_term_string}" },
    "query-input": "required name=search_term_string",
  },
  publisher: {
    "@type": "Organization",
    sameAs: ["/elsewhere.html"],
    logo: { "@type": "ImageObject", contentUrl: "/img/{width}/logo.png", thumbnailUrl: "/img/logo.png" },
  },
}, null, 1);

test("REF-10 — conforming structured data that no file answers still publishes", async () => {
  const dir = mkTmp();
  // No root index.html on purpose: `"@id": "/#website"` resolves to one, and a
  // site that happens to have it would pass this test for the wrong reason.
  writeTree(dir, {
    "src/page.html": page("Page", { head: block(conforming) }),
    "src/img/logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 0, "a page whose structured data names identifiers, templates and opaque values");
  if (!existsSync(join(dir, "dist", "page.html"))) throw new Error("the page must publish");
  // §11 rewrites no URL inside structured data, in any of its three phases, so
  // the author's own claim ships back byte for byte.
  const out = readFileSync(join(dir, "dist", "page.html"), "utf8");
  expectIncludes(out, conforming, "the block ships unedited");
  covers("REF-10");
}, TEST_MS);

test("REF-10 — a URL-valued property naming no emitted file is still a problem", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({ "@context": "https://schema.org", "@type": "Article", image: "/missing.png" })),
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  // `image`'s range is URL and the value is root-relative: the fact that makes
  // it a locator is the property, and a locator naming nothing is P13.
  expectExit(r, 1, "a listed property naming no emitted file");
  expectIncludes(r.stderr, "/missing.png does not resolve to any emitted file", "P13's message");
  if (existsSync(join(dir, "dist"))) throw new Error("a problem must leave dist/ unwritten (§15)");
  covers("REF-10");
}, TEST_MS);

test("REF-10 — an array inherits the property that names it", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        image: ["/img/logo.png", "/img/gone.png"],
      })),
    }),
    "src/img/logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  // Repeating the value inside an array is how the vocabulary spells every
  // multi-valued property; dropping the key at the array boundary would leave
  // every one of them unchecked.
  expectExit(r, 1, "the second image in the array names no emitted file");
  expectIncludes(r.stderr, "/img/gone.png does not resolve to any emitted file", "the array member");
  covers("REF-10");
}, TEST_MS);

test("REF-10 — depth is not a hiding place", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        publisher: { "@type": "Organization", logo: "/img/gone.png" },
      })),
    }),
    "src/img/logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 1, "a nested URL naming no emitted file");
  expectIncludes(r.stderr, "/img/gone.png does not resolve to any emitted file", "the value under publisher.logo");
  covers("REF-10");
}, TEST_MS);

test("REF-10 — an unparseable block is jsonld-invalid and never a reference problem", async () => {
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", { head: block('{ "image": "/gone.png" ') }),
  });
  const build = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  // Hunting for URLs inside broken JSON would report one fault twice, the
  // second time under a message about path spelling.
  expectExit(build, 0, "a block that does not parse is not read for references");
  if (build.stderr.includes("/gone.png")) {
    throw new Error(`no reference problem may come out of unparsed JSON:\n${build.stderr}`);
  }
  const audit = await runCli(["audit", "-s", "src"], dir);
  expectFinding(audit, "jsonld-invalid", "the block that does not parse");
  covers("REF-10");
}, TEST_MS);

test("REF-10 — a @context term definition is not data, and the skip is scoped to it", async () => {
  // The defect, verbatim from the report that found it: an inline `@context`
  // that DEFINES the terms `url` and `image` — the strings under it are the
  // IRIs giving those keys their meaning in this document, not addresses on
  // this site — printed two `does not resolve to any emitted file` problems
  // under `fix: check the path spelling and casing` and left dist/ unwritten.
  // Both halves of that fix line were wrong, which is the exact category error
  // the property list was written to end, committed inside the repair for it.
  const context = {
    "@vocab": "https://example.org/v#",
    url: "/vocab#url",
    // A term may be defined by an OBJECT as readily as by a string, so the key
    // is skipped whole rather than filtered one level down.
    image: { "@id": "/vocab#image", "@type": "@id" },
  };
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({
        "@context": context,
        "@type": "Thing",
        name: "A thing",
        // Data under the SAME key names that gets defined above: the check is
        // alive on `image`, it just does not read the definition of `image`.
        image: "/img/logo.png",
        // `@context` nests — a scoped context on a nested entity is the same
        // definition in the same shape, and is skipped at that depth too.
        publisher: { "@context": { logo: "/vocab#logo" }, "@type": "Organization", logo: "/img/logo.png" },
      }, null, 1)),
    }),
    "src/img/logo.png": "PNG",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 0, "an inline @context defining URL-valued term names");
  if (r.stderr.includes("/vocab#")) throw new Error(`a term IRI is not a reference:\n${r.stderr}`);
  if (!existsSync(join(dir, "dist", "index.html"))) throw new Error("the page must publish");

  // §24.4 reads these values through §12's own reader, so a term IRI must not
  // reappear there as a value to prefix — one reader, one answer.
  const audit = await runCli(["audit", "-s", "src", "--base-url", "https://example.com/repo/"], dir);
  if (audit.stdout.includes("/vocab#")) throw new Error(`a term IRI is not an address to prefix:\n${audit.stdout}`);

  // The skip is the VALUE of `@context`, not the block: a document carrying an
  // inline context still has its data checked, or the repair would trade a
  // false problem for a silent hole in every page that defines a term.
  const broken = mkTmp();
  writeTree(broken, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({ "@context": context, "@type": "Thing", image: "/img/gone.png" })),
    }),
  });
  const r2 = await runCli(["build", "-s", "src", "-o", "dist"], broken);
  expectExit(r2, 1, "data under a defined term still resolves or blocks");
  expectIncludes(r2.stderr, "/img/gone.png does not resolve to any emitted file", "the data value, not the definition");
  covers("REF-10", "AUD-14");
}, TEST_MS);

test("REF-10 — the properties left off the list cost a missed check and nothing else", async () => {
  // The list is a claim about each of its five members, never a claim to be
  // every URL-valued property. These fit the same description and are absent;
  // this test pins the PRICE of that, which is the only thing the bias toward
  // omission promises: a page whose every one of them names a deleted file
  // publishes. If a later round adds one, this test fails and the decision is
  // made in the open rather than by a name appearing in a Set.
  //
  // `item` is the closest call — the commonest site-local URL in real
  // structured data — and is left off on the list's own `@id` reasoning: it
  // names an ENTITY, so a string there identifies rather than locates. The
  // nested-object spelling below needs nothing added: the depth rule already
  // checks that object's own `url`, which is why /img/gone.png is NOT here.
  const dir = mkTmp();
  writeTree(dir, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        mainEntityOfPage: "/gone-a.html",
        significantLink: "/gone-b.html",
        relatedLink: "/gone-c.html",
        acquireLicensePage: "/gone-d.html",
        license: "/gone-e.html",
        downloadUrl: "/gone-f.zip",
        embedUrl: "/gone-g.mp4",
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "/gone-h.html" },
            { "@type": "ListItem", position: 2, name: "Here", item: { "@type": "WebPage", "@id": "/gone-i.html" } },
          ],
        },
      }, null, 1)),
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], dir);
  expectExit(r, 0, "properties absent from the closed list");
  if (r.stderr.includes("gone-")) throw new Error(`an unlisted property is not a reference:\n${r.stderr}`);
  if (!existsSync(join(dir, "dist", "index.html"))) throw new Error("the page must publish");
  covers("REF-10");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4

/** One page, one structured-data URL — the whole variable is that value. */
const logoSite = (logo, assetPath) => ({
  "src/index.html": page("Home", {
    head: block(JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", logo })),
  }),
  [`src/${assetPath}`]: "PNG",
});

test("AUD-14 — jsonld-url-unprefixed fires only at a subpath address, only on an unprefixed value", async () => {
  const dir = mkTmp();
  writeTree(dir, logoSite("/img/logo.png", "img/logo.png"));

  const subpath = await runCli(["audit", "-s", "src", "--base-url", "https://example.com/repo/"], dir);
  expectExit(subpath, 0, "a finding never blocks without --strict");
  expectFinding(subpath, "jsonld-url-unprefixed", "a root-relative value at a subpath deploy address");
  expectIncludes(subpath.stdout, 'names "/img/logo.png", which this site publishes at "/repo/img/logo.png"',
    "the evidence quotes both addresses");

  // An author who wrote the prefix by hand did what §11.3 does for an href, and
  // is right at the address they named.
  const dirPrefixed = mkTmp();
  // The asset still lives at img/logo.png in source — the prefix comes from the
  // deploy address, not from the tree — so §12 strips it back and the value
  // resolves, which is exactly why this is a finding and not a problem.
  writeTree(dirPrefixed, logoSite("/repo/img/logo.png", "img/logo.png"));
  const prefixed = await runCli(["audit", "-s", "src", "--base-url", "https://example.com/repo/"], dirPrefixed);
  expectExit(prefixed, 0, "the prefixed site audits");
  expectNoFinding(prefixed, "jsonld-url-unprefixed", "a value that already carries the prefix");

  // A root deploy makes the same value correct, so there is nothing to say —
  // and with no address at all unify does not know where the site lives.
  const root = await runCli(["audit", "-s", "src", "--base-url", "https://example.com/"], dir);
  expectNoFinding(root, "jsonld-url-unprefixed", "a root deploy address");
  const noBase = await runCli(["audit", "-s", "src"], dir);
  expectNoFinding(noBase, "jsonld-url-unprefixed", "no --base-url at all");

  // The values are §12's, read by §12's own reader: a string this finding
  // names is one the reference check accepted as a locator. An identifier and
  // a URI template are neither, at any deploy address — reporting them here
  // would tell the author to prefix a value that is not an address.
  const identifiers = mkTmp();
  writeTree(identifiers, {
    "src/index.html": page("Home", {
      head: block(JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "/#website",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: "/search?q={search_term_string}" },
        },
      })),
    }),
  });
  const notAddresses = await runCli(["audit", "-s", "src", "--base-url", "https://example.com/repo/"], identifiers);
  expectNoFinding(notAddresses, "jsonld-url-unprefixed", "an @id and a URI template are not addresses");
  covers("AUD-14");
}, TEST_MS);
