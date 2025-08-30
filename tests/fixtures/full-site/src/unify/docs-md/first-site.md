---
title: Your First Site - unify Documentation
description: Step-by-step tutorial for creating your first unify static site. Learn DOM Cascade basics, layouts, and components through a practical example.
---

# Your First Site

This tutorial walks you through creating your first unify static site from scratch. You'll learn the DOM Cascade fundamentals by building a complete website with layouts, components, and pages.

> **🎯 What You'll Learn**
>
> DOM Cascade area targeting, layout composition, component creation, and the complete build-to-deploy workflow.

## Prerequisites

Before starting, ensure you have unify installed. If not, see the [Installation Guide](/unify/docs/installation).

```bash
# Verify unify is installed
unify --version
```

## Step 1: Project Setup

Create a new directory for your first site and set up the basic structure:

```bash
# Create project directory
mkdir my-first-site
cd my-first-site

# Create directory structure
mkdir src src/_includes src/assets src/assets/css src/assets/images
```

Your project structure should look like this:

```text
my-first-site/
├── src/
│   ├── _includes/
│   └── assets/
│       ├── css/
│       └── images/
```

## Step 2: Create Your First Layout

Layouts define the overall structure of your pages. Create a base layout with public areas that pages can target:

```html
# src/_includes/_layout.html
<!DOCTYPE html>
<html lang="en">
<head>
  <style data-unify-docs="v1">
    /* Public areas that pages can target */
    .unify-header {
      /* Site header area - navigation, logo */
    }
    .unify-content {
      /* Main content area - page content goes here */
    }
    .unify-sidebar {
      /* Optional sidebar - additional content */
    }
    .unify-footer {
      /* Site footer - links, copyright */
    }
  </style>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My First Site</title>
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  <header class="unify-header">
    <h1>My Site</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/about.html">About</a>
      <a href="/contact.html">Contact</a>
    </nav>
  </header>

  <main class="unify-content">
    <p>Default content - this will be replaced by page content</p>
  </main>

  <aside class="unify-sidebar">
    <h3>Sidebar</h3>
    <p>Default sidebar content</p>
  </aside>

  <footer class="unify-footer">
    <p>&copy; 2024 My First Site. Built with unify.</p>
  </footer>
</body>
</html>
```

> **🔍 Key Concept: data-unify-docs**
>
> The `<style data-unify-docs="v1">` block documents the public areas this layout exposes. This is removed during build but helps page authors understand what areas they can target.

## Step 3: Create Basic CSS

Add some basic styling to make your site look good:

```css
# src/assets/css/style.css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #f9f9f9;
}

header {
  background: #2c3e50;
  color: white;
  padding: 1rem 0;
}

header h1 {
  display: inline-block;
  margin-left: 2rem;
}

nav {
  display: inline-block;
  float: right;
  margin-right: 2rem;
}

nav a {
  color: white;
  text-decoration: none;
  margin-left: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background 0.3s;
}

nav a:hover {
  background: rgba(255, 255, 255, 0.1);
}

main {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 2rem;
}

aside {
  max-width: 800px;
  margin: 1rem auto;
  padding: 0 2rem;
}

footer {
  text-align: center;
  padding: 2rem;
  color: #666;
  border-top: 1px solid #eee;
  margin-top: 2rem;
}
```

## Step 4: Create Your Homepage

Now create your first page that uses the layout. This demonstrates DOM Cascade area targeting:

```html
# src/index.html
<head>
  <title>Home - My First Site</title>
  <meta name="description" content="Welcome to my first unify static site">
</head>

<body data-unify="/_includes/_layout.html">
  <!-- Target the unify-content area -->
  <main class="unify-content">
    <h1>Welcome to My First Site!</h1>
    <p>This is my homepage built with unify. The content you're reading now replaces the default content from the layout because it targets the <code>.unify-content</code> area.</p>
    
    <h2>What is DOM Cascade?</h2>
    <p>DOM Cascade is unify's composition system. Pages target specific areas in layouts using CSS classes. The layout defines areas like <code>.unify-header</code> and <code>.unify-content</code>, and pages provide content for those areas.</p>
    
    <h2>Features</h2>
    <ul>
      <li>✨ Zero JavaScript frameworks required</li>
      <li>🚀 Fast builds with Bun</li>
      <li>🔄 Live development server</li>
      <li>📱 Works everywhere - pure HTML/CSS output</li>
    </ul>
  </main>

  <!-- Target the unify-sidebar area -->
  <aside class="unify-sidebar">
    <h3>Quick Links</h3>
    <ul>
      <li><a href="/about.html">About This Site</a></li>
      <li><a href="/contact.html">Get in Touch</a></li>
    </ul>
    
    <h3>Latest News</h3>
    <p>🎉 Site launched with unify!</p>
  </aside>
</body>
```

> **🎯 DOM Cascade in Action**
>
> Notice how the page provides content for `.unify-content` and `.unify-sidebar` but not `.unify-header` or `.unify-footer`. Those areas will use the default content from the layout.

## Step 5: Add More Pages

Create an about page to demonstrate consistent layout usage:

