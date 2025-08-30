# Unify Medium Example — Nested Layouts & Imports (v1)

This example demonstrates:
- **Nested layouts** (root → site → page)
- **Multiple public areas** in layouts
- **Multiple component imports** with **multiple replacements**
- An **example nav component**
- Use of **external CSS/JS libraries**
- The **final merged output** (`/dist/index.html`)

---

## Project Structure
```
example/
├─ layouts/
│  ├─ root.html
│  └─ site.html
├─ components/
│  ├─ nav.html
│  └─ card.html
├─ pages/
│  └─ index.html
└─ dist/
   └─ index.html   (expected final output)
```

---

## /layouts/root.html (outermost layout)
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Root Layout</title>

  <!-- External CSS libs (root layer first) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

  <!-- Contract: public areas for the root layout -->
  <style>
  /* unify:contract v1
     Public areas exposed by root layout
  */
  .u-header {}  /* Global header (contains brand + nav) */
  .u-footer {}  /* Global footer */
  </style>

  <!-- Basic root styling (illustrative) -->
  <style>
    body { font-family: system-ui, sans-serif; }
    .brand { font-weight: 700; }
    .container { max-width: 72rem; margin: 0 auto; padding: 1rem; }
    footer { border-top: 1px solid #e5e7eb; margin-top: 3rem; padding-top: 1.5rem; }
  </style>

  <!-- External JS lib (available to all layers) -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body>
  <header class="u-header">
    <div class="container">
      <div class="brand">ACME</div>
      <!-- Import the nav component into the header area -->
      <nav data-u-import="/components/nav.html"></nav>
    </div>
  </header>

  <main>
    <!-- Site/layout content will replace children here via landmark fallback -->
    <div class="container">
      <p>Root default main content…</p>
    </div>
  </main>

  <footer class="u-footer">
    <div class="container">
      <small>© ACME Corp</small>
    </div>
  </footer>
</body>
</html>
```

---

## /layouts/site.html (nested layout)
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Site Layout</title>
  <!-- Site-layer CSS (second in cascade) -->
  <style>
    .hero { padding: 4rem 0; background: #0ea5e9; color: white; }
    .features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .cta { background: #111827; color: #f9fafb; padding: 2rem; border-radius: .75rem; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
  </style>

  <!-- Contract: public areas for site layout -->
  <style>
  /* unify:contract v1 */
  .u-hero {}     /* Above-the-fold hero section */
  .u-features {} /* Feature section under hero */
  .u-cta {}      /* Global call-to-action section */
  </style>
</head>
<body data-u-layout="/layouts/root.html">
  <main>
    <section class="u-hero hero">
      <div class="container">
        <h1>Default Site Hero</h1>
        <p>Site-level default hero copy.</p>
      </div>
    </section>

    <section class="u-features features">
      <div class="container">
        <h2>Default Features</h2>
        <div class="cards">
          <article class="card">
            <h3>Default Card A</h3>
            <p>Placeholder content A</p>
          </article>
          <article class="card">
            <h3>Default Card B</h3>
            <p>Placeholder content B</p>
          </article>
        </div>
      </div>
    </section>

    <section class="u-cta cta">
      <div class="container">
        <h2>Default CTA</h2>
        <p>Default call-to-action content.</p>
      </div>
    </section>
  </main>
</body>
</html>
```

---

## /components/nav.html (component)
```html
<!doctype html>
<html lang="en">
<head>
  <!-- Contract: public area for nav -->
  <style>
  /* unify:contract v1 */
  .u-main-nav {} /* Primary navigation container */
  </style>

  <style>
    .nav { display: flex; gap: 1rem; align-items: center; }
    .nav a { text-decoration: none; color: inherit; }
    .nav-toggle { display: none; }
    @media (max-width: 640px) {
      .nav { display: none; }
      .nav[aria-expanded="true"] { display: flex; flex-direction: column; }
      .nav-toggle { display: inline-flex; }
    }
  </style>
</head>
<body>
  <div class="u-main-nav">
    <button class="nav-toggle" aria-controls="primary-nav" aria-expanded="false"
            x-data="{ open:false }" @click="open=!open; $el.setAttribute('aria-expanded', open)">
      <i class="bi bi-list"></i>
    </button>
    <nav id="primary-nav" class="nav" aria-expanded="false" x-data="{open:false}">
      <a href="/">Home</a>
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
    </nav>
  </div>
</body>
</html>
```

---

## /components/card.html (component)
```html
<!doctype html>
<html lang="en">
<head>
  <!-- Contract: public areas inside a card component -->
  <style>
  /* unify:contract v1 */
  .u-title {}   /* Card title */
  .u-body {}    /* Card body text */
  .u-actions {} /* Card actions (links/buttons) */
  </style>

  <style>
    .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
    .actions { margin-top: .75rem; display: flex; gap: .5rem; }
    .btn { display: inline-flex; align-items: center; gap: .5rem; padding: .5rem .75rem; border-radius: .375rem; background: #0ea5e9; color:#fff; text-decoration: none; }
  </style>
</head>
<body>
  <article class="card">
    <h3 class="u-title">Default Title</h3>
    <p class="u-body">Default body copy</p>
    <div class="u-actions actions">
      <a class="btn" href="#"><i class="bi bi-check2"></i> Default</a>
    </div>
  </article>
</body>
</html>
```

---

## /pages/product.html (page)
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Product X — ACME</title>
  <!-- Page-layer CSS (last in cascade) -->
  <style>
    .hero .kicker { text-transform: uppercase; letter-spacing: .08em; opacity: .9; }
    .hero .actions { margin-top: 1rem; }
    .u-cta .btn { background: #22c55e; }
  </style>
</head>
<body data-u-layout="/layouts/site.html">

  <!-- Override the root header area; children replace the root header's children -->
  <header class="u-header">
    <div class="container">
      <div class="brand">ACME • Product X</div>
      <!-- Override nav by providing a replacement .u-main-nav subtree -->
      <div class="u-main-nav">
        <button class="nav-toggle" aria-controls="primary-nav" aria-expanded="false"
                x-data="{ open:false }" @click="open=!open; $el.setAttribute('aria-expanded', open)">
          <i class="bi bi-list"></i>
        </button>
        <nav id="primary-nav" class="nav" aria-expanded="false">
          <a href="/">Home</a>
          <a href="/product" aria-current="page">Product</a>
          <a href="/pricing">Pricing</a>
          <a href="/contact">Contact</a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <!-- Replace site layout hero -->
    <section class="u-hero hero">
      <div class="container">
        <p class="kicker">Now available</p>
        <h1>Meet Product X</h1>
        <p>Fast, friendly, and framework‑free by default.</p>
        <div class="actions">
          <a class="btn" href="/pricing"><i class="bi bi-lightning"></i> Get Started</a>
          <a class="btn" href="/docs"><i class="bi bi-journal-text"></i> Read Docs</a>
        </div>
      </div>
    </section>

    <!-- Replace site layout features and import multiple cards with multiple replacements -->
    <section class="u-features features">
      <div class="container">
        <h2>Why you’ll love it</h2>
        <div class="cards">
          <!-- Card 1 -->
          <div data-u-import="/components/card.html">
            <h3 class="u-title">Zero DSL</h3>
            <p class="u-body">Author with plain HTML/CSS. No new language.</p>
            <div class="u-actions actions">
              <a class="btn" href="/docs"><i class="bi bi-book"></i> Learn more</a>
            </div>
          </div>

          <!-- Card 2 -->
          <div data-u-import="/components/card.html">
            <h3 class="u-title">Cascades like CSS</h3>
            <p class="u-body">Layouts → components → page, with safe scoping.</p>
            <div class="u-actions actions">
              <a class="btn" href="/blog"><i class="bi bi-rss"></i> See it in action</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Replace site layout CTA -->
    <section class="u-cta cta">
      <div class="container">
        <h2>Ready to ship?</h2>
        <p>Start building in minutes. Bring your own HTML.</p>
        <a class="btn" href="/signup"><i class="bi bi-rocket"></i> Sign up free</a>
      </div>
    </section>
  </main>

  <!-- Override the root footer area -->
  <footer class="u-footer">
    <div class="container">
      <small>© 2025 ACME • <a href="/legal">Legal</a> • <a href="/privacy">Privacy</a></small>
    </div>
  </footer>

</body>
</html>
```

---

## /dist/product.html (expected final merged output)
> **Notes**
> - Head assets appear in **layer order**: root → site → page.
> - The root header/footer **elements** persist; their **children** are replaced by page children.
> - The site layout’s `.u-hero`, `.u-features`, `.u-cta` are replaced by the page’s content.
> - Each imported `card.html` receives multiple replacements via its internal areas.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Product X — ACME</title>

  <!-- Root external CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

  <!-- Root contract (public areas) -->
  <style>
  /* unify:contract v1 */
  .u-header {}
  .u-footer {}
  </style>
  <style>
    body { font-family: system-ui, sans-serif; }
    .brand { font-weight: 700; }
    .container { max-width: 72rem; margin: 0 auto; padding: 1rem; }
    footer { border-top: 1px solid #e5e7eb; margin-top: 3rem; padding-top: 1.5rem; }
  </style>

  <!-- Site CSS -->
  <style>
    .hero { padding: 4rem 0; background: #0ea5e9; color: white; }
    .features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .cta { background: #111827; color: #f9fafb; padding: 2rem; border-radius: .75rem; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
  </style>
  <!-- Site contract (areas) -->
  <style>
  /* unify:contract v1 */
  .u-hero {}
  .u-features {}
  .u-cta {}
  </style>

  <!-- Page CSS (last in cascade) -->
  <style>
    .hero .kicker { text-transform: uppercase; letter-spacing: .08em; opacity: .9; }
    .hero .actions { margin-top: 1rem; }
    .u-cta .btn { background: #22c55e; }
  </style>

  <!-- External JS lib from root -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body>
  <header class="u-header">
    <div class="container">
      <div class="brand">ACME • Product X</div>
      <!-- Replaced nav component contents with page-provided .u-main-nav subtree -->
      <div class="u-main-nav">
        <button class="nav-toggle" aria-controls="primary-nav" aria-expanded="false">
          <i class="bi bi-list"></i>
        </button>
        <nav id="primary-nav" class="nav" aria-expanded="false">
          <a href="/">Home</a>
          <a href="/product" aria-current="page">Product</a>
          <a href="/pricing">Pricing</a>
          <a href="/contact">Contact</a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <section class="u-hero hero">
      <div class="container">
        <p class="kicker">Now available</p>
        <h1>Meet Product X</h1>
        <p>Fast, friendly, and framework‑free by default.</p>
        <div class="actions">
          <a class="btn" href="/pricing"><i class="bi bi-lightning"></i> Get Started</a>
          <a class="btn" href="/docs"><i class="bi bi-journal-text"></i> Read Docs</a>
        </div>
      </div>
    </section>

    <section class="u-features features">
      <div class="container">
        <h2>Why you’ll love it</h2>
        <div class="cards">
          <article class="card">
            <h3 class="u-title">Zero DSL</h3>
            <p class="u-body">Author with plain HTML/CSS. No new language.</p>
            <div class="u-actions actions">
              <a class="btn" href="/docs"><i class="bi bi-book"></i> Learn more</a>
            </div>
          </article>
          <article class="card">
            <h3 class="u-title">Cascades like CSS</h3>
            <p class="u-body">Layouts → components → page, with safe scoping.</p>
            <div class="u-actions actions">
              <a class="btn" href="/blog"><i class="bi bi-rss"></i> See it in action</a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="u-cta cta">
      <div class="container">
        <h2>Ready to ship?</h2>
        <p>Start building in minutes. Bring your own HTML.</p>
        <a class="btn" href="/signup"><i class="bi bi-rocket"></i> Sign up free</a>
      </div>
    </section>
  </main>

  <footer class="u-footer">
    <div class="container">
      <small>© 2025 ACME • <a href="/legal">Legal</a> • <a href="/privacy">Privacy</a></small>
    </div>
  </footer>
</body>
</html>
```

---

## Merge Highlights
- **Header**: Root `.u-header` kept; children replaced by page’s `.u-header` children (brand + custom nav subtree).
- **Nav**: The `nav.html` import lives inside the root header; the page overrides it by supplying its own `.u-main-nav` (class-only targeting).
- **Main landmark**: Site layout main replaces root main (landmark fallback), then page replaces the site’s `.u-hero`, `.u-features`, `.u-cta` areas.
- **Cards**: Each `card.html` import receives **three replacements** (`.u-title`, `.u-body`, `.u-actions`).
- **Assets**: CSS order is **root → site → page**; Alpine.js from root is available globally; Bootstrap Icons used in buttons.

---

## What to Tweak
- Try adding a third card import to see ordering.
- Move the `.u-main-nav` override into a different page to confirm scope boundaries.
- Add a `.is-inverted` variant to the CTA in the site contract and use it from the page.

