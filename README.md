# unify

**HTML-native composition — no expression language, no client runtime.**

unify is a static site generator for people fluent in HTML and CSS who want nothing to do with JavaScript frameworks, templating languages, or build tooling. Write a header, nav, footer, or page layout once, in plain HTML, and unify renders it into every page. The output is exactly the HTML and CSS you wrote — unify adds no JavaScript of its own. It replaces copy-paste chrome and Apache SSI; it does not compete with Hugo, Eleventy, or Astro.

The entire authoring surface is five things, learnable in five minutes:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing — the nearest `_layout.html` applies; `data-layout="/path.html"` picks one, `"none"` opts out |
| Mark where page content lands, or let pages replace a named region | `<main>` for the default; `<slot name="footer">` in the layout, `slot="footer"` on a page element |
| Keep a file or folder out of the built site | a leading underscore: `_draft.html`, `_includes/` |
| Ship a bare snippet exactly as written (for `<include>`, embeds, fetch) | name it `*.fragment.html` |

If it cannot be expressed with these five, it does not belong in unify.

> **Status:** v0.8.0 — the v0.7 composition model unchanged, plus a production layer: `unify audit`, sitemap/feed/search-index generation, `--canonical auto`, and JSON-LD from `schema:`. v0.7 was a clean break from 0.6.x — a 0.6 site will not build, and every retired spelling (`data-unify`, `unify-*` classes) is an error naming its v0.7 replacement. The specification set in [`docs/`](docs/) is authoritative, and every normative rule in it is covered by a test that runs against the real CLI.

## Install

**Standalone binary** (Linux and macOS, x86_64 and arm64 — nothing else to install):

```bash
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash
```

