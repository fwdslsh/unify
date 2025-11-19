---
title: "My First Blog Post"
description: "This is my first blog post using markdown"
---

<template data-slot="post-title">My First Blog Post</template>
<template data-slot="post-date">2024-01-15</template>

# Introduction

This is a markdown file with frontmatter. It demonstrates:

- Markdown processing
- Frontmatter extraction
- Auto-discovery of `blog/_layout.html`
- Named slots from markdown

## Features

The markdown is converted to HTML and wrapped in the blog layout. The frontmatter provides:

1. Page title
2. Meta description
3. Optional layout override (not used here)

## Code Example

```html
<include src="/components/card.html">
  <div data-slot="title">Card Title</div>
</include>
```

This content will be inserted into the `data-slot="content"` of the blog layout.
