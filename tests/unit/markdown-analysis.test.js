import { expect, test } from "bun:test";
import { analyzeMarkdown } from "../../markdown.js";

test("Markdown analysis shares conversion IDs and reads authored HTML headings", () => {
  expect(analyzeMarkdown(`---
title: Not a heading
---
# Guide

## Café *menü* &amp; \`code\`

## Setup

## Setup 1

## Setup

<h2 id="manual">Raw <em>HTML</em> &amp; text</h2>

<h3>Without ID</h3>

Setext
------

> ### Quoted

- #### Nested

\`\`\`md
## Not a heading
\`\`\`
`).headings).toEqual([
    { level: 1, id: "guide", text: "Guide" },
    { level: 2, id: "café-menü--code", text: "Café menü & code" },
    { level: 2, id: "setup", text: "Setup" },
    { level: 2, id: "setup-1", text: "Setup 1" },
    { level: 2, id: "setup-2", text: "Setup" },
    { level: 2, id: "manual", text: "Raw HTML & text" },
    { level: 3, id: null, text: "Without ID" },
    { level: 2, id: "setext", text: "Setext" },
    { level: 3, id: "quoted", text: "Quoted" },
    { level: 4, id: "nested", text: "Nested" },
  ]);
});

test("Markdown analysis is repeatable and does not share returned state", () => {
  const source = "## Setup\n\n## Setup\n";
  const first = analyzeMarkdown(source);
  first.headings[0].id = "changed";
  first.headings.push({ level: 2, id: "injected", text: "Injected" });
  expect(analyzeMarkdown(source)).toEqual({ headings: [
    { level: 2, id: "setup", text: "Setup" },
    { level: 2, id: "setup-1", text: "Setup" },
  ] });
  expect(analyzeMarkdown("")).toEqual({ headings: [] });
  expect(analyzeMarkdown("Plain text\n")).toEqual({ headings: [] });
});

test("Markdown analysis keeps conversion and document-text distinctions", () => {
  expect(analyzeMarkdown(`## ![Alt *text*](image.png) &amp;lt;

<h2 id="a&amp;b"> A&#32;&#32;B <code>&lt;code&gt;</code></h2>

## !!!

## !!!

<h2 id="setup">Explicit ID</h2>

## Setup
`).headings).toEqual([
    { level: 2, id: "alt-text-lt", text: "&lt;" },
    { level: 2, id: "a&b", text: "A B <code>" },
    { level: 2, id: null, text: "!!!" },
    { level: 2, id: "-1", text: "!!!" },
    { level: 2, id: "setup", text: "Explicit ID" },
    { level: 2, id: "setup", text: "Setup" },
  ]);
});

test("Markdown analysis scopes authored main and leaves includes unresolved", () => {
  expect(analyzeMarkdown(`<h2 id="outside">Outside</h2>

<main>
<h2 id="inside">Inside</h2>
<include src="/_missing.md"></include>
<template><h2 id="template">Template</h2></template>
</main>

## After
`).headings).toEqual([{ level: 2, id: "inside", text: "Inside" }]);
});

test("Markdown analysis reports conversion problems without an internal reporter", () => {
  for (const value of [null, undefined, 1, {}, ["# Guide"]]) {
    expect(() => analyzeMarkdown(value)).toThrow(TypeError);
  }
  expect(() => analyzeMarkdown("---\ntitle: [broken\n---\n# Guide\n")).toThrow(SyntaxError);
  expect(() => analyzeMarkdown("---\ndraft: true\n---\n# Guide\n")).toThrow("Markdown line 2: draft has no meaning");
  expect(() => analyzeMarkdown("---\ntitle: Guide\n---\n<head>\n<title>Wrong</title>\n</head>\n")).toThrow("Markdown line 4: Markdown pages have no <head>");
  expect(analyzeMarkdown("# After error\n").headings).toEqual([
    { level: 1, id: "after-error", text: "After error" },
  ]);
});
