/** Native OG defaults (§22.6), including the guide's literal examples. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, covers, mkTmp, runCli, writeTree } from "./support.mjs";

const DOC = readFileSync(join(ROOT, "docs/guides/social-metadata.md"), "utf8");
function block(heading, language) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  const end = DOC.indexOf("\n## ", start + 1);
  const section = DOC.slice(start, end < 0 ? DOC.length : end);
  const match = section.match(new RegExp("```" + language + "\\n([\\s\\S]*?)```"));
  if (!match) throw new Error(`missing ${language} block in ${heading}`);
  return match[1];
}
const page = (head, body = "<h1>Page</h1>") => `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>${body}</body></html>`;
const read = (tmp, path) => readFileSync(join(tmp, "dist", path), "utf8");
async function build(tmp, args = []) {
  const result = await runCli(["build", ...args], tmp);
  if (result.exit !== 0) throw new Error(result.stdout + result.stderr);
}
function meta(html, key, value) {
  expect(html.match(new RegExp(`<meta property="${key}"[^>]*>`, "gi"))).toHaveLength(1);
  expect(html).toContain(`<meta property="${key}" content="${value}">`);
}

test("OG-01: guide examples derive final HTML/Markdown metadata; catalog and audit observe it, inventory does not", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": block("Shared layout", "html"),
    "about.html": block("Pages", "html"), "start.md": block("Pages", "md"),
    "assets/social.png": Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=", "base64"),
  });
  const args = block("Pages", "sh").trim().slice("unify build ".length).split(" ");
  writeTree(join(tmp, "scripts"), { "inventory.mjs": 'import {copyFileSync,readFileSync} from "node:fs";import{join}from"node:path";const c=JSON.parse(readFileSync(process.argv[4],"utf8"));copyFileSync(c.inputs.sourcePages,join(process.argv[3],"source-facts.json"));' });
  await build(tmp, [...args, "--catalog", "--generate", "../scripts/inventory.mjs"]);
  const html = read(tmp, "about/index.html");
  meta(html, "og:title", "Café &amp; code — Field Notes");
  meta(html, "og:description", "A &quot;small&quot; guide to &lt;good&gt; coffee &amp; code.");
  meta(html, "og:url", "https://example.com/notes/about/");
  meta(read(tmp, "start/index.html"), "og:title", "Start here — Field Notes");
  meta(html, "og:image", "https://example.com/notes/assets/social.png");
  expect(html).not.toContain("twitter:");
  const catalog = JSON.parse(read(tmp, "assets/unify/catalog.json"));
  const about = catalog.pages.find((item) => item.path === "/notes/about/");
  expect(about.head.meta).toContainEqual({ property: "og:title", content: "Café & code — Field Notes" });
  const source = JSON.parse(read(tmp, "source-facts.json")).pages.find((item) => item.source === "about.html");
  expect(source.title).toBe("Café & code");
  expect(source.meta.some((item) => item.property?.startsWith("og:"))).toBe(false);
  const audit = await runCli(["audit", ...args, "--format", "json"], tmp);
  expect(JSON.parse(audit.stdout).pages.find((item) => item.document.path === "/notes/about/").document.head.meta).toContainEqual({ property: "og:url", content: "https://example.com/notes/about/" });
  covers("OG-01");
}, 30_000);

test("OG-02: page-head includes and Markdown override layout fallbacks; empty and repeated page tags remain", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<title>— Site</title><include src="/_fallback.html"></include>', '<main></main>'),
    "_fallback.html": '<meta property="og:title" content="Generic"><meta property="og:description" content="Generic description"><meta property="og:url" content="https://fallback.example/">',
    "_override.html": block("Overrides", "html") + '<meta property="og:title" content="Second title">',
    "about.html": page('<title>About</title><meta name="description" content="About description"><include src="/_override.html"></include>'),
    'encoded.html': page('<title>Encoded</title><meta property=" OG:ti&#116;le " content="Encoded override">'),
    "mixed.html": page('<title>Mixed</title><meta name="sharing" property="og:title" content="Mixed override">'),
    "empty.html": page('<title>Empty</title><meta property="og:title" content=""><meta property="og:description">'),
    "derived.html": page('<title>Derived</title><meta name="description" content="Derived description">', '<h1>Derived</h1><meta property="og:title" content="Body"><template><meta property="og:description" content="Inert"></template>'),
    "start.md": block("Pages", "md").replace('title: Start here', 'title: Start here\n' + block("Overrides", "yaml").trim()),
  });
  await build(tmp, ["--base-url", "https://example.com/notes/", "--pretty-urls"]);
  const about = read(tmp, "about/index.html");
  expect(about.match(/property="og:title"/g)).toHaveLength(2);
  expect(about).toContain('content="A different title for sharing"');
  expect(about).toContain('content="Second title"');
  expect(about).not.toContain('content="Generic"');
  meta(read(tmp, "start/index.html"), "og:title", "Your next project starts here");
  const encoded = read(tmp, "encoded/index.html");
  expect(encoded).toContain('<meta property=" OG:ti&#116;le " content="Encoded override">');
  expect(encoded).not.toContain('content="Generic"');
  const mixed = read(tmp, "mixed/index.html");
  expect(mixed.match(/property="og:title"/g)).toHaveLength(1);
  expect(mixed).toContain('<meta name="sharing" property="og:title" content="Mixed override">');
  const empty = read(tmp, "empty/index.html");
  meta(empty, "og:title", "");
  expect(empty).toContain('<meta property="og:description">');
  const derived = read(tmp, "derived/index.html");
  expect(derived).toContain('<meta property="og:title" content="Derived — Site">');
  expect(derived).toContain('<meta property="og:description" content="Derived description">');
  expect(derived).toContain('content="Body"');
  covers("OG-02");
}, 30_000);

test("OG-03: canonical modes, absent sources, no head, and replacements preserve reference provenance", async () => {
  for (const args of [[], ["--canonical", "none"], ["--canonical", "none", "--base-url", "https://example.com/sub/", "--pretty-urls"]]) {
    const tmp = mkTmp();
    writeTree(join(tmp, "site"), {
      "about.html": page('<title>About</title>'),
      "authored.html": page('<title>Authored</title><link rel="canonical" href="/about.html">'),
      "bare.html": '<h1>No head</h1>',
    });
    await build(tmp, args);
    const pretty = args.includes("--pretty-urls");
    const html = read(tmp, pretty ? "about/index.html" : "about.html");
    meta(html, "og:title", "About");
    expect(html).not.toContain('property="og:description"');
    expect(html).not.toContain('property="og:url"');
    meta(read(tmp, pretty ? "authored/index.html" : "authored.html"), "og:url", pretty ? "https://example.com/sub/about/" : "/about.html");
    expect(read(tmp, pretty ? "bare/index.html" : "bare.html")).toBe('<h1>No head</h1>');
  }
  const edge = mkTmp();
  const fallbacks = '<meta property="og:title" content="Fallback"><meta property="og:title" content="Second fallback"><meta property="og:description" content="Description fallback"><meta property="og:url" content="https://fallback.example/">';
  const crlf = page('<title>Windows</title>').replaceAll("\n", "\r\n");
  const unterminated = '<html><head><title>Unclosed head</title>';
  writeTree(join(edge, "site"), {
    "_fallback-layout.html": page(fallbacks, "<main></main>"),
    "fallback.html": page('<title> </title><meta name="description" content=" ">').replace('<html ', '<html data-layout="/_fallback-layout.html" '),
    "crlf.html": crlf, "unterminated.html": unterminated,
    "hidden.html": page('<title>Hidden</title><meta name="robots" content="noindex">'),
    "404.html": page('<title>Missing</title>'),
  });
  await build(edge, ["--base-url", "https://example.com/", "--canonical", "none"]);
  expect(read(edge, "fallback.html")).toContain(fallbacks);
  expect(read(edge, "crlf.html")).toBe(crlf.replace('</head>', '<meta property="og:title" content="Windows">\r\n</head>'));
  expect(read(edge, "unterminated.html")).toBe(unterminated);
  await build(edge, ["--base-url", "https://example.com/"]);
  for (const [path, title] of [["hidden.html", "Hidden"], ["404.html", "Missing"]]) {
    const html = read(edge, path);
    meta(html, "og:title", title);
    expect(html).not.toContain('property="og:url"');
  }
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page('<title>— Site</title>\n<meta property="og:title" content="A very long inherited fallback that will shrink">\n<meta property="og:title" content="Other fallback">\n<meta property="og:description" content="X">\n<meta name="schema" content="WebPage">', '<main></main>'),
    "about.html": page('<title>A</title><meta name="description" content="Longer description">', '<h1>A</h1>\n<include src="/_broken.html"></include>'),
    "_broken.html": '<p>Keep location</p>\n<a href="/missing.html">Missing</a>',
  });
  const result = await runCli(["build", "--base-url", "https://example.com/"], tmp);
  expect(result.exit).toBe(1);
  expect(result.stderr + result.stdout).toContain("_broken.html:2:");
  covers("OG-03");
}, 30_000);
