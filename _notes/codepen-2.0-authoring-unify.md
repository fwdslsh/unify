# Authoring unify sites in CodePen 2.0

**Date:** 2026-08-22 · **Status:** assessment, not a plan of record

---

## TL;DR

**unify cannot run inside CodePen 2.0 today, and probably cannot without CodePen's cooperation.** CodePen 2.0 does run real build pipelines server-side — Eleventy is a shipped Block — but Blocks are a *curated catalogue*. You request one from CodePen support; there is no documented SDK for authoring your own. unify also needs Bun, and Blocks look npm/Node-shaped.

Three things follow:

1. **Pasting a unify source tree into a Pen produces a broken site, deceptively.** I verified this in a real browser: pages render without their chrome, `<include>` survives as an empty unknown element so every fragment vanishes, and there is no head merge, no JSON-LD, no reference check. Layout slot *fallbacks* do render — which is exactly what makes it a trap. It looks half-plausible instead of obviously broken.
2. **The genuinely good fit available right now is fragment authoring.** A `*.fragment.html` is a bare, standalone, byte-for-byte snippet — the same unit a Pen has always been. Design a card or nav in CodePen with live preview and real-time collaboration, then drop it into `src/_includes/`. This costs nothing and works today.
3. **The best long-term play is to petition for a unify Block**, with the Eleventy Block as precedent. Before that conversation is worth having, the project has to answer one strategic question: *Blocks appear to be npm/Node packages, and unify is deliberately Bun-only.* That, not the composition model, is the thing most likely to block it forever.

One real bright spot: **CodePen and unify already agree on the underscore convention** — `_`-prefixed files are readable by the build but never emitted. `_layout.html` and `_includes/` would sit in CodePen's file tree behaving exactly as unify intends.

---

## 1. What CodePen 2.0 actually is

Launched 2026-07-23 after roughly five years of work; a complete rewrite that merges the Classic Pen editor and Projects into one editor.

| Capability | Detail |
|---|---|
| **File system** | Real nested directories, New File / New Directory, arbitrary names and extensions. The three-file limit is gone; multi-page sites are a first-class case. |
| **Compiler** | The "CodePen Compiler" parses every line of every file with Treesitter, builds a step-by-step build plan, and converts files into HTML/CSS/JS primitives. It **auto-adds Blocks** based on what it finds. |
| **Blocks** | "Anything that processes code will be a Block." Shipped: Sass, TypeScript, Tailwind, Vue via Vite, Lightning CSS, MJML, Nunjucks, **Eleventy**. Each Block carries its own config and npm dependencies (the Nunjucks Block pins `nunjucks ^3.2.3`). |
| **Packages** | npm packages are explicitly *not* Blocks — they are runtime imports, not processors. ES module imports work across files. |
| **Resources** | Assets are **fingerprinted**: `style.css` is hashed, and hashed files get ultra-long cache headers broken only by content change. |
| **Deploy** | One click to a `*.codepen.app` subdomain (random at first), custom domains via A records, 1 TB/month bandwidth per deployed Pen. Downgrading to free undeploys your sites. |
| **Collaboration** | Per-Pen version history with rollback; invite editors or viewers; real-time simultaneous editing. |
| **Automation** | No official API for creating or updating a Pen programmatically. There is a prefill POST form and a third-party `codepen-upload-cli`; the supported path is drag-and-drop in the UI. |

The decisive line, from CodePen's own Blocks documentation: *"Static-site generators, optimizers, linters, languages, and more will all be possible with Blocks."* Note the tense. And: *"Users can request a Block by sending a message to support."* Blocks are something CodePen adds, not something you bring.

---

## 2. The feasibility question, answered

unify's build is a Bun process (or a compiled native binary). Node and Deno are unsupported by design. CodePen 2.0 offers no shell, no arbitrary build command, and no custom-Block mechanism.

**So unify's CLI cannot execute in CodePen 2.0.** Everything below is about what you do instead.

### Posture A — paste the source tree into a Pen ❌

I tested this rather than assuming it. Scaffolding `unify init` and rendering the *unbuilt* source in Chromium:

