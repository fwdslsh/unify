/** Named fills precede main unwrapping; unmatched main fills remain diagnosable. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const page = (body, attrs = "") => `<!doctype html><html><head><title>Guide</title></head><body${attrs}>${body}</body></html>`;
const read = (tmp, name = "index.html") => readFileSync(join(tmp, "dist", name), "utf8");
async function build(tmp, flags = ["--strict"]) {
  const result = await runCli(["build", ...flags], tmp);
  expect(result.exit, result.stdout + result.stderr).toBe(0);
  return result;
}

test("MRG-21: a named main fills a named-only layout as a complete element", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<slot name="content"></slot>'),
    "index.html": page('<main slot="content" id="content" class="guide"><h1>Guide</h1><a href="#content">Top</a></main>'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<body><main id="content" class="guide"><h1>Guide</h1><a href="#content">Top</a></main></body>');
  covers("MRG-21", "MRG-09");
});

test("MRG-21: named subtrees keep their mains and nested slot attributes; the default main is selected separately", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<main id="layout" class="shell"><slot></slot></main><slot name="panel"></slot><slot name="aside">fallback</slot>'),
    "index.html": page('<main slot="panel" id="named" hidden><h1>Named</h1></main>' +
      '<div slot="panel"><main id="nested" hidden><p slot="aside">Still inside named fill</p></main></div>' +
      '<div class="wrap"><main id="default" class="article"><p>Default</p><aside slot="aside">Aside</aside>' +
      '<div><b slot="aside">Nested component fill</b></div></main></div>' +
      '<template><main slot="panel" id="inert">Inert</main></template>'),
  });
  await build(tmp);
  const html = read(tmp);
  expect(html).toContain('<main id="default" class="shell article"><div class="wrap"><p>Default</p>');
  expect(html).toContain('<main id="named" hidden><h1>Named</h1></main>\n    <div><main id="nested" hidden><p slot="aside">Still inside named fill</p></main></div>');
  expect(html).toContain('<b slot="aside">Nested component fill</b>');
  expect(html).toContain('<aside>Aside</aside>');
  expect(html).toContain('<template><main slot="panel" id="inert">Inert</main></template>');
  expect(html.match(/<h1>Named<\/h1>/g)).toHaveLength(1);
  covers("MRG-21", "MRG-06", "MRG-07", "MRG-09");
});

test("MRG-10: unmatched main fill reports its include location and follows strict exit semantics", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<main id="content"><slot></slot></main><slot name="aside">Fallback</slot>'),
    "index.html": page('<main><h1>Original</h1></main>'),
  });
  await build(tmp);
  const original = read(tmp);
  writeTree(join(tmp, "site"), {
    "_parts/content.html": '\n<main slot="asdie" id="page"><h1>Changed</h1></main>',
    "index.html": page('<include src="/_parts/content.html"></include>'),
  });
  const dry = await runCli(["build", "--dry-run", "--strict"], tmp);
  expect(dry.exit).toBe(1);
  expect(read(tmp)).toBe(original);
  const strict = await runCli(["build", "--strict"], tmp);
  expect(strict.exit).toBe(1);
  expect(strict.stderr).toContain('_parts/content.html:2:');
  expect(strict.stderr).toContain('no slot named "asdie"');
  expect(strict.stderr.match(/no slot named/g)).toHaveLength(1);
  expect(read(tmp)).toContain('<main id="page">\n<h1>Changed</h1></main>Fallback');
  const normal = await build(tmp, []);
  expect(normal.stderr).toContain('no slot named "asdie"');
  expect(read(tmp)).toContain('<main id="page">\n<h1>Changed</h1></main>Fallback');
  expect(read(tmp)).not.toContain('slot="asdie"');
  covers("MRG-10", "DIA-03", "MRG-06");
});

test("MRG-21: named included mains keep reference provenance", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<slot name="content"></slot>'),
    "_parts/content.html": '<main slot="content" class="article"><img src="../image.svg" alt="Example"></main>',
    "image.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    "index.html": page('<include src="/_parts/content.html"></include>'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<main class="article"><img src="/image.svg" alt="Example"></main>');
  covers("MRG-21", "MRG-09");
});

test("MRG-06/ATT-03: default main unwrapping merges onto the layout main; a body-level bare slot keeps the page main", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<a href="#content">Skip</a><main id="content" class="shell"><slot></slot></main>'),
    "index.html": page('<main id="guide" class="article" hidden><h1>Guide</h1></main>'),
    "_bare.html": page('<slot></slot>'),
    "bare.html": page('<nav>Before</nav><main id="guide" class="article"><h1>Guide</h1></main>', ' data-layout="/_bare.html"'),
    "empty.html": page('<main slot=""><p>Empty name</p></main>'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<a href="#content">Skip</a><main id="guide" class="shell article" hidden><h1>Guide</h1></main>');
  expect(read(tmp, "bare.html")).toContain('<body><nav>Before</nav><main id="guide" class="article"><h1>Guide</h1></main></body>');
  expect(read(tmp, "empty.html")).toContain('<main id="content" class="shell"><p>Empty name</p></main>');
  covers("MRG-06", "ATT-03", "MRG-22", "ATT-04");
});

test("slotted includes keep a main and do not promote its children to named fills", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<slot></slot><slot name="aside">Layout fallback</slot>'),
    "_parts/body.fragment.html": '<slot></slot><slot name="aside">Include fallback</slot>',
    "index.html": page('<main><p slot="aside">Page aside</p><h1>Guide</h1></main>'),
    "include.html": page('<include src="/_parts/body.fragment.html"><main class="article"><p slot="aside">Inner aside</p><h1>Guide</h1></main></include>', ' data-layout="none"'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<body><main><h1>Guide</h1></main><p>Page aside</p></body>');
  expect(read(tmp, "include.html")).toContain('<main class="article"><p slot="aside">Inner aside</p><h1>Guide</h1></main>Include fallback');
});

const html = (body, attrs = "", htmlAttrs = "") =>
  `<!doctype html><html${htmlAttrs}><head><title>T</title></head><body${attrs}>${body}</body></html>`;
const bodyOf = (out) => /<body[^>]*>([\s\S]*)<\/body>/.exec(out)[1];

test("ATT-05: a merged attribute stays well-formed whatever quotes its value holds (html, body, main)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<main data-x=\'{"a":1}\' data-y="p"><slot></slot></main>', " data-x='{\"a\":1}'", " data-x='{\"a\":1}'"),
    "index.html": html(
      `<main data-x='{"b":2}' data-y=plain data-z='say "hi" it&apos;s' data-w="it's" data-q='a"b' class='c"1'><p>x</p></main>`,
      ` data-x='{"b":2}' data-n=bare data-both='"both" and &#39;' hidden`,
      ` data-x='{"b":2}' title='a "quoted" title'`),
  });
  await build(tmp);
  const out = read(tmp);
  expect(out).toContain(`<html data-x='{"b":2}' title='a "quoted" title'>`);
  expect(out).toContain(`<body data-x='{"b":2}' data-n="bare" data-both='"both" and &#39;' hidden>`);
  expect(out).toContain(`<main data-x='{"b":2}' data-y="plain" data-z='say "hi" it&apos;s' data-w="it's" data-q='a"b' class='c"1'>`);
  covers("ATT-05");
});

test("ATT-04: the page main's attributes merge onto the implicit main sink and onto the main around a bare slot", async () => {
  const tmp = mkTmp();
  const pageMain = '<main id="article" class="article shell" aria-label="Article" hidden slot="nope"><h1>Example</h1></main>';
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<a href="#content">Skip</a><main id="content" class="shell" tabindex="-1" data-keep="1"></main><footer>F</footer>'),
    "index.html": html(pageMain),
    "deep/_layout.html": html('<header>H</header><main id="content" class="shell"><div><section><slot></slot></section></div><p>After</p></main>'),
    "deep/page.html": html(pageMain),
    "deep/empty.html": html('<main id="gone" class="x"></main>'),
  });
  const result = await build(tmp, []);
  expect(result.stderr).toContain('no slot named "nope"');
  expect(read(tmp)).toContain('<a href="#content">Skip</a><main id="article" class="shell article" tabindex="-1" data-keep="1" aria-label="Article" hidden><h1>Example</h1></main><footer>F</footer>');
  expect(read(tmp, "deep/page.html")).toContain('<header>H</header><main id="article" class="shell article" aria-label="Article" hidden><div><section><h1>Example</h1></section></div><p>After</p></main>');
  expect(read(tmp)).not.toContain("slot=");
  // Attributes merge even when the default content is empty; the fallback persists.
  expect(read(tmp, "deep/empty.html")).toContain('<main id="gone" class="shell x"><div><section></section></div><p>After</p></main>');
  covers("ATT-01", "ATT-02", "ATT-04", "MRG-06");
});

test("MRG-22: a body-level bare slot keeps the page main whole, in sibling order", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<header>Shared header</header><slot>Fallback</slot><footer>Shared footer</footer>'),
    "_fills.html": html('<slot></slot><div class="side"><slot name="side">no side</slot></div>'),
    "assets/page.js": "",
    "index.html": html('<nav aria-label="Section">Section navigation</nav><main id="content" class="article"><h1>Example</h1></main><script src="/assets/page.js" defer></script>'),
    "empty.html": html('<main></main>'),
    "withfills.html": html('<main id="m" slot="nowhere" class="k"><p>Body</p><aside slot="side">Side</aside><b slot="other">Other</b></main>', ' data-layout="/_fills.html"'),
    "plain.html": html('<p>Only text</p>'),
  });
  const result = await build(tmp, []);
  expect(bodyOf(read(tmp))).toBe('<header>Shared header</header><nav aria-label="Section">Section navigation</nav><main id="content" class="article"><h1>Example</h1></main><script src="/assets/page.js" defer></script><footer>Shared footer</footer>');
  // A kept main is default content: even an empty one suppresses the fallback.
  expect(bodyOf(read(tmp, "empty.html"))).toBe('<header>Shared header</header><main></main><footer>Shared footer</footer>');
  expect(bodyOf(read(tmp, "plain.html"))).toBe('<header>Shared header</header><p>Only text</p><footer>Shared footer</footer>');
  // A fill inside the kept main still reaches its slot; an unmatched slot name is consumed with A02.
  const filled = bodyOf(read(tmp, "withfills.html"));
  expect(filled).toContain('<main id="m" class="k"><p>Body</p><b>Other</b></main>');
  expect(filled).toContain('<div class="side"><aside>Side</aside></div>');
  expect(filled).not.toContain('slot="nowhere"');
  expect(result.stderr).toContain('no slot named "nowhere"');
  covers("MRG-22", "MRG-06", "MRG-07");
});

test("MRG-22: no page main, a sink-less layout and a Markdown page are unchanged", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<slot></slot>'),
    "nomain.html": html('<p>No main here</p>'),
    "plain/_layout.html": html(''),
    "plain/index.html": html('<main id="m"><p>Kept</p></main>'),
    "mdlayout/_layout.html": html('<main id="shell" class="s"><slot></slot></main>'),
    "mdlayout/post.md": "# Post\n\nBody\n",
    "mdlayout/raw.md": "# Raw\n\n<main id=\"mine\" class=\"raw\">\n\nBody\n\n</main>\n",
  });
  await build(tmp);
  expect(bodyOf(read(tmp, "nomain.html"))).toBe('<p>No main here</p>');
  expect(bodyOf(read(tmp, "plain/index.html"))).toBe('<main id="m"><p>Kept</p></main>');
  expect(bodyOf(read(tmp, "mdlayout/post.html"))).toMatch(/^<main id="shell" class="s">\s*<h1[^>]*>Post<\/h1>/);
  // Conversion adds no <main>; one the author wrote as raw HTML is an M like any other.
  expect(bodyOf(read(tmp, "mdlayout/raw.html"))).toMatch(/^<main id="mine" class="s raw">\s*<h1[^>]*>Raw<\/h1>\s*<p>Body<\/p>\s*<\/main>$/);
  covers("MRG-22");
});

test("MRG-22: a bare slot beside an unrelated layout main, and a named-slots-only layout, still unwrap and transfer nothing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<main id="layout" class="shell"><p>Layout content</p></main><slot></slot>'),
    "index.html": html('<main id="page" class="article"><h1>Example</h1></main>'),
    "named/_layout.html": html('<section id="layout"><slot name="a">A</slot></section><slot name="b">B</slot>'),
    "named/index.html": html('<main id="page" class="article"><p slot="a">Fill a</p><p slot="b">Fill b</p></main>'),
  });
  await build(tmp);
  const out = bodyOf(read(tmp));
  expect(out).toBe('<main id="layout" class="shell"><p>Layout content</p></main><h1>Example</h1>');
  expect(out.match(/<main/g)).toHaveLength(1);
  expect(bodyOf(read(tmp, "named/index.html"))).toBe('<section id="layout"><p>Fill a</p></section><p>Fill b</p>');
  covers("MRG-22", "MRG-06", "ATT-03");
});

test("ATT-04: named main fills and named elements containing a main keep the 0.11.17 behaviour beside a receiving main", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<slot name="content"></slot><main id="layout" class="shell"><slot></slot></main>'),
    "index.html": html('<main slot="content" id="named" class="n">Named</main><div slot="content"><main id="inner">Inner</main></div><main id="dflt" class="d">Default</main>'),
  });
  await build(tmp);
  expect(bodyOf(read(tmp))).toBe('<main id="named" class="n">Named</main>\n    <div><main id="inner">Inner</main></div><main id="dflt" class="shell d">Default</main>');
  covers("ATT-04", "MRG-21");
});

test("build, --dry-run and audit agree on a merged main", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": html('<main id="content"><slot></slot></main>'),
    "index.html": html('<main id="article"><h1>Hi</h1></main>'),
  });
  const dry = await runCli(["build", "--dry-run", "--strict"], tmp);
  expect(dry.exit, dry.stderr).toBe(0);
  const audit = await runCli(["audit"], tmp);
  expect(audit.exit, audit.stdout + audit.stderr).toBe(0);
  await build(tmp);
  expect(bodyOf(read(tmp))).toBe('<main id="article"><h1>Hi</h1></main>');
  // A page id replaces the layout main's: a skip link to the old id builds, and only audit reports it.
  writeTree(join(tmp, "site"), { "_layout.html": html('<a href="#content">Skip</a><main id="content"><slot></slot></main>') });
  expect((await runCli(["build", "--dry-run", "--strict"], tmp)).exit).toBe(0);
  const broken = await runCli(["audit"], tmp);
  expect(broken.exit).toBe(1);
  expect(broken.stdout + broken.stderr).toContain("#content");
  covers("ATT-04");
});
