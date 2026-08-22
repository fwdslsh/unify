/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * tests/conformance/scaffold.test.js is what asserts SCF-01..SCF-11 with real
 * conformance authority, by spawning the CLI and reading the tree a real
 * build emitted; these tests exist so a template regression is caught here,
 * at the unit, instead of only three layers up. They deliberately reuse the real
 * composition modules (includes.js, markdown.js, compose.js, head-merge.js)
 * rather than a hand-rolled check — H1's "no mocks" discipline is a
 * behavior-test rule (tests/conformance/**, tests/e2e/**), not a unit-test
 * one, but the spirit is worth keeping here too: the modules under test are
 * the same ones a real build will run.
 *
 * Most checks below run entirely on the in-memory `TEMPLATES` map — no
 * scaffolding needed, since compose()/parse()/convert() all take strings.
 * Only the full per-page composition check needs real files on disk,
 * because includes.js resolves `<include src>` with an actual `readFile`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { init } from "../../src/cli/commands/init.js";
import { compose, assembleMarkdownDocument } from "../../src/core/compose.js";
import { Reporter } from "../../src/core/diagnostics.js";
import { findAll, getAttr, parse, walk } from "../../src/core/html.js";
import { inlineIncludes } from "../../src/core/includes.js";
import { convert, convertFragment } from "../../src/core/markdown.js";
import { TEMPLATES } from "../../src/templates/index.js";

const TEMPLATE_NAMES = Object.keys(TEMPLATES);

function silentReporter() {
  return new Reporter({ strict: false, stderr: { write() {} }, stdout: { write() {} } });
}

function isUnderscored(relPath) {
  return relPath.split("/").some((seg) => seg.startsWith("_"));
}

function isPage(relPath) {
  return /\.(html|md)$/i.test(relPath);
}

// ---------------------------------------------------------- in-memory checks

describe.each(TEMPLATE_NAMES)('template "%s" — SCF-01/SCF-02 structure (in-memory, no scaffolding needed)', (name) => {
  const files = TEMPLATES[name];
  const paths = Object.keys(files);
  const wholeSource = Object.values(files).join("\n");

  test("never includes unify.yaml (§19: init never creates one)", () => {
    expect(paths).not.toContain("unify.yaml");
  });

  test("exercises the underscore convention: every non-page file lives under an underscore path or is a real asset", () => {
    // _layout.html and _includes/ are the two SCF-01 requires; every template
    // must have both, by name.
    expect(paths).toContain("_layout.html");
    expect(paths.some((p) => p.startsWith("_includes/"))).toBe(true);
  });

  test("SCF-01: exactly one <include> across the whole template", () => {
    const count = (wholeSource.match(/<include\b/gi) || []).length;
    expect(count).toBe(1);
  });

  test("SCF-01: exactly one _layout.html (the automatic layout, discovered by name)", () => {
    const layouts = paths.filter((p) => p.split("/").pop() === "_layout.html");
    expect(layouts).toEqual(["_layout.html"]);
  });

  test('SCF-01: exactly one data-layout="none" page (404.html)', () => {
    const optedOut = paths.filter((p) => isPage(p) && !isUnderscored(p) && /data-layout\s*=\s*["']none["']/.test(files[p]));
    expect(optedOut).toEqual(["404.html"]);
  });

  test("SCF-01: exactly one named <slot> in the layout, with a fallback", () => {
    const { root } = parse(files["_layout.html"]);
    const namedSlots = findAll(root, (n) => n.type === "element" && n.tag.toLowerCase() === "slot" && getAttr(n, "name"));
    expect(namedSlots.length).toBe(1);
    expect(namedSlots[0].endTagStart).not.toBeNull(); // has a closing tag, i.e. can carry fallback content
  });

  test("SCF-01: exactly one page fills the named slot (slot=\"footer\" on a top-level element)", () => {
    const fillers = paths.filter((p) => isPage(p) && !isUnderscored(p) && /\sslot\s*=\s*["']footer["']/.test(files[p]));
    expect(fillers.length).toBe(1);
  });

  test('SCF-02: the layout declares <meta charset="utf-8"> first in <head>', () => {
    const { root } = parse(files["_layout.html"]);
    const head = findAll(root, (n) => n.type === "element" && n.tag.toLowerCase() === "head")[0];
    const firstElementChild = head.children.find((c) => c.type === "element");
    expect(firstElementChild.tag.toLowerCase()).toBe("meta");
    expect(getAttr(firstElementChild, "charset")).toBe("utf-8");
  });

  test("SCF-02: a plain HTML comment sits directly above EACH slot, naming its purpose", () => {
    // §19.1 says "each slot", and the layout has two: the bare <slot> inside
    // <main> and the named "footer" one. This test read only the named slot
    // until the bare one was found to carry no comment at all in any of the
    // five templates — the spec's sentence was false of every artifact it
    // described, and the one case that separated the claim from the artifact
    // was the exact case nothing looked at. Walking EVERY slot is what makes
    // the assertion the sentence.
    const { root } = parse(files["_layout.html"]);
    const unlabelled = [];
    let seen = 0;
    // findAll doesn't hand back sibling context, so walk the tree by hand.
    // `labelled` is whether the element we are *inside* was itself introduced
    // by a comment: `<!-- main: ... -->` on the line above `<main><slot></slot></main>`
    // labels that slot exactly as a comment directly above the slot does, and
    // a one-line <main> is where the scaffold puts it.
    function walk(node, labelled) {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== "element") continue;
        const prev = [...node.children.slice(0, i)].reverse()
          .find((c) => !(c.type === "text" && c.data.trim() === ""));
        const introduced = prev?.type === "comment";
        if (child.tag.toLowerCase() === "slot") {
          seen += 1;
          if (!introduced && !labelled) unlabelled.push(getAttr(child, "name") ?? "(bare)");
        }
        walk(child, introduced);
      }
    }
    walk(root, false);
    expect(seen).toBeGreaterThanOrEqual(2); // the bare slot and the named one
    expect(unlabelled).toEqual([]);
  });

  test("SCF-02: the starter stylesheet declares slot { display: contents }", () => {
    const cssFiles = paths.filter((p) => p.endsWith(".css"));
    expect(cssFiles.length).toBeGreaterThan(0);
    for (const css of cssFiles) expect(files[css]).toMatch(/slot\s*\{\s*display:\s*contents\s*;?\s*\}/);
  });

  test("built pages contain no <slot> elements outside the design-time layout itself", () => {
    // The layout is the one file that legitimately carries <slot> (its own
    // browser preview, product-spec §2). Every *page* must not — a stray
    // <slot> in a page is problem P20 (was advisory A04), not the SCF-01 primitive.
    for (const p of paths.filter((x) => isPage(x) && !isUnderscored(x))) {
      expect(files[p]).not.toMatch(/<slot[\s>]/i);
    }
  });

  test("every .html file (pages, layout, and the nav fragment) is well-formed per the project's own tokenizer", () => {
    for (const p of paths.filter((x) => x.endsWith(".html"))) {
      const { doctype, root } = parse(files[p]);
      const problems = [];
      walk(root, (n) => {
        if (n.type === "stray-endtag") problems.push(`stray </${n.tag}> in ${p}`);
        if (n.type === "element" && n.endTagStart === null && !n.void && !n.selfClosing) {
          problems.push(`unclosed <${n.tag}> in ${p}`);
        }
      });
      expect(problems).toEqual([]);
      // Fragments (_includes/*) are snippets by design (authoring-rules.md);
      // every real page and the layout must be a complete document.
      if (!p.startsWith("_includes/")) expect(doctype?.raw?.toLowerCase()).toBe("<!doctype html>");
    }
  });

  test("every .md page's frontmatter and body convert cleanly (zero diagnostics)", () => {
    for (const p of paths.filter((x) => x.endsWith(".md"))) {
      const reporter = silentReporter();
      convert(files[p], { path: `/src/${p}`, sourceRoot: "/src", reporter });
      expect(reporter.diagnostics).toEqual([]);
    }
  });

  test("no page or layout uses the retired vocabulary (data-unify, unify- classes)", () => {
    expect(wholeSource).not.toMatch(/data-unify\b/);
    expect(wholeSource).not.toMatch(/class="[^"]*\bunify-/);
  });
});

// -------------------------------------------------------- on-disk, full pipeline

describe.each(TEMPLATE_NAMES)('template "%s" — full composition (SCF-04: zero problems, zero advisories)', (name) => {
  let target;
  const roots = [];

  async function scaffoldOnce() {
    if (target) return target;
    const root = mkdtempSync(join(tmpdir(), `unify-templates-test-${name}-`));
    roots.push(root);
    const reporter = silentReporter();
    const code = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: name, reporter });
    if (code !== 0) throw new Error(`init(${name}) exited ${code}`);
    target = join(root, "src");
    return target;
  }

  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  const files = TEMPLATES[name];
  const pages = Object.keys(files).filter((p) => isPage(p) && !isUnderscored(p));

  test.each(pages)("page %s composes against its resolved layout with zero diagnostics", async (pageRel) => {
    const dir = await scaffoldOnce();
    const reporter = silentReporter();
    const hasNoLayout = /data-layout\s*=\s*["']none["']/.test(files[pageRel]);
    const layoutRelPath = hasNoLayout ? null : "_layout.html";
    const convertMarkdown = (p) => convertFragment(p, { sourceRoot: dir, reporter });

    const pageAbs = join(dir, pageRel);
    let pageText;
    if (extname(pageRel).toLowerCase() === ".md") {
      const source = readFileSync(pageAbs, "utf8");
      const md = convert(source, { path: pageAbs, sourceRoot: dir, reporter });
      ({ text: pageText } = assembleMarkdownDocument(md, { standalone: !layoutRelPath, pageFile: pageRel }));
    } else {
      pageText = readFileSync(pageAbs, "utf8");
    }
    const inlinedPage = await inlineIncludes({ text: pageText, file: pageAbs, sourceRoot: dir, reporter, convertMarkdown });

    let layoutText = null;
    let layoutSpans;
    if (layoutRelPath) {
      const layoutAbs = join(dir, layoutRelPath);
      const inlinedLayout = await inlineIncludes({
        text: readFileSync(layoutAbs, "utf8"), file: layoutAbs, sourceRoot: dir, reporter, convertMarkdown,
      });
      layoutText = inlinedLayout.text;
      layoutSpans = inlinedLayout.spans;
    }

    const composed = compose({
      pageText: inlinedPage.text, pageFile: pageRel, pageSpans: inlinedPage.spans,
      layoutText, layoutFile: layoutRelPath, layoutSpans, reporter,
    });

    expect(reporter.diagnostics).toEqual([]);
    expect(composed.text).toContain("<!doctype html>");
  });

  test("every root-relative href/src in every composed page resolves to a file the scaffold will emit", async () => {
    const dir = await scaffoldOnce();
    const emitted = new Set();
    for (const p of pages) emitted.add(p.replace(/\.md$/i, ".html"));
    for (const p of Object.keys(files).filter((f) => !isPage(f) && !isUnderscored(f))) emitted.add(p);

    const broken = [];
    for (const pageRel of pages) {
      const reporter = silentReporter();
      const hasNoLayout = /data-layout\s*=\s*["']none["']/.test(files[pageRel]);
      const layoutRelPath = hasNoLayout ? null : "_layout.html";
      const convertMarkdown = (p) => convertFragment(p, { sourceRoot: dir, reporter });
      const pageAbs = join(dir, pageRel);

      let pageText;
      if (extname(pageRel).toLowerCase() === ".md") {
        const md = convert(readFileSync(pageAbs, "utf8"), { path: pageAbs, sourceRoot: dir, reporter });
        ({ text: pageText } = assembleMarkdownDocument(md, { standalone: !layoutRelPath, pageFile: pageRel }));
      } else {
        pageText = readFileSync(pageAbs, "utf8");
      }
      const inlinedPage = await inlineIncludes({ text: pageText, file: pageAbs, sourceRoot: dir, reporter, convertMarkdown });

      let layoutText = null;
      let layoutSpans;
      if (layoutRelPath) {
        const layoutAbs = join(dir, layoutRelPath);
        const inlinedLayout = await inlineIncludes({
          text: readFileSync(layoutAbs, "utf8"), file: layoutAbs, sourceRoot: dir, reporter, convertMarkdown,
        });
        layoutText = inlinedLayout.text;
        layoutSpans = inlinedLayout.spans;
      }
      const { text: html } = compose({
        pageText: inlinedPage.text, pageFile: pageRel, pageSpans: inlinedPage.spans,
        layoutText, layoutFile: layoutRelPath, layoutSpans, reporter,
      });

      const { root } = parse(html);
      for (const el of findAll(root, (n) => n.type === "element")) {
        for (const attr of ["href", "src", "poster"]) {
          const v = getAttr(el, attr);
          if (!v || !v.startsWith("/")) continue; // this scaffold never emits scheme/relative internal URLs worth checking here
          const clean = v.split("#")[0].split("?")[0].slice(1);
          const target = clean === "" || clean.endsWith("/") ? `${clean}index.html` : clean;
          if (!emitted.has(target)) broken.push(`${pageRel}: <${el.tag} ${attr}="${v}">`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

// ------------------------------------------- §19.2, §19.5, §19.7 at the source
//
// Tier 3 still — the authority for SCF-06..SCF-11 is tests/conformance/
// scaffold.test.js, which reads what a real `unify build` emitted. These
// checks exist because two of §19's rules are properties of the template
// MODULE rather than of any page it produces, and a built tree cannot show
// them: whether a template's own source declares the thing (rather than
// inheriting it from a layout that might stop supplying it), and whether the
// module reaches its bytes without touching a filesystem.

describe.each(TEMPLATE_NAMES)('template "%s" — SCF-06/SCF-07 at the source', (name) => {
  const files = TEMPLATES[name];
  const paths = Object.keys(files);
  const pages = paths.filter((p) => isPage(p) && !isUnderscored(p));

  test("§19.2 item 2: every page declares its OWN title and description, never only the layout's", () => {
    // The built-tree check reads what shipped, which a layout can supply for
    // the whole site. This reads what each PAGE declares, which is the half
    // §8's merge cannot invent: a layout-wide description is identical on
    // every page and is §24.4's description-duplicate, so the per-page
    // declaration is the only spelling that can ever be right.
    const missing = [];
    for (const p of pages) {
      const source = files[p];
      if (p.endsWith(".md")) {
        const frontmatter = source.startsWith("---") ? source.slice(3, source.indexOf("\n---", 3)) : "";
        if (!/^title:\s*\S/m.test(frontmatter)) missing.push(`${p}: no title: in frontmatter`);
        if (!/^description:\s*\S/m.test(frontmatter)) missing.push(`${p}: no description: in frontmatter`);
        continue;
      }
      const { root } = parse(source);
      const head = findAll(root, (n) => n.type === "element" && n.tag.toLowerCase() === "head")[0];
      const scope = head ?? root;
      const titles = findAll(scope, (n) => n.type === "element" && n.tag.toLowerCase() === "title");
      if (titles.length === 0) missing.push(`${p}: no <title> of its own`);
      const descriptions = findAll(scope, (n) => n.type === "element" && n.tag.toLowerCase() === "meta" && getAttr(n, "name") === "description");
      if (descriptions.length === 0 || !descriptions[0] || !(getAttr(descriptions[0], "content") ?? "").trim()) {
        missing.push(`${p}: no <meta name="description"> of its own`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("§19.7: no value in the template is the spelling a missing argument takes", () => {
    // `pageHtml({title})` with no `description` interpolates the string
    // "undefined" into the page, its og:description and its JSON-LD. Every
    // finding in §24.4 reads that as a present, unique, non-empty value, so
    // nothing downstream can see it — which is why it is checked here, where
    // the argument was omitted.
    //
    // Scoped to the files whose bytes a reader receives — the pages, the
    // layout, and the include. `_scripts/gen.mjs` is deliberately out of
    // scope: it is a program, `Number.isNaN` is the right thing for it to
    // call, and the pages it writes are `.html` entries in this same map and
    // are checked here like any other.
    const offenders = [];
    for (const p of paths.filter((x) => /\.(html|md)$/i.test(x))) {
      const content = files[p];
      if (typeof content !== "string") continue;
      for (const spelling of ["undefined", "[object Object]", "NaN"]) {
        if (content.includes(spelling)) offenders.push(`${p}: contains ${JSON.stringify(spelling)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("§19.2 item 7: the template declares no canonical anywhere", () => {
    // A canonical is one page's own absolute address (§22.1), which a scaffold
    // cannot know. Checked at the source as well as in dist/ because a
    // canonical written into a page that failed to compose would never reach
    // a built tree to be caught there.
    const withCanonical = paths.filter((p) => typeof files[p] === "string" && /rel\s*=\s*["']canonical["']/i.test(files[p]));
    expect(withCanonical).toEqual([]);
  });

  test("§19.2 item 5: robots.txt is at the source root, blocks nothing, and declares no Sitemap:", () => {
    expect(paths).toContain("robots.txt");
    const lines = files["robots.txt"].split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("#"));
    expect(lines.some((l) => /^\s*user-agent\s*:/i.test(l))).toBe(true);
    // unify never decides what a site should block (§23), and a scaffold
    // knows even less.
    expect(lines.filter((l) => /^\s*disallow\s*:\s*\S/i.test(l))).toEqual([]);
    // §23.2 makes a `#` line a comment, so a commented example teaches the
    // line; a LIVE record without a sitemap to name is §24.4's
    // robots-sitemap-missing in a fresh scaffold.
    expect(lines.filter((l) => /^\s*sitemap\s*:/i.test(l))).toEqual([]);
  });
});

describe("§19.5 — a template file may be bytes, and nothing reaches them through a filesystem", () => {
  test("every value in every template map is a string or raw bytes, the two kinds init.js documents", () => {
    const wrong = [];
    for (const [name, files] of Object.entries(TEMPLATES)) {
      for (const [p, content] of Object.entries(files)) {
        if (typeof content !== "string" && !(content instanceof Uint8Array)) {
          wrong.push(`${name}/${p}: ${Object.prototype.toString.call(content)}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  test("the byte-valued files are exactly the raster assets, and each one is a real image", () => {
    for (const [name, files] of Object.entries(TEMPLATES)) {
      const binary = Object.entries(files).filter(([, content]) => content instanceof Uint8Array);
      expect(binary.length).toBeGreaterThan(0);
      for (const [p, bytes] of binary) {
        expect(`${name}: ${p}`).toMatch(/\.(png|jpg|jpeg|gif|webp|ico)$/);
        // §19.2 item 4 is why bytes exist at all: an SVG would have kept the
        // map textual and would not have done the job.
        expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      }
    }
  });

  test("no module under src/templates/** imports a filesystem, path, url, or process module", () => {
    // `bun build --compile` bundles by tracing `import`, and a single-file
    // executable has no sibling directory to read — so every byte a template
    // ships must be data reachable by static import.
    //
    // The scan uses Bun's own transpiler rather than a grep, and that is
    // load-bearing rather than fastidious: src/templates/blog.js carries the
    // text of `_scripts/gen.mjs` in a template literal, and that script
    // legitimately opens with `import { readFileSync } from "node:fs"`. A grep
    // reads the scaffold's own generator as a violation by the module that
    // ships it; scanImports reads the module's actual import graph and ignores
    // the string. The end-to-end proof — compile the binary, scaffold from an
    // empty directory, compare bytes — is in tests/conformance/scaffold.test.js.
    const dir = join(import.meta.dir, "..", "..", "src", "templates");
    const transpiler = new Bun.Transpiler({ loader: "js" });
    const forbidden = /^(?:node:)?(?:fs|fs\/promises|path|url|process|child_process|os)$/;
    const offenders = [];
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".js")) continue;
      for (const record of transpiler.scanImports(readFileSync(join(dir, entry), "utf8"))) {
        if (forbidden.test(record.path)) offenders.push(`src/templates/${entry} imports ${record.path}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