```
raw src/index.html   →  "Home / Home / This content lands in the layout's <main>."
                        …no nav, no footer, no chrome at all
raw src/_layout.html →  slot fallback "© My Site" renders correctly,
                        but <include src="/_includes/nav.html"></include>
                        survives in the DOM as an empty unknown element — nav gone
built dist/index.html →  "Home — My Site", merged head, generated JSON-LD
```

The failure is partial, which is worse than total. Slot fallbacks rendering is a deliberate unify design property (a layout previews its own defaults), and here it works *against* you: the preview looks like a styled page that is merely missing some content, not like an unbuilt source tree.

Additional hazard: CodePen's Compiler claims every file it recognises. A `.md` page would be processed by CodePen's Markdown/Eleventy handling, not by unify's frontmatter rules — and those rules differ materially (unify treats `draft:`, `permalink:` and `slug:` as *errors*, and only `title`/`layout`/`class`/`lang`/`dir`/`schema` carry behaviour). You would get plausible-looking output governed by rules unify never agreed to.

### Posture B — build locally, host on CodePen ⚠️

`unify build` emits plain static files, and static files are precisely what CodePen deploys. This works, with three real caveats:

- **Every rebuild is a manual re-upload.** No official API. Drag-and-drop or an unofficial CLI.
- **Version history and collaboration then track the *output*.** A collaborator editing a built page in CodePen is editing an artifact unify will overwrite on the next build, silently. That is a genuine footgun for the exact audience CodePen's collaboration features attract.
- **Two URL rewriters in series.** unify rewrites URLs, mirror-copies assets to exact source paths, and then *verifies every internal reference resolves*. CodePen fingerprints resources into hashed filenames. unify's guarantee is about a path that CodePen may then rename. This needs testing before anyone trusts it.

Verdict: fine for a demo or a one-off. Treat CodePen as a host, not an IDE, and keep the source in git.

### Posture C — fragments in CodePen, composition in unify ✅

The one that actually fits. `*.fragment.html` is defined as a bare snippet shipped byte-for-byte and never composed — for `<include>`, embeds, or `fetch`/`hx-get`. That is the same object a Pen has always been: a self-contained scrap of HTML/CSS/JS with a live preview.

The loop: prototype the component in a Pen (instant preview, sharing, real-time collaboration, version history), then paste it into `src/_includes/thing.fragment.html`. unify's include is a *textual splice*, so what you copy is what ships.

This is worth documenting. `docs/integrations.md` already carries the compile-to-asset pattern for Svelte and kin; "prototype in CodePen, ship as a fragment" is the same shape and about ten lines.

### Posture D — a unify Block 🎯

The only route to genuinely authoring unify sites *in* CodePen. The precedent is good: Eleventy is already a Block, with `.md` and `.njk` template formats, so CodePen clearly runs SSG-class work server-side.

What would have to be true:

- **A Block must be installable the way Blocks are installed.** The Nunjucks Block pins an npm dependency. unify is Bun-only, on purpose, with no Node build. This is the crux, and it is a *product* decision, not an engineering detail.
- **unify would have to behave as a compiler stage, not a CLI.** Its contract today is `dist/`, exit codes, and a transactional all-or-nothing publish. A Block hands HTML/CSS/JS primitives downstream to other Blocks. The composition core would need to be callable as a library over a file tree — which, encouragingly, is roughly how `src/` is already structured (`compose.js`, `layout.js`, `includes.js`, `head-merge.js` are separable from the CLI).
- **The output is a good citizen.** unify emits no `<slot>`, no `data-layout`, and no injected JavaScript. As the HTML Block sitting upstream of Sass/TypeScript/Tailwind Blocks, it would compose cleanly.

Cost of asking: one support message. Recommended — after deciding the Bun question.

---

## 3. Where the two designs agree and disagree

### Agreements

- **Underscore exclusion.** CodePen: prefixing a filename with an underscore means the editor will not create a processed output file for it, while the file stays available for imports and includes. That is unify's rule almost word for word. `_layout.html`, `_includes/`, `_scripts/` all land correctly in CodePen's file tree.
- **Real directories and multi-page.** unify's layout discovery walks up the directory tree; CodePen 2.0 finally has directories to walk.
- **Static output, real deployment.** Both end at plain files on a static host.

### Disagreements

