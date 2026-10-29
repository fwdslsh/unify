/** Named main fills and attributes on the actual default-content destination. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, covers, mkTmp, runCli, writeTree } from "./support.mjs";

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
  covers("MRG-21", "MRG-06", "MRG-07", "MRG-09", "ATT-04");
});

test("ATT-04: implicit main and main containing a bare slot share ordered attribute merging", async () => {
  for (const inner of ["fallback", '<p>Pinned</p><slot></slot><p>After</p>']) {
    const tmp = mkTmp();
    writeTree(join(tmp, "site"), {
      "_layout.html": page(`<main id="layout" class="shell shared" tabindex="-1" data-mode="layout" aria-label="Layout" hidden="hidden">${inner}</main>`),
      "index.html": page('<nav>Before</nav><main id="article" class="shared article" data-mode="page" aria-label=\'Read "Guide"\' hidden style=\'--label: "Hi"\'><h1>Guide</h1><a href="#article">Top</a></main><script>void 0;</script>'),
    });
    await build(tmp);
    const html = read(tmp);
    expect(html).toContain('<main id="article" class="shell shared article" tabindex="-1" data-mode="page" aria-label=\'Read "Guide"\' hidden style=\'--label: "Hi"\'>');
    expect(html).toContain('<nav>Before</nav><h1>Guide</h1><a href="#article">Top</a><script>void 0;</script>');
    expect(html.includes('<p>Pinned</p>')).toBe(inner !== "fallback");
    expect(html.includes('<p>After</p>')).toBe(inner !== "fallback");
  }
  covers("ATT-01", "ATT-02", "ATT-03", "ATT-04", "S11", "MRG-12", "MRG-13");
});

test("ATT-04: use the actual bare-slot ancestor, never an unrelated main", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<main id="unrelated" hidden>Other</main><slot></slot>'),
    "index.html": page('<main id="page" class="article"><h1>Guide</h1></main>'),
    "_second.html": page('<main id="first" hidden>Other</main><main id="second" class="shell"><div><slot></slot></div></main>'),
    "second.html": page('<main id="actual" class="article"><h1>Actual</h1></main>', ' data-layout="/_second.html"'),
  });
  const result = await build(tmp, []);
  expect(read(tmp)).toContain('<main id="unrelated" hidden>Other</main><h1>Guide</h1>');
  expect(read(tmp, "second.html")).toContain('<main id="first" hidden>Other</main><main id="actual" class="shell article"><div><h1>Actual</h1></div></main>');
  expect(result.stderr).toContain('duplicate <main>');
  covers("ATT-04", "MRG-05");
});

test("ATT-04: fallback-only main attributes remain the layout's; no page main changes nothing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<main id="layout" class="shell"><slot><p>Fallback</p></slot></main><slot name="aside"></slot>'),
    "index.html": page('<main id="empty" class="page"></main>'),
    "named.html": page('<main id="empty" class="page"><aside slot="aside">Aside</aside></main>'),
    "plain.html": page('<p>Plain</p>'),
  });
  await build(tmp);
  for (const file of ["index.html", "named.html"]) expect(read(tmp, file)).toContain('<main id="layout" class="shell"><p>Fallback</p></main>');
  expect(read(tmp, "named.html")).toContain('<aside>Aside</aside>');
  expect(read(tmp, "plain.html")).toContain('<main id="layout" class="shell"><p>Plain</p></main>');
  covers("ATT-04", "MRG-12");
});

test("MRG-21/ATT-04: included named markup and transferred attributes retain reference provenance", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<main></main><slot name="panel"></slot>'),
    "_parts/named.html": '<div slot="panel"><main hidden><img src="../image.svg" alt="Example"></main></div>',
    "image.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    "index.html": page('<include src="/_parts/named.html"></include><main id="guide"><h1>Guide</h1></main>'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<main hidden><img src="/image.svg" alt="Example"></main>');
  writeTree(join(tmp, "site"), {
    "_parts/main.html": '<main\n  id="guide"\n  style=\'--label: "Hi"; background: url(/missing.svg)\'><h1>Guide</h1></main>',
    "index.html": page('<include src="/_parts/main.html"></include>'),
  });
  const broken = await runCli(["build"], tmp);
  expect(broken.exit).toBe(1);
  expect(broken.stderr).toContain('_parts/main.html:3:');
  expect(broken.stderr).toContain('/missing.svg');
  covers("MRG-21", "ATT-04");
});


test("ATT-04: the tutorial's main-attribute example builds as shown", async () => {
  const doc = readFileSync(join(ROOT, "docs/getting-started.md"), "utf8");
  const bodies = [...doc.matchAll(/<!-- (?:Layout|Page|Built) body -->\n(<body>[\s\S]*?<\/body>)/g)].map((match) => match[1]);
  expect(bodies).toHaveLength(3);
  const tmp = mkTmp();
  const document = (body) => `<!doctype html><html><head><title>Guide</title></head>${body}</html>`;
  writeTree(join(tmp, "site"), { "_layout.html": document(bodies[0]), "index.html": document(bodies[1]) });
  await build(tmp);
  expect(read(tmp)).toContain(bodies[2]);
  covers("ATT-04");
});
