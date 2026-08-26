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

> The specification set in [`docs/`](docs/) is authoritative, and every normative rule in it is covered by a test that runs against the real CLI.

## Install

**Standalone binary** (Linux and macOS, x86_64 and arm64 — nothing else to install):

```bash
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash
```

Installs to `~/.local/bin`; the script accepts `--global`, `--dir PATH`, `--version vX.Y.Z`, `--force`, and `--dry-run`. Binaries are attached to [GitHub releases](https://github.com/fwdslsh/unify/releases). No Windows binary yet — use the install below.

**Node or Bun:**

```bash
npx @fwdslsh/unify build     # no install at all
npm install -g @fwdslsh/unify
bun add -g @fwdslsh/unify
```

Node >= 22.12.0 or Bun >= 1.2.0. The same `unify` runs on both and produces byte-identical output; the installed script picks Node by default, and `bun add -g` runs it under Bun. Deno is not supported. Never heard of either? Use the binary above.

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

`unify --help` lists every option — among them `--pretty-urls`, `--base-url` (which also generates `sitemap.xml`, and `feed.xml` once a page declares `schema: Article`/`BlogPosting`), `--canonical auto`, `--catalog`, `--search-corpus`, `--dry-run`, and `--strict`. The **[CLI Reference](docs/cli-reference.md)** documents every command, option, and exit code — there are no others. An optional `unify.yaml` at the source root holds saved flags and nothing more.

## Examples

[`examples/`](examples/) holds eight complete sites, each building clean under `unify build --dry-run --strict`. Four were authored by agents given nothing but the sixty-line authoring rules and a client brief, and kept because they passed review — so they show what the rules actually lead someone to build; the other four are hand-maintained, including unify's own documentation site built by unify, another generator (Eleventy) adopted as source through `--generate`, and a blog whose browse, filter, and search UI is data-driven from `--catalog`/`--search-corpus`. Between them: pages generated from a data file, client-side filtering, a section with its own chrome, a page with no chrome for embedding, deploying under a subdirectory, htmx swapping `.fragment.html` panels, a Svelte component compiled to an ordinary asset, and client-side search over generated JSON. [`examples/README.md`](examples/README.md) names the pattern in each.

## Documentation

**Using unify**

- **[Getting Started](docs/getting-started.md)** — the tutorial.
- **[Authoring Rules](docs/authoring-rules.md)** — the complete authoring surface, in under sixty lines.
- **[CLI Reference](docs/cli-reference.md)** — every command, option, and exit code.
- **[Integrations](docs/integrations.md)** — the compile-to-asset pattern: Svelte, TypeScript, or anything with a compiler, without adopting a framework.
- **[Eleventy + htmx](docs/guides/eleventy-htmx.md)** — the advanced stack: another generator produces data-driven pages, unify composes them, htmx enhances them. Optional layers, and when not to reach for them.
- **[Catalog and Search](docs/guides/catalog-and-search.md)** — a blog list, facets, and a search box built client-side from the two files `--catalog`/`--search-corpus` write.
- **[Docker Usage](docs/docker-usage.md)** — running the CLI in a container.
- **[Examples](examples/README.md)** — eight complete sites and the patterns they demonstrate.

**How unify is defined**

- **[Product Specification](docs/product-spec.md)** — what unify is, the composition model, the non-goals.
- **[Conformance Specification](docs/conformance-spec.md)** — the normative implementer reference: exact algorithms, the head-merge table, the closed problem/advisory catalogues.
- **[Testing Strategy](docs/testing-strategy.md)** — the testing contract and the release gates.
- **[CI/CD Workflows](docs/cicd-workflows.md)** — what each job runs and what it is allowed to mean.

**How the documentation was validated**

- **[Ratification](docs/ratification.md)** — the evidence: agents authoring from the sixty lines in isolation, what each round found, and what it changed.
- **[Ratification Protocol](docs/ratification-protocol.md)** — the procedure, for running another round.
- **[Migration Plan](docs/migration-plan.md)** — how the current tree came to be. History, not current work.

## For Agents

Authoring or editing a **site built with unify**? Review **[docs/authoring-rules.md](docs/authoring-rules.md)** — the complete authoring surface in under sixty lines — before writing anything, and do not substitute conventions from other generators: unify has no props, no expressions, no `draft:`/`permalink:`/`slug:` keys, and layouts do not chain.

- `unify init` drops an **`AGENTS.md`** at the project root (outside `src/`, so it cannot publish) restating the most commonly guessed-wrong rules. If the project has one, read it — it restates the rules linked above, never a variant of them.
- Finish by checking: `unify build --dry-run --strict`, then `unify audit --strict`. Exit `0` from `unify build` means `dist/` is the complete site; non-zero means **nothing was published** and the previous output is untouched — never report success on a non-zero exit.
- `unify --help` lists the complete CLI. There are no other commands or flags; the authoring rules live in [docs/authoring-rules.md](docs/authoring-rules.md) and the scaffolded `AGENTS.md`, not in a CLI command.

Contributing to **unify itself**? Start with [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md); the [Conformance Specification](docs/conformance-spec.md) is normative.

## Guarantees

- **Content you wrote is never silently dropped.** Anything that would lose authored content is a `problem`, and problems block publishing. The milder severity, `advisory`, never blocks (under `--strict` it counts). Diagnostics are plain language, located, and name a fix — no rule codes.
- **Publishing is transactional.** Composition and every check — including a reference check of every internal URL — run into a temporary tree, and `dist/` is replaced only on zero problems. Exit `0` means `dist/` is the complete site; `1` means problems were found and the previous output is byte-for-byte untouched; `2` means invalid usage.
- **`unify build --dry-run --strict`** runs the whole build and every check while writing nothing — the one-line CI lint.

And the guarantees that run the other way — what unify will never do:

- **Ship JavaScript.** Your scripts pass through untouched; unify injects none of its own (dev's live reload never reaches `dist/`).
- **Grow a templating language.** No variables, loops, conditionals, or props. Derived pages come from a script you own, run before the build — a feed is the one exception (`schema:` plus `--base-url`).
- **Become a component framework.** Slots fill layouts; `<include>` splices files verbatim.
- **Need configuration.** Conventions, not config files.
- **Scope your CSS, or be a real web server.** `@scope`/`@layer` and a real server already answer those.

The full list, with the reasoning and the accepted costs, is [Product Specification §5](docs/product-spec.md).

## Auditing

`unify audit` answers a different question — not *is this build sound?* but *is this site complete?* It runs the same pipeline, publishes nothing, and reports findings: a page with no description, two pages sharing a title, a `#fragment` link that names nothing, duplicate ids, a page nothing links to, structured data that contradicts its page. No score, no grade, no character counts — and `build` never runs any of it, so no finding can hold up a release. `unify audit --strict` is the opt-in CI gate, `--format json|sarif` is the machine-readable mirror, and `--external` checks off-origin links — the one flag in the product that touches the network. While `unify dev` is running, the same findings are a live page at `http://localhost:3000/_unify/`, grouped by page with each page's record beside them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Development setup:

```bash
git clone https://github.com/fwdslsh/unify
cd unify
bun install
bun test
```

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