- **CodePen's answer to composition is Nunjucks.** `{% include %}`, template inheritance, blocks. unify exists specifically to *not* be that. Authoring unify inside CodePen means declining the platform's own, natively supported solution to the same problem — and a CodePen user reaching for reuse will be steered to Nunjucks first, every time.
- **The Compiler wants to own the pipeline.** It auto-configures Blocks from the files it sees. unify's guarantee is that built output is exactly the author's markup. Two systems that both claim the HTML.
- **unify's safety layer has nowhere to live.** The reference check, `problem`/`advisory` severities, the transactional publish that leaves `dist/` untouched on failure, `unify audit`, and the `/_unify/` report are a large share of unify's value. CodePen's model is instant preview; a build that *refuses to publish* is foreign to it. In a CodePen world you keep the composition and lose the guarantees.
- **`--base-url` fights the deploy model.** unify wants the site's whole public address at build time to absolutise `og:`/canonical and to generate `sitemap.xml`. CodePen deploys first to a random `*.codepen.app` subdomain, and a custom domain comes later. The address is not knowable until after the first deploy and changes when a domain is attached, so every address change means a rebuild.

### The uncomfortable one

CodePen 2.0's target user — a designer or hobbyist who wants to build a real multi-page site without a local toolchain — **is unify's target user**. And CodePen now gives them a file system, a build pipeline, deployment, custom domains, version history and live collaboration, with zero install. unify's honest advantage over that is not convenience; it is the *contract*: no template language, output that is exactly your markup, and a build that refuses to publish something broken. That is a real advantage, but it is a connoisseur's advantage, and it is invisible until the first time it saves you.

Worth naming plainly: real-time collaboration and version history are things CodePen has and unify structurally cannot, being a CLI over a git repo.

---

## 4. Recommendations

1. **Do not pursue in-CodePen builds now.** No mechanism exists.
2. **Document Posture C** in `docs/integrations.md` — prototype in a Pen, ship as `*.fragment.html`. Cheap, useful, true today.
3. **Decide the Bun question deliberately.** Bun-only is defensible and it is currently the single largest obstacle to unify ever being embeddable in someone else's build platform — CodePen or otherwise. If embeddability matters, a Node-compatible composition library (not the CLI) is the enabling move.
4. **Then request a unify Block from CodePen support,** citing the Eleventy Block.
5. **Before recommending CodePen as a host for a `--base-url` site, test the fingerprinting interaction.** unify's reference check verifies paths that CodePen may hash.
6. **Do not treat CodePen as the source of truth for a unify site.** Its collaborative editing over built output will be overwritten by the next build with no warning.

---

## 5. Confidence and limits

**Read this section before acting on the report.** In this environment, `WebFetch` and `curl` to `codepen.io` and `blog.codepen.io` are blocked by the network egress proxy. Everything above about CodePen 2.0 comes from **web-search result summaries that cite those pages**, not from reading the pages themselves. The unify side, and every rendering test, is first-hand and verified on this machine.

Specific items to re-verify directly against the docs before anyone acts:

- **Whether 2.0 keeps the underscore-means-partial convention.** The clearest statement of it traces to CodePen's file-processing docs, which historically covered Projects. The 2.0-specific restatement came from search synthesis. This is load-bearing for the report's headline "agreement" and deserves a direct check at `blog.codepen.io/docs/pens/files/`.
- **Whether a custom or third-party Block is possible at all.** I found a "request a Block" path and no SDK; absence of evidence is not proof.
- **Whether CodePen 2.0 still wraps authored HTML in a preview template document.** Classic did. With a real file system, 2.0 presumably serves your `index.html` as written — but unify's pages are complete `<!doctype html>` documents, so a wrapper would break them outright, and this is worth one minute of certainty.
- **Exact fingerprinting behaviour** for author-referenced paths.
- **Free versus paid boundaries** on the file system, Blocks and deployment.

Primary sources to read: `blog.codepen.io/2026/07/23/two-point-oh/`, `codepen.io/2/compiler`, `blog.codepen.io/docs/pens/blocks/`, `blog.codepen.io/docs/all-blocks/`, `blog.codepen.io/docs/pens/files/`, `blog.codepen.io/docs/pens/build/`, `blog.codepen.io/docs/pens/deployment/`.