```html
# src/about.html
<head>
  <title>About - My First Site</title>
  <meta name="description" content="Learn about this unify-powered website">
</head>

<body data-unify="/_includes/_layout.html">
  <main class="unify-content">
    <h1>About This Site</h1>
    <p>This website is built with **unify**, a modern static site generator that uses DOM Cascade for composition.</p>
    
    <h2>Why unify?</h2>
    <p>I chose unify because:</p>
    <ul>
      <li>No complex templating languages to learn</li>
      <li>Standard HTML and CSS</li>
      <li>Fast builds with Bun</li>
      <li>Predictable composition behavior</li>
    </ul>
    
    <h2>Technical Details</h2>
    <p>This site uses:</p>
    <ul>
      <li>DOM Cascade for layout composition</li>
      <li>Public areas with <code>.unify-*</code> classes</li>
      <li>Head merging for metadata</li>
      <li>Automatic asset copying</li>
    </ul>
  </main>
</body>
```

## Step 6: Build Your Site

Now build your site and see the DOM Cascade in action:

```bash
# Build the site
unify build --source src --output dist

# Expected output:
# ✅ Build completed successfully!
# 📁 2 files processed
# 📦 1 assets copied
```

Check the generated files:

```bash
# View the generated homepage
cat dist/index.html

# Notice how:
# - Layout and page head elements are merged
# - Page content replaced layout's default .unify-content
# - Layout's .unify-header and .unify-footer are preserved
# - data-unify attributes are removed
```

## Step 7: Development Server

Start the development server for live editing:

```bash
# Start development server
unify serve --source src --port 3000

# Output:
# 🚀 Server running at http://localhost:3000
# 👀 Watching for changes...
```

Open `http://localhost:3000` in your browser. Try editing the homepage content and watch it reload automatically!

## Step 8: Create a Component

Let's add a reusable component to demonstrate component composition:

```html
# src/_includes/card.html
<div class="card">
  <style data-unify-docs="v1">
    /* This component exposes these areas */
    .unify-card-header { /* Card header area */ }
    .unify-card-content { /* Card content area */ }
  </style>
  
  <div class="unify-card-header">
    <h3>Default Card Title</h3>
  </div>
  
  <div class="unify-card-content">
    <p>Default card content</p>
  </div>
</div>
```

Add CSS for the card:

```css
# Add to src/assets/css/style.css
.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card h3 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}
```

Use the component in your homepage:

```html
# Add to src/index.html (inside .unify-content)
<h2>Featured Content</h2>

<div data-unify="/_includes/card.html">
  <div class="unify-card-header">
    <h3>🚀 Getting Started Guide</h3>
  </div>
  <div class="unify-card-content">
    <p>Learn how to build static sites with unify's DOM Cascade system. Perfect for beginners!</p>
    <a href="/about.html">Read More →</a>
  </div>
</div>
```

## Step 9: Understanding the Build Output

Let's examine what unify generated to understand DOM Cascade:

```html
# The built index.html will contain:

<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Head merge: layout + page head combined -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Home - My First Site</title> <!-- Page wins -->
  <meta name="description" content="Welcome to my first unify static site">
  <link rel="stylesheet" href="/assets/css/style.css">
  <!-- data-unify-docs blocks removed -->
</head>
<body>
  <!-- Layout header preserved (page didn't target it) -->
  <header class="unify-header">
    <h1>My Site</h1>
    <nav>...</nav>
  </header>

  <!-- Page content replaced layout default -->
  <main class="unify-content">
    <h1>Welcome to My First Site!</h1>
    <!-- Page content here -->
    
    <!-- Component inlined and composed -->
    <div class="card">
      <div class="unify-card-header">
        <h3>🚀 Getting Started Guide</h3>
      </div>
      <div class="unify-card-content">
        <p>Learn how to build...</p>
      </div>
    </div>
  </main>

  <!-- Page sidebar replaced layout default -->
  <aside class="unify-sidebar">
    <h3>Quick Links</h3>
    <!-- Page sidebar content -->
  </aside>

  <!-- Layout footer preserved (page didn't target it) -->
  <footer class="unify-footer">
    <p>&copy; 2024 My First Site. Built with unify.</p>
  </footer>
</body>
</html>
```

## Congratulations! 🎉

You've successfully created your first unify static site and learned the core concepts:

> **✅ What You've Learned**
>
> - **DOM Cascade**: How layouts expose areas and pages target them
> - **Public Areas**: Using `.unify-*` classes for composition
> - **Documentation**: `data-unify-docs` blocks for area contracts
> - **Head Merging**: How layout and page metadata combine
> - **Components**: Reusable fragments with their own areas
> - **Development Workflow**: Build and serve commands

## Next Steps

### 🧩 Learn Components
Deep dive into creating reusable components
- [Components Guide](/unify/docs/components)

### 📝 Add Markdown
Learn about Markdown support and frontmatter
- [Markdown Guide](/unify/docs/markdown)

### 🚀 Deploy Your Site
Get your site live on the web
- [Deployment Guide](/unify/docs/deployment)