---
title: "Test Blog Post"
description: "A comprehensive test post for markdown processing validation"
author: "Test Author"
date: "2025-03-15"
tags: ["testing", "markdown", "ssg"]
head:
  - name: "keywords"
    content: "test, blog, markdown"
  - property: "og:type"
    content: "article"
  - property: "og:image"
    content: "/assets/blog-hero.jpg"
---

# Test Blog Post

This is a comprehensive test post for validating markdown processing capabilities in the Unify static site generator.

## Frontmatter Processing

The post includes extensive frontmatter with:
- Basic metadata (title, description, author, date)
- Tags array for categorization
- Head elements for SEO and social media

## Content Features

### Text Formatting

This post includes various **markdown features** including:

- *Italic text*
- **Bold text**  
- `Inline code`
- ~~Strikethrough text~~

### Lists

#### Unordered List
- First item
- Second item
  - Nested item
  - Another nested item
- Third item

#### Ordered List
1. First step
2. Second step
3. Third step

### Code Blocks

```javascript
function testFunction() {
  console.log("Testing markdown code highlighting");
  return "success";
}
```

### Links and Images

Here's a [link to the homepage](/) and an image:

![Test Image](/assets/test-image.jpg "Test image alt text")

### Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Frontmatter | ✅ | Working correctly |
| Code blocks | ✅ | Syntax highlighting |
| Tables | ✅ | Markdown tables |

### Blockquotes

> This is a blockquote that tests how the markdown processor handles quoted content.
> It can span multiple lines and should be properly formatted.

## Head Synthesis

The frontmatter should synthesize into proper HTML head elements:
- `<title>` from title field
- `<meta name="description">` from description
- Additional meta tags from head array
- Custom social media tags

This content will be processed through the markdown pipeline and should result in valid HTML output.