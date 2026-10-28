/** Public npm helper exercised by real generators and the packaged CLI. */
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, covers, mkTmp, writeTree } from "./support.mjs";

const DOC = readFileSync(join(ROOT, "docs/unreleased/markdown-analysis.md"), "utf8");
const TEST_MS = 30_000;

function literal(language, index = 0) {
  const blocks = [...DOC.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))];
  if (!blocks[index]) throw new Error(`Markdown analysis guide has no ${language} block ${index}`);
  return blocks[index][1];
}

async function run(cmd, cwd) {
  const proc = Bun.spawn({ cmd, cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(9), 25_000);
  try {
    const [stdout, stderr, exit] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    if (exit !== 0) throw new Error(`${cmd.join(" ")} exited ${exit}\n${stdout}\n${stderr}`);
    return stdout;
  } finally { clearTimeout(timer); }
}

let packagePromise;
function packedPackage() {
  return packagePromise ??= (async () => {
    const tmp = mkTmp();
    // A real pack, without lifecycle scripts or network installation. Tests
    // consume only the published files; missing files cannot hide behind a
    // symlink to the repository. Dependencies are already installed by CI.
    const [pack] = JSON.parse(await run([
      "npm", "pack", "--json", "--ignore-scripts", "--pack-destination", tmp,
      "--cache", join(tmp, "cache"),
    ], ROOT));
    expect(pack.files.some((file) => file.path === "markdown.js")).toBe(true);
    const packageRoot = join(tmp, "package");
    await run(["tar", "-xzf", join(tmp, pack.filename), "-C", tmp], ROOT);
    symlinkSync(join(ROOT, "node_modules"), join(packageRoot, "node_modules"));
    return packageRoot;
  })();
}

async function project() {
  const tmp = mkTmp();
  const packageRoot = await packedPackage();
  mkdirSync(join(tmp, "node_modules/@fwdslsh"), { recursive: true });
  symlinkSync(packageRoot, join(tmp, "node_modules/@fwdslsh/unify"));
  writeTree(tmp, { "site/guide.md": literal("markdown"), "scripts/toc.mjs": literal("js", 1) });
  return { tmp, cli: join(packageRoot, "src/cli.js") };
}

test("the literal Markdown TOC recipe builds from the npm package under Bun and Node", async () => {
  const { tmp, cli } = await project();
  const command = literal("sh", 1).trim();
  expect(command).toBe("npx unify build --generate ../scripts/toc.mjs --pretty-urls --strict");
  const flags = command.replace(/^npx unify /, "").split(" ");
  let bunHtml;
  for (const [runtime, name] of [[process.execPath, "bun"], ["node", "node"]]) {
    await run([runtime, cli, ...flags, "-o", name, "--base-url", "https://example.com/docs/"], tmp);
    const html = readFileSync(join(tmp, name, "guide/index.html"), "utf8");
    expect(html).toContain('<nav aria-label="On this page"><ul><li><a href="#setup">Setup</a></li><li><a href="#everyday-use">Everyday use</a></li></ul></nav>');
    expect(html).toContain('<h2 id="setup">Setup</h2>');
    expect(html).toContain('<h2 id="everyday-use">Everyday use</h2>');
    expect(html).not.toContain("<include");
    if (name === "bun") bunHtml = html;
    else expect(html).toBe(bunHtml);
  }
  // Rerun the same consumer after an author edit: no stale heading entries.
  writeFileSync(join(tmp, "site/guide.md"), literal("markdown").replace("## Setup", "## Installation"));
  await run(["node", cli, ...flags], tmp);
  const changed = readFileSync(join(tmp, "dist/guide/index.html"), "utf8");
  expect(changed).toContain('href="#installation"');
  expect(changed).not.toContain('href="#setup"');
}, TEST_MS);

test("the helper's outline matches the CLI catalog before composition adds headings", async () => {
  const { tmp, cli } = await project();
  writeTree(tmp, {
    "site/guide.md": `---
title: Guide
description: A guide.
---
# Guide

<include src="/_generated/guide-toc.html"></include>

## Café *menü* &amp; \`code\`

## Setup

## Setup 1

## Setup

<h2 id="hand&amp;authored">Raw <em>HTML</em> &amp; text</h2>

<h3>Without ID</h3>

Setext
------

> ### Quoted

\`\`\`md
## Fenced text
\`\`\`
`,
    "scripts/toc.mjs": literal("js", 1) + '\nwriteFileSync(join(overlay, "outline.json"), JSON.stringify(headings));\n',
  });
  await run(["node", cli, "build", "--generate", "../scripts/toc.mjs", "--catalog", "--strict"], tmp);
  const outline = JSON.parse(readFileSync(join(tmp, "dist/outline.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(join(tmp, "dist/assets/unify/catalog.json"), "utf8"));
  expect(outline).toEqual(catalog.pages[0].body.headings);
  expect(outline.find((h) => h.id === "hand&authored")).toEqual({ level: 2, id: "hand&authored", text: "Raw HTML & text" });
  const html = readFileSync(join(tmp, "dist/guide.html"), "utf8");
  expect(html).toContain('href="#caf%C3%A9-men%C3%BC--code"');
  expect(html).toContain('href="#hand%26authored"');
  expect(html).toContain('<h2 id="setup-2">Setup</h2>');
  expect(outline.some((h) => h.text === "Fenced text")).toBe(false);

  writeTree(join(tmp, "site"), {
    "_layout.html": '<!doctype html><html><head><meta charset="utf-8"></head><body><main><h2 id="layout-heading">Layout</h2><slot></slot><include src="/_includes/extra.md"></include></main></body></html>',
    "_includes/extra.md": "## Included heading\n",
  });
  await run(["node", cli, "build", "--generate", "../scripts/toc.mjs", "--catalog", "--strict"], tmp);
  const after = JSON.parse(readFileSync(join(tmp, "dist/assets/unify/catalog.json"), "utf8"));
  expect(after.pages[0].body.headings).toEqual([
    { level: 2, id: "layout-heading", text: "Layout" },
    ...outline,
    { level: 2, id: "included-heading", text: "Included heading" },
  ]);
  expect(JSON.parse(readFileSync(join(tmp, "dist/outline.json"), "utf8"))).toEqual(outline);
  covers("MD-23", "MD-16");
}, TEST_MS);

test("helper errors fail the real generator without replacing the last good output", async () => {
  const { tmp, cli } = await project();
  const flags = [cli, "build", "--generate", "../scripts/toc.mjs", "--strict"];
  await run(["node", ...flags], tmp);
  const before = readFileSync(join(tmp, "dist/guide.html"), "utf8");
  const cases = [
    { source: null, error: "TypeError: analyzeMarkdown source must be a string" },
    { source: "---\ntitle: [broken\n---\n# Guide\n", error: "SyntaxError: Markdown line" },
    { source: "---\ndraft: true\n---\n# Guide\n", error: "SyntaxError: Markdown line 2: draft has no meaning" },
    { source: "---\ntitle: Guide\n---\n<head>\n</head>\n", error: "SyntaxError: Markdown line 4: Markdown pages have no <head>" },
  ];
  for (const { source, error } of cases) {
    writeFileSync(join(tmp, "scripts/toc.mjs"), `import { analyzeMarkdown } from "@fwdslsh/unify/markdown.js";\nanalyzeMarkdown(${JSON.stringify(source)});\n`);
    await expect(run(["node", ...flags], tmp)).rejects.toThrow(error);
    expect(readFileSync(join(tmp, "dist/guide.html"), "utf8")).toBe(before);
  }
  covers("MD-23");
}, TEST_MS);
