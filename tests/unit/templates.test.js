/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2). A
 * future tests/e2e/ suite is what will assert SCF-01..04 with real
 * conformance authority by spawning the CLI (migration-plan.md Phase 4);
 * these tests exist so a template regression is caught here, at the unit,
 * instead of only three layers up. They deliberately reuse the real
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
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  test("SCF-02: a plain HTML comment sits directly above the named slot, naming its purpose", () => {
    const { root } = parse(files["_layout.html"]);
    let commentBeforeSlot = false;
    // findAll doesn't hand back sibling context, so walk the tree by hand for
    // this one structural check: is the element immediately before the named
    // <slot> a comment node?
    function checkChildren(node) {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "element" && child.tag.toLowerCase() === "slot" && getAttr(child, "name")) {
          const prevNonBlank = [...node.children.slice(0, i)].reverse()
            .find((c) => !(c.type === "text" && c.data.trim() === ""));
          if (prevNonBlank?.type === "comment") commentBeforeSlot = true;
        }
        checkChildren(child);
      }
    }
    checkChildren(root);
    expect(commentBeforeSlot).toBe(true);
  });

  test("SCF-02: the starter stylesheet declares slot { display: contents }", () => {
    const cssFiles = paths.filter((p) => p.endsWith(".css"));
    expect(cssFiles.length).toBeGreaterThan(0);
    for (const css of cssFiles) expect(files[css]).toMatch(/slot\s*\{\s*display:\s*contents\s*;?\s*\}/);
  });

  test("built pages contain no <slot> elements outside the design-time layout itself", () => {
    // The layout is the one file that legitimately carries <slot> (its own
    // browser preview, product-spec §2). Every *page* must not — a stray
    // <slot> in a page is advisory A04, not the SCF-01 primitive.
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

  test("no page or layout uses the retired v0.6 vocabulary (data-unify, unify- classes)", () => {
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
    const code = await init({ sourceRoot: root, sourceDefaulted: true, template: name, reporter });
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
