import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../../src/core/file-processor.js";

describe("Frontmatter Head Synthesis (Markdown)", () => {
  const testDir = "/tmp/frontmatter-head-test";
  const sourceDir = join(testDir, "src");
  const outputDir = join(testDir, "dist");

  beforeAll(async () => {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(join(sourceDir, "_includes"), { recursive: true });

    // Create a simple layout
    await writeFile(
      join(sourceDir, "_includes", "layout.html"),
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Basic Title and Description", () => {
    test("should synthesize title from frontmatter", async () => {
      await writeFile(
        join(sourceDir, "title-test.md"),
        `---
title: "Frontmatter Title"
---

# Markdown Content

This is the content.`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "title-test.html")).text();

      expect(output).toContain("<title>Frontmatter Title</title>");
    });

    test("should synthesize meta description from frontmatter", async () => {
      await writeFile(
        join(sourceDir, "description-test.md"),
        `---
title: "Test Page"
description: "This is a test page description"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "description-test.html")).text();

      expect(output).toContain('<meta name="description" content="This is a test page description"');
    });
  });

  describe("head.meta Array Support", () => {
    test("should synthesize meta tags from head.meta array", async () => {
      await writeFile(
        join(sourceDir, "meta-array-test.md"),
        `---
title: "Meta Array Test"
head:
  meta:
    - name: robots
      content: "index,follow"
    - property: og:title
      content: "Open Graph Title"
    - name: author
      content: "John Doe"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "meta-array-test.html")).text();

      expect(output).toContain('<meta name="robots" content="index,follow"');
      expect(output).toContain('<meta property="og:title" content="Open Graph Title"');
      expect(output).toContain('<meta name="author" content="John Doe"');
    });
  });

  describe("head.link Array Support", () => {
    test("should synthesize link tags from head.link array", async () => {
      await writeFile(
        join(sourceDir, "link-array-test.md"),
        `---
title: "Link Array Test"
head:
  link:
    - rel: canonical
      href: "https://example.com/page"
    - rel: preload
      as: image
      href: "/hero.avif"
    - rel: alternate
      type: "application/rss+xml"
      href: "/feed.xml"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "link-array-test.html")).text();

      expect(output).toContain('<link rel="canonical" href="https://example.com/page"');
      expect(output).toContain('<link rel="preload" as="image" href="/hero.avif"');
      expect(output).toContain('<link rel="alternate" type="application/rss+xml" href="/feed.xml"');
    });
  });

  describe("head.script Array Support", () => {
    test("should synthesize external script tags from head.script array", async () => {
      await writeFile(
        join(sourceDir, "script-external-test.md"),
        `---
title: "External Script Test"
head:
  script:
    - src: "/js/analytics.js"
      defer: true
    - src: "/js/app.js"
      async: true
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "script-external-test.html")).text();

      expect(output).toContain('<script src="/js/analytics.js" defer="true"');
      expect(output).toContain('<script src="/js/app.js" async="true"');
    });

    test("should synthesize JSON-LD script from head.script with json key", async () => {
      await writeFile(
        join(sourceDir, "script-jsonld-test.md"),
        `---
title: "JSON-LD Test"
head:
  script:
    - type: "application/ld+json"
      json:
        "@context": "https://schema.org"
        "@type": "Article"
        headline: "Getting Started"
        author:
          "@type": "Person"
          name: "John Doe"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "script-jsonld-test.html")).text();

      expect(output).toContain('<script type="application/ld+json">');
      expect(output).toContain('"@context":"https://schema.org"');
      expect(output).toContain('"@type":"Article"');
      expect(output).toContain('"headline":"Getting Started"');
    });
  });

  describe("head.style Array Support", () => {
    test("should synthesize inline styles from head.style with inline key", async () => {
      await writeFile(
        join(sourceDir, "style-inline-test.md"),
        `---
title: "Inline Style Test"
head:
  style:
    - inline: |
        .hero {
          contain: paint;
          background: blue;
        }
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "style-inline-test.html")).text();

      expect(output).toContain("<style>");
      expect(output).toContain(".hero");
      expect(output).toContain("contain: paint");
    });

    test("should synthesize stylesheet link from head.style with href key", async () => {
      await writeFile(
        join(sourceDir, "style-link-test.md"),
        `---
title: "Style Link Test"
head:
  style:
    - href: "/css/print.css"
      media: "print"
    - href: "/css/mobile.css"
      media: "(max-width: 600px)"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "style-link-test.html")).text();

      expect(output).toContain('<link rel="stylesheet" href="/css/print.css" media="print"');
      expect(output).toContain('<link rel="stylesheet" href="/css/mobile.css" media="(max-width: 600px)"');
    });
  });

  describe("Combined Frontmatter Head", () => {
    test("should synthesize all head elements together", async () => {
      await writeFile(
        join(sourceDir, "combined-test.md"),
        `---
title: "Combined Test"
description: "Test page with all head elements"
head:
  meta:
    - name: robots
      content: "noindex"
    - property: og:type
      content: "article"
  link:
    - rel: canonical
      href: "https://example.com/combined"
  script:
    - src: "/js/app.js"
    - type: "application/ld+json"
      json:
        "@type": "WebPage"
  style:
    - inline: ".custom { color: red; }"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "combined-test.html")).text();

      // Check all elements are present
      expect(output).toContain("<title>Combined Test</title>");
      expect(output).toContain('content="Test page with all head elements"');
      expect(output).toContain('name="robots"');
      expect(output).toContain('property="og:type"');
      expect(output).toContain('rel="canonical"');
      expect(output).toContain('src="/js/app.js"');
      expect(output).toContain('application/ld+json');
      expect(output).toContain('.custom { color: red; }');
    });
  });

  describe("Head Merge with Layout", () => {
    test("should merge frontmatter head with layout head", async () => {
      await writeFile(
        join(sourceDir, "_includes", "blog-layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/blog.css">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "merge-test.md"),
        `---
layout: blog-layout
title: "Merged Head Test"
description: "Testing head merge"
head:
  meta:
    - name: author
      content: "Jane Doe"
  link:
    - rel: canonical
      href: "https://example.com/merge"
---

# Content`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "merge-test.html")).text();

      // Should have both layout and page head elements
      expect(output).toContain('charset="UTF-8"');
      expect(output).toContain('name="viewport"');
      expect(output).toContain('href="/blog.css"');
      expect(output).toContain("<title>Merged Head Test</title>");
      expect(output).toContain('content="Testing head merge"');
      expect(output).toContain('name="author"');
      expect(output).toContain('rel="canonical"');
    });
  });
});
