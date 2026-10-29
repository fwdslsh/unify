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
  expect(html).toContain('<main id="layout" class="shell"><div class="wrap"><p>Default</p>');
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
  expect(read(tmp)).toContain('<main id="content">\n<h1>Changed</h1></main>Fallback');
  const normal = await build(tmp, []);
  expect(normal.stderr).toContain('no slot named "asdie"');
  expect(read(tmp)).toContain('<main id="content">\n<h1>Changed</h1></main>Fallback');
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

test("MRG-06/ATT-03: default main unwrapping keeps the layout's attributes and bare-slot behavior", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<a href="#content">Skip</a><main id="content" class="shell"><slot></slot></main>'),
    "index.html": page('<main id="guide" class="article" hidden><h1>Guide</h1></main>'),
    "_bare.html": page('<slot></slot>'),
    "bare.html": page('<nav>Before</nav><main id="guide" class="article"><h1>Guide</h1></main>', ' data-layout="/_bare.html"'),
    "empty.html": page('<main slot=""><p>Empty name</p></main>'),
  });
  await build(tmp);
  expect(read(tmp)).toContain('<a href="#content">Skip</a><main id="content" class="shell"><h1>Guide</h1></main>');
  expect(read(tmp, "bare.html")).toContain('<body><nav>Before</nav><h1>Guide</h1></body>');
  expect(read(tmp, "empty.html")).toContain('<main id="content" class="shell"><p>Empty name</p></main>');
  covers("MRG-06", "ATT-03");
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
  expect(read(tmp)).toContain('<body><h1>Guide</h1><p>Page aside</p></body>');
  expect(read(tmp, "include.html")).toContain('<main class="article"><p slot="aside">Inner aside</p><h1>Guide</h1></main>Include fallback');
});
