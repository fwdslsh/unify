---
description: "Open Graph defaults from page metadata, with shared site settings and explicit overrides."
---

# Social metadata from your page

**Unreleased behavior:** this guide describes native Open Graph completion in the development version. Unify 0.11.16 does not generate these defaults; on that release, author the tags explicitly as shown under overrides below.

Write a title and description once. Unify uses the final composed title for `og:title`, the final description for `og:description`, and the resolved canonical for `og:url`. No generator, extra configuration or browser script is needed. A page's explicit OG tags win; otherwise these derived values replace generic layout defaults. Missing source values leave layout fallbacks unchanged.

## Shared layout

`site/_layout.html` can keep the settings that really are shared:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>— Field Notes</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Field Notes">
  <meta property="og:image" content="/assets/social.png">
</head>
<body><main></main></body>
</html>
```

Add your image at `site/assets/social.png`. These shared tags can equally live in a head include. Avoid putting one page's canonical in the layout: every page would inherit that address.

## Pages

`site/about.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <title>Café &amp; code</title>
  <meta name="description" content="A &quot;small&quot; guide to &lt;good&gt; coffee &amp; code.">
</head>
<body><h1>Café &amp; code</h1><p>Bring a mug and something to make.</p></body>
</html>
```

`site/start.md`:

```md
---
title: Start here
description: Find your first workshop project.
---
# Start here

Choose something you would like to make.
```

Build from the project root:

```sh
unify build --pretty-urls --base-url https://example.com/notes/
```

The HTML page gets `og:title` of `Café & code — Field Notes`, its own description, and `og:url` of `https://example.com/notes/about/`. The Markdown page gets `Start here — Field Notes`, its own description, and `https://example.com/notes/start/`. The suffix is part of the final title; Unify does not guess which punctuation separates a site name. Both inherit the shared image at `https://example.com/notes/assets/social.png`. Escaping preserves quotes, ampersands and angle brackets as text.

## Overrides

To use different sharing copy, put explicit tags in the HTML page's head, directly or through a page-head include:

```html
<meta property="og:title" content="A different title for sharing">
<meta property="og:description" content="Coffee, code, and a place to start.">
<meta property="og:url" content="/about.html">
```

Or add these frontmatter fields to the Markdown page:

```yaml
og:title: Your next project starts here
og:description: Pick a project and follow along.
og:url: /start.md
```

Explicit page tags win even when their content is empty. Repeated page tags stay repeated, as with ordinary head merging. An override in a layout or layout-head include is a fallback; it does not prevent a page's final title, description or canonical supplying the corresponding value. Body metadata and tags inside `<template>` do not override the head.

No description means no generated `og:description`; no canonical means no generated `og:url`. Without `--base-url`, title and description still work. `--canonical none` disables automatic canonical creation, but an authored canonical can still supply `og:url`. No other Open Graph fields or Twitter tags are generated: author them if needed.

Audit and catalog read the same final metadata crawlers receive. The [source inventory](../integrations.md#source-facts-or-final-facts) remains source-only and does not contain these generated defaults. The executable examples and precedence cases are covered by `tests/conformance/social-metadata.test.js`.