Installs to `~/.local/bin`; the script accepts `--global`, `--dir PATH`, `--version vX.Y.Z`, `--force`, and `--dry-run`. Binaries are attached to [GitHub releases](https://github.com/fwdslsh/unify/releases). No Windows binary yet — use the install below.

**Bun or npm:**

```bash
bun add -g @fwdslsh/unify    # or: npm install -g @fwdslsh/unify
```

Bun >= 1.2.0 is the only supported runtime — the installed `unify` script runs under `bun`, and there are no Node or Deno builds. Never heard of Bun? Use the binary above.

## Quick start

```bash
unify init      # scaffold a starter site into src/
unify dev       # build, watch, serve, reload — http://localhost:3000
unify build     # write the final site to dist/ — upload it anywhere
```

`unify init` scaffolds a complete site into `src/` — a layout, a nav include, HTML and Markdown pages, CSS, and a `robots.txt` — plus two files at the project root, outside `src/` so they can never publish: **`AGENTS.md`**, guidance for whoever (or whatever) edits the site next, and **`DEPLOY.md`**, the deployment recipe. Five templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Every scaffold passes `unify build --dry-run --strict` and `unify audit --strict` out of the box.

New here? The tutorial is **[Getting Started](docs/getting-started.md)**.

## How it works

A layout is a complete HTML page — open it in a browser and its slot fallbacks are its own preview:

```html
<!-- src/_layout.html -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <include src="/_includes/nav.html"></include>
    <main><slot></slot></main>
    <footer><slot name="footer"><p>© My Site</p></slot></footer>
  </body>
</html>
```

A page is also a complete, ordinary HTML document. It never mentions the layout — the nearest `_layout.html` applies automatically:

```html
<!-- src/index.html -->
<!doctype html>
<html>
  <head><title>Home</title></head>
  <body>
    <main>
      <h1>Home</h1>
      <p>This lands in the layout's &lt;main&gt;.</p>
    </main>
  </body>
</html>
```

The built page is the layout with its `<main>` filled by the page's content, and the page's title joined in front of the layout's: `<title>Home — My Site</title>`. To replace a named region, a page puts one standard attribute on an ordinary element — `<p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>` — and that element replaces the layout's `<slot name="footer">`, tag and all. The precedence rule in one sentence: **named fills go to named slots, everything else to the bare slot, else into `<main>`.**

Markdown pages compose identically, with frontmatter supplying the head. `title`, `layout`, `class`, `lang`, `dir`, and `schema` are the frontmatter keys with behavior; every other key becomes a `<meta>` tag, and `draft`, `permalink`, and `slug` are errors that name what unify does instead. Built pages contain no `<slot>` elements, no `data-layout` attributes, and no injected script — the one unify token that can survive into output is `<meta name="schema">`, on a page that asked for a generated JSON-LD block.

The full model is specified in the [Product Specification](docs/product-spec.md); the exact algorithms — slots, head merge, root attributes, URL rewriting — are in the [Conformance Specification](docs/conformance-spec.md).

## Commands

```
unify [build]            build the site (default command)
unify audit              evaluate the site the build would publish — writes nothing
unify dev                build, watch, serve, and reload — the inner loop
unify watch              build + rebuild on change, no server
unify init [template]    scaffold a starter site
```

`unify --help` lists every option — among them `--pretty-urls`, `--base-url` (which also generates `sitemap.xml`, and `feed.xml` once a page declares `schema: Article`/`BlogPosting`), `--canonical auto`, `--search-index`, `--dry-run`, and `--strict`. The **[CLI Reference](docs/cli-reference.md)** documents every command, option, and exit code — there are no others. An optional `unify.yaml` at the source root holds saved flags and nothing more.

## Guarantees

- **Content you wrote is never silently dropped.** Anything that would lose authored content is a `problem`, and problems block publishing. The milder severity, `advisory`, never blocks (under `--strict` it counts). Diagnostics are plain language, located, and name a fix — no rule codes.
- **Publishing is transactional.** Composition and every check — including a reference check of every internal URL — run into a temporary tree, and `dist/` is replaced only on zero problems. Exit `0` means `dist/` is the complete site; `1` means problems were found and the previous output is byte-for-byte untouched; `2` means invalid usage.
- **`unify build --dry-run --strict`** runs the whole build and every check while writing nothing — the one-line CI lint.

## Auditing

`unify audit` answers a different question — not *is this build sound?* but *is this site complete?* It runs the same pipeline, publishes nothing, and reports findings: a page with no description, two pages sharing a title, a `#fragment` link that names nothing, duplicate ids, a page nothing links to, structured data that contradicts its page. No score, no grade, no character counts — and `build` never runs any of it, so no finding can hold up a release. `unify audit --strict` is the opt-in CI gate, `--format json|sarif` is the machine-readable mirror, and `--external` checks off-origin links — the one flag in the product that touches the network. While `unify dev` is running, the same findings are a live page at `http://localhost:3000/_unify/`, grouped by page with each page's record beside them.

## What unify will never do

- **Ship JavaScript.** Your scripts pass through untouched; unify injects none of its own (dev's live reload never reaches `dist/`).
- **Grow a templating language.** No variables, loops, conditionals, or props. Derived pages come from a script you own, run before the build — a feed is the one exception (`schema:` plus `--base-url`).
- **Become a component framework.** Slots fill layouts; `<include>` splices files verbatim.
- **Need configuration.** Conventions, not config files.
- **Scope your CSS, or be a real web server.** `@scope`/`@layer` and a real server already answer those.

The full list, with the reasoning and the accepted costs, is [Product Specification §5](docs/product-spec.md).

## Examples

[`examples/`](examples/) holds five complete sites, each building clean under `unify build --dry-run --strict`. Four were authored by agents given nothing but the sixty-line authoring rules and a client brief, and kept because they passed review — so they show what the rules actually lead someone to build. Between them: pages generated from a data file, client-side filtering, a section with its own chrome, a page with no chrome for embedding, deploying under a subdirectory, htmx swapping `.fragment.html` panels, and a Svelte component compiled to an ordinary asset. [`examples/README.md`](examples/README.md) names the pattern in each.

## The complete authoring rules

Every rule an author needs, in under sixty lines. This section is [`docs/authoring-rules.md`](docs/authoring-rules.md) embedded verbatim: the bytes between the two markers below are byte-identical to that file, which release gate G10 asserts ([Testing Strategy §6](docs/testing-strategy.md)). Edit the file, never this copy.

<!-- BEGIN docs/authoring-rules.md -->
# Authoring a unify site — the complete rules

unify composes plain HTML at build time. No template language, variables, loops, or config: if you reach for
`{{ }}`, `{% %}`, props, or a config key, you are solving it wrong. The vocabulary is standard HTML — `<main>`,
`<slot>`, `slot=` — plus `<include>` and `data-layout`. Derived files (a post index) come from a script you write and run yourself: `node _scripts/gen.mjs && unify build`. A feed at `/feed.xml` needs no script: declare `schema: Article` or `BlogPosting` (below) on any page and build with `--base-url`, and unify writes it — Atom, from your title/description/canonical/dates; a `date:` with no time is reported and left out rather than guessed at.

## Files
- Source root is `src/` if it exists, else the current directory. `.html`/`.md` are pages — except a name
  ending `.fragment.html`, a bare snippet shipped as written, for `<include>`, embeds, or `fetch`/`hx-get` — and every other file copies byte-for-byte to the same path. A leading `/` means the source root, in any path you write. Always
  link the real filename — `/about.html`, never `/about/`; a directory link (`/guides/`) resolves only if you
  wrote a `guides/index.html`. This stays true under `--pretty-urls`: you still write `/about.html`, and the build rewrites it to `/about/` in the output; `--base-url https://you.example/handbook/` — the site's whole address, never a bare path — prefixes them and makes `og:`/`canonical` absolute for share crawlers.
- **Everything in the source root ships.** Anything that is not part of the site — notes, drafts,
  scratch, scripts — goes under a leading underscore (`_draft.html`, `_notes/`, `_scripts/`): the
  build still reads it, the output never contains it. Files inside a `_` directory need no prefix.
- Every file is valid standalone HTML: pages and layouts are complete `<!doctype html>` documents,
  fragments are balanced snippets. HTML pages never have frontmatter (use `<head>`); Markdown pages
  never contain `<head>` (use frontmatter). Both are build errors.

## Include — reuse a fragment
`<include src="/_includes/nav.html"></include>`, always with the closing tag; `/…` resolves from the source
root, anything else relative to the including file. Works in any file — layouts, pages, `<head>`, fragments,
and `.md`. Empty, it splices the file in verbatim. **Content between the tags fills slots** — allowed only when the target is a `*.fragment.html` declaring `<slot>`, and filled exactly as a page fills a layout's (`slot="name"` on a top-level element, everything else to the bare slot, an unfilled slot showing its own fallback). Fills reach that fragment's slots and no deeper. No props, no attributes passed, no expressions: an include is still not a component.

## Layout — chrome around a page
Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent; the page says
nothing. Pick one with `data-layout="/path.html"` on the page's `<html>` or `<body>` (Markdown:
`layout: /path.html`); opt out with `data-layout="none"` / `layout: none`. Layouts are paths ending in
`.html` — a bare name like `default` is an error. `data-layout` belongs on pages only: anywhere else it is
an error — on a layout too, because layouts don't chain (a section layout is a complete standalone page).

## Merging a page into its layout
- **Named slots.** The layout writes `<slot name="footer">fallback…</slot>`; the page fills it with `slot=`
  on a real element — `<footer slot="footer">…</footer>`, never a `<slot>` tag, which in a page fills nothing
  — and that element replaces the slot, tag and all, keeping its own markup; only the `slot=` attribute is dropped. Omit the fill and the
  fallback ships; `slot=` counts on direct children of `<body>` — or of your `<main>`, unwrapped first — and silently does nothing deeper. `grep -o '<slot[^>]*>' src/_layout.html` lists a layout's slots.
- **Everything else** replaces the layout's bare `<slot></slot>` if it has one — `<main><slot></slot></main>`
  is the usual shape — otherwise the children of its `<main>`. A `<main>` you wrote is dropped and its children used, so write complete semantic
  documents. A bare `<header>`/`<footer>` does **not** replace the layout's — only `slot=` fills, and it fills the *contents*: where the layout wraps its slot in its own `<footer>`, write `<p slot="footer">`, or you ship a footer inside a footer.
- **Head.** A page has its own complete `<head>`; the layout's is the base, and where both declare
  `<meta charset>` the layout's wins. **Write the separator into the layout's title** —
  `<title>— My Site</title>`, no leading space — and a page writes only its own name
  (`<title>About</title>`); the join adds the space, giving `About — My Site`. Your `<meta>` replaces the layout's same-`name`/`property`, your `canonical`/`icon`
  links replace the layout's, everything else appends after — page CSS wins.
- **Root attributes.** On `<html>`/`<body>` only, your classes are added and any other attribute you
  set wins; attributes merge nowhere else. Active nav is `<body class="home">` plus CSS
  (`body.home .nav-home {…}`), not a feature.

## Markdown
Frontmatter is YAML: quote any value containing a colon — `title: "Finish: the last quarter"`. `title`,
`layout`, `class` (on `<body>`), `lang`, `dir`, and `schema` are the only keys with meaning; every other becomes
`<meta name=…>` with the value as written — except `draft`, `permalink` and `slug`, which are **errors** naming what unify does instead: a leading underscore holds a page back (`_post.md`), and a page's address is its source path, so rename or move the file. `tags`/`categories` are allowed but build nothing — no index, no archive, no feed, no route — and `unify audit` says so.
A key named `og:…` emits `property=` instead
(`og:image: /card.png`, and `og:image:width: 1200` is one flat key — a colon inside a name is not nesting; an indented block two levels deep is an error). No `title:` → first `# Heading`; headings get slug `id`s. `schema: Article` (or `WebPage`, or `BlogPosting` — those three, spelled exactly; in HTML, `<meta name="schema" content="Article">` in the head, which a layout may carry for a whole section) writes the page's JSON-LD for you, from what the page already declares: its title, description, canonical, `og:image`, `author`, `date`, `lastmod`, and `lang`. Nothing else is added and nothing is guessed — a `date` unify cannot read as `2026-01-02` or `2026-01-02T09:30:00Z` is left out and reported, never filled in from the clock or the file. Write your own `<script type="application/ld+json">` for any other type, or for more detail: yours wins and unify then generates nothing. A canonical still has no frontmatter key — it is one page's own address, which a layout must never set (that stamps every page with the same URL), so write that page in HTML, use `--canonical auto`, or leave it off.

## Styles, scripts, finishing
unify never scopes, rewrites, or injects CSS/JS, and rewrites only HTML's own URL attributes (`href`, `src`) — a `url()` in CSS and a `fetch()`/`hx-get` address ship as written, so a root-relative one misses the `--base-url` prefix and 404s:
keep every `url()` in a stylesheet file and every fetched address relative to the page — or read it back from an `href` unify rewrote. Scope fragment styles yourself (`@scope`, `@layer`, a class prefix).
`unify build --dry-run --strict` is the whole build and every check, writing nothing: every problem in one pass,
and a list naming each page with the layout it resolved to. Then `unify build` — exit 0 means `dist/` is the complete
site; non-zero means nothing was published and `dist/` is untouched, so never report success on a non-zero exit. `--exclude` **replaces** the `_*` default; keep `_*` in your list.
<!-- END docs/authoring-rules.md -->

## Documentation

**Using unify**

- **[Getting Started](docs/getting-started.md)** — the tutorial.
- **[Authoring Rules](docs/authoring-rules.md)** — the complete authoring surface (embedded above).
- **[CLI Reference](docs/cli-reference.md)** — every command, option, and exit code.
- **[Integrations](docs/integrations.md)** — the compile-to-asset pattern: Svelte, TypeScript, or anything with a compiler, without adopting a framework.
- **[Docker Usage](docs/docker-usage.md)** — running the CLI in a container.
- **[Examples](examples/README.md)** — five complete sites and the patterns they demonstrate.

**How unify is defined**

- **[Product Specification](docs/product-spec.md)** — what unify is, the composition model, the non-goals.
- **[Conformance Specification](docs/conformance-spec.md)** — the normative implementer reference: exact algorithms, the head-merge table, the closed problem/advisory catalogues.
- **[Testing Strategy](docs/testing-strategy.md)** — the testing contract and the release gates.
- **[CI/CD Workflows](docs/cicd-workflows.md)** — what each job runs and what it is allowed to mean.

**How the documentation was validated**

- **[Ratification](docs/ratification.md)** — the evidence: agents authoring from the sixty lines in isolation, what each round found, and what it changed.
- **[Ratification Protocol](docs/ratification-protocol.md)** — the procedure, for running another round.
- **[Migration Plan](docs/migration-plan.md)** — how the v0.6 tree became this one. History, not current work.

## For Agents

Authoring or editing a **site built with unify**? Review **[docs/authoring-rules.md](docs/authoring-rules.md)** — the complete authoring surface in under sixty lines, embedded verbatim in the section above — before writing anything, and do not substitute conventions from other generators: unify has no props, no expressions, no `draft:`/`permalink:`/`slug:` keys, and layouts do not chain.

- `unify init` drops an **`AGENTS.md`** at the project root (outside `src/`, so it cannot publish) restating the most commonly guessed-wrong rules. If the project has one, read it — it is the same rule set as this README, never a variant.
- Finish by checking: `unify build --dry-run --strict`, then `unify audit --strict`. Exit `0` from `unify build` means `dist/` is the complete site; non-zero means **nothing was published** and the previous output is untouched — never report success on a non-zero exit.
- `unify --help` lists the complete CLI. There are no other commands or flags; the authoring rules live in the docs, this README, and the scaffolded `AGENTS.md`, not in a CLI command.

Contributing to **unify itself**? Start with [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md); the [Conformance Specification](docs/conformance-spec.md) is normative.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Development setup:

```bash
git clone https://github.com/fwdslsh/unify
cd unify
bun install
bun test
```

## License

CC-BY-4.0. See [LICENSE](LICENSE).
