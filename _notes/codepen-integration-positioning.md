# Positioning unify for CodePen — and everything shaped like it

**Date:** 2026-08-22 · **Status:** recommendation (supersedes the strategy questions left open by
"Authoring unify sites in CodePen 2.0", 2026-08-22) · **Method:** five recon researchers
(codebase portability, product-contract constraints, CodePen verification, embeddability
precedents, platform ecosystem), three independent architecture proposals, two adversarial
critiques per proposal, one comparative judge. Every load-bearing claim below is labeled
**[verified]** (executed or read on this machine) or **[attested]** (search-corroborated,
primary page unreachable — codepen.io is egress-blocked from this environment).

---

## TL;DR

1. **The npm question inverts.** "Can an author include a unify npm package in their CodePen
   project?" — in CodePen 2.0, an author-included package is a *browser-runtime import*
   (Packages Block → importmap → esm.sh, executing in the preview iframe). It can never be a
   build step, and used naively it would ship unify's engine to every visitor — violating
   unify's own no-client-runtime law with unify's own recipe. The question that has a durable
   answer is the inverse: **make `@fwdslsh/unify` installable by the *host's* build system.**
   One Node-clean npm package then serves a future CodePen Block, Netlify/Vercel/Cloudflare,
   GitHub Actions, StackBlitz WebContainers, and editor extensions simultaneously — first-class
   support everywhere at once, tied to no one.

2. **"Bun-only" is packaging, not code — verified by execution.** `node src/cli.js build`,
   `audit --format json`, and `watch` run end-to-end on Node v22.22.2 unmodified; exactly three
   Bun-native call sites exist in all of `src/` (`Bun.serve`/`Bun.file` in the dev server,
   `Bun.spawn` in `--generate`), none in composition. Meanwhile `peerDependencies: { bun: ">=1.2.0" }`
   silently installs a **99MB Bun binary into every npm consumer's `node_modules`** [verified] —
   the single worst line in the package. The uploaded assessment named Bun-only as the crux
   blocking embeddability forever; it is in fact a ~1–2 week packaging release.

3. **The recommendation is a four-phase compatibility layer, each phase independently
   valuable, no phase CodePen-specific:** (1) the *keystone release* — a genuinely
   dual-runtime npm package shipped as 1.0.0, plus the fragment-authoring recipe that serves
   CodePen honestly today; (2) a *tree-in/tree-out library entry* (`buildTree`) behind a
   spec'd virtual-source-tree seam, the CLI itself becoming its first consumer; (3) a
   *browser artifact* whose first consumer is unify's own docs playground — not CodePen;
   (4) the *ecosystem/political track* — the CodePen Block petition (reframed as
   demand-building and reconnaissance), platform presets, SARIF CI recipes, a StackBlitz link.

4. **The in-Pen previewer is demoted, not promoted.** Two independently corroborated facts cap
   it: CodePen's free plan limits Pens to three files [attested], and CodePen's own underscore
   convention likely means `_layout.html` and `_includes/*` have no served URL for a previewer
   to fetch [attested] — the exact files composition needs. It survives as a provenance-dated,
   PRO-tier-disclosed recipe published only after on-platform spikes pass, never as the headline.

---

## 1. What the debate established about the code (all [verified])

The recon audit and the judge's independent spot-checks agree on a picture considerably more
favorable than the uploaded assessment assumed:

- **The composition path is pure.** `html.js` (zero imports), `compose.js`, `head-merge.js`,
  `slotted-include.js`, `urls.js`, `references.js`, `collisions.js`, `entities.js`, plus the
  whole analysis layer (`manifest.js`, `sitemap.js`, `feed.js`, `search-index.js`, `audit.js`,
  `structured-data.js`, `canonical.js`, `robots.js`) touch no filesystem, no process, no
  network, no Bun. Injection seams already exist as house precedent: `convertMarkdown` into
  `inlineIncludes`, `resolveLine` into `compose()` ("compose.js never touches the filesystem —
  which is exactly why the parameter exists"), `Reporter` with injected streams, `fetchImpl`
  in `external.js`.
- **The output side is already virtual.** `build.js` accumulates everything into a
  `tempFiles Map`; reference check, collisions, manifest, sitemap/feed/search-index, and audit
  are Map/Set-driven; `planPublish` is a pure Map-vs-Map diff with fs writes isolated in four
  functions.
- **The input side is small.** Direct source-tree reads live in ~13 call sites across 4 files
  (`build.js` scan + reads, `includes.js:187`, `layout.js:305/332` existence probes,
  `markdown.js:681`). A three-method interface covers it.
- **What's genuinely missing for a library:** `build()` returns only `reporter.exitCode` —
  `tempFiles` never escapes; the dry-run path still snapshots the output directory from disk
  (`build.js:707`); `consumeLastAuditRun()` is a non-re-entrant module-level side channel;
  `diagnostics.js:53` defaults to `process.stderr/stdout`; `paths.js` has a top-level
  `node:fs` import; `generate.js:194` hardcodes `"bun "` into user-facing fix text.
- **A browser bundle already builds.** `bun build --target=browser` succeeds today at 1.4MB.
  The real shim list is short: TextEncoder for two `Buffer.byteLength` sites, WebCrypto for
  one sync `createHash` (audit fingerprints), a posix pathkit, the two impure defaults above.
- **The test suite, unlike `src/`, is genuinely Bun-locked** (`bun:test`, `Bun.spawn`
  harnesses, `Bun.Transpiler` preflight) — dual-runtime coverage is a harness amendment, not
  a rewrite. Conformance fixtures are already declarative tree-in/tree-out manifests with a
  standalone comparator.

## 2. What the debate established about CodePen

- **Blocks are curated; there is no third-party SDK.** The `@codepen` npm scope contains no
  packages [verified against the registry]. A unify Block exists only if CodePen builds it.
  The Eleventy Block's existence implies server-side Node execution [attested] — which is
  exactly what the keystone release provides a substrate for.
- **Author-included npm packages are runtime imports, not processors** [attested, consistent
  across sources]. This kills "npm package as build step" permanently and independently of
  anything unify does.
- **The free plan's three-file cap** [attested, corroborated three ways] makes any in-Pen
  multi-file authoring story PRO-only — for a product whose audience is hobbyists.
- **The underscore convention cuts both ways.** It is the alignment bright spot (same rule,
  same meaning) *and* the reason an in-Pen previewer probably cannot fetch `_layout.html` at
  preview time. One of those two claims must fail; a spike from an unblocked machine decides
  which before any previewer work starts.
- **What CodePen deploys is static files** — which `unify build` emits. Build-locally,
  host-on-CodePen remains valid with the caveats the original assessment recorded
  (manual upload, collaboration-over-artifacts footgun, fingerprinting untested).

## 3. The debate: three architectures, six critiques, one synthesis

Three independent proposals were drafted and adversarially attacked (product-contract lens +
engineering-reality lens each):

- **Meet-at-Files** (contract-first): no embedding framework — one keystone packaging release
  makes the npm package genuinely Node-runnable; a consolidating conformance section makes the
  existing host-facing contracts (files in/out, exit codes 0/1/2, `FILE:LINE: severity:`
  diagnostics, `audit --format json|sarif`) normative for hosts; tested host recipes plus the
  political track ride on that. **Ranked 1st: neither critic found a fatal flaw; every defect
  had a stated, bounded fix.**
- **The Tree Projection** (browser-first): "dry-run as a value" — complete source tree in as a
  Map, complete would-be output tree (or null) out, plus a pre-bundled browser artifact;
  in-Pen preview via CodePen's own package mechanism. **Ranked 2nd: the library contract is
  the best of the three — tree-as-immutable-value, no callbacks, complete-or-null output —
  but the "CodePen today, zero cooperation" headline died against the 3-file cap, and the
  iframe previewer's root-relative-URL problem is a redesign, not a patch.**
- **Hourglass** (library-first): same family as Tree Projection with a full `build.js` →
  `pipeline.js` extraction and a byte-equivalence law over all fixtures. **Ranked 3rd: right
  instincts (the G-PURE import-graph gate, files-or-nothing typing, rejecting a separate
  `unify-core` package), but the largest diff for benefits the thinner seam matches, and an
  unusual density of drafted-clause failures (byte-identical stderr is impossible across the
  cwd frame; whole fixture classes are library-inexpressible; its "complete surgery list"
  missed two modules that fail its own purity gate on day one).**

**Where all three designs and all six critiques independently converged** — treat this
unanimity as the debate's most reliable output:

- Delete `peerDependencies.bun`.
- No resolve/load callbacks, no plugin/hook API — the tree is a *value*, host code never runs
  during composition.
- No page-scope compile: the unit of compilation is the site; a page API is unify minus its
  guarantees.
- Embedding is a **projection of the CLI, never a superset** (the docker-usage standard:
  "adds nothing to it and takes nothing away").
- `dev` stays out of the library; `--generate` stays a subprocess.
- Spec-first governance: every new surface gets its conformance section before code ships.
- The CodePen Block is a petition, not a plan.

## 4. The recommendation

**Frame: Meet-at-Files. Escalation: Tree Projection's contract. Gates: Hourglass's
enforcement. One package, four phases, each independently valuable.**

### Phase 1 — the keystone release, shipped as 1.0.0 (~1–2 weeks)

Land **atomically** — removing the peer dep alone bricks the accidental `npx unify` path that
the auto-installed Bun binary currently enables [verified: `npx unify --version` → 0.8.0 on a
Bun-free machine today]:

- `package.json`: delete `peerDependencies.bun`; shebang → `#!/usr/bin/env node`;
  `engines: { node: "<pinned proven minor>", bun: ">=1.2.0" }` — derive the Node floor as the
  oldest minor with `import.meta.main` *and* warning-free `with { type: 'json' }` imports
  (≥22.18 preferred; 22.0–22.11 prints ExperimentalWarning to stderr, violating diagnostic
  byte-identity); closed `exports` map (deep imports become deliberate, not accidental —
  friction, honestly claimed, not enforcement); ship as **1.0.0** so host pins survive minors.
- `src/cli.js`: `import.meta.main` fallback guarded with `realpathSync` on both sides — npm
  bin shims are symlinks, and the naive `argv[1]` comparison makes `npx unify build` a silent
  exit-0 no-op on runtimes without `import.meta.main` [verified by execution].
- `src/core/generate.js`: `Bun.spawn` → `node:child_process` preserving §33's two-argv
  contract; reword the line-194 fix text runtime-neutrally; one spec sentence: the generator
  runs under the runtime executing unify, portable generators use `node:` builtins.
- `src/core/dev-server.js`: port to `node:http` (2–3 honest days — the synchronous
  EADDRINUSE→UsageError contract changes `createDevServer`'s signature). This keeps
  `unify init && unify dev` — the product's first success criterion — runtime-invariant, and
  dissolves a verified regression: **bunx runs node-shebang bins under Node**, so flipping
  the shebang without porting dev breaks `bunx unify dev`, the command hobbyists live in.
- Spec surgery, owned in full: product-spec §4 runtime + install story ("the npm package
  exists so build platforms can install unify; author-facing installs remain the binary and
  bun"); §2/§8 runtime-neutral phrasing; cli-reference; getting-started; README. New
  conformance **§34 "The host contract"** — consolidating §14.1/§15/§16/§18/§24.4/§31/§33
  and adding only the genuinely new sentences (Node floor; bin-runs-under-node; generator
  runtime inheritance; cross-runtime diagnostic identity *scoped to the fixture corpus*).
  **No `unify.yaml` detection marker** — it violates §18's closure, is untestable under the
  traceability regime, and `init` doesn't create one.
- Gates: a dual-runtime conformance leg driven by explicit harness argv (not an env var),
  per-row runtime stamps in the ledger, `check-traceability` requiring both legs; a tarball
  smoke test in a Bun-free container asserting **observable output** (scaffold exists, dist/
  tree correct, `--version` bytes, no `bun` in `node_modules`) — never exit codes alone (the
  repo's own M2 trauma: 93% coverage on a broken product).
- Same release, `docs/integrations.md` **Recipe 5: prototype in a Pen, ship as
  `.fragment.html`** — the uploaded assessment's Posture C. The only CodePen path that fits
  the three-file free cap, works today, needs zero cooperation, and is honest. CodePen-side
  literals carry a provenance date (a stated governance carve-out from "every literal
  tested", since CI cannot reach codepen.io).
- Owner-action precondition track for Phase 4: confirm/flip repo visibility, working
  releases, the Windows story — the petition is credible only with Pens, users, and a public
  repo to point at.

**Value, independent of CodePen:** unlocks every Node-shaped host at once — deploy platforms,
GitHub Actions, StackBlitz WebContainers (Node-only), vscode.dev-adjacent tooling, and every
designer who has Node but not Bun — and deletes 99MB from every consumer install.

### Phase 2 — the seam and the library entry (after 1.0; spec'd before coded; ~2–3 weeks)

New conformance section ratified first, then:

- **SourceTree interface** (`list/isFile/readText/readBytes`) with two implementations:
  `fsTree` (owns today's readdir/realpath/symlink containment) and `mapTree` (virtual root;
  validates keys — no leading `/`, no `..`, no backslashes; normalizes bytes once at the
  boundary). Touches the ~13 verified read call sites.
- `build()` returns `{ exitCode, tree, manifest, findings, diagnostics, published }`; output
  snapshot injected (empty Map for virtual runs); `urlForOutputPath` relocated to `urls.js`;
  `consumeLastAuditRun` replaced with a threaded value.
- **`buildTree({ files, generated?, ...flags })` / `auditTree`** as subpath exports of the
  *one existing package* (no `@fwdslsh/unify-core`). Tree as immutable value, no callbacks.
  `output: Map | null` — never partial — **plus an explicit `published` boolean** (under
  `--strict`, advisories flip exit 1 without withholding output; hosts must not misread the
  transactional law). `generated:` projects §33's overlay as a value with §33.4's collision
  rules verbatim, so the shipped blog template previews truthfully.
- **Frame legislation — the debate's most important fix:** diagnostics pin to the
  source-root-relative path frame for the library (the CLI's cwd relocation becomes
  shell-side presentation), and **§31.2's fingerprint hash input pins to the
  source-root-relative path for both surfaces** — a breaking fingerprint change done once,
  now, before any second surface exists, so CI suppression lists survive moves between
  `unify audit` and `auditTree`.
- `unify.yaml` in a virtual tree: honored exactly as the CLI honors it, options argument in
  the CLI-wins role; shell-concern keys (`source, output, clean, port, generate`) in a
  virtual tree are located problems, never silent no-ops — diagnosed, never honored, the
  house reflex.
- Gates: `rules.tsv` gains a `cli-only`/`dual` column; the equivalence tier byte-diffs CLI
  `dist/` against the library's Map on the same trees through the existing comparator; and
  **the CLI itself consumes `fsTree`** — the library's first consumer is the product, so
  equivalence is structural, not aspirational.

### Phase 3 — browser artifact + first-party playground (after Phase 2; ~2–4 weeks)

- Purity patches with the complete verified list (TextEncoder shims, `paths.js` split,
  Reporter sink-less by default, posix pathkit, `crypto.subtle.digest` for fingerprints —
  never a vendored SHA-256), enforced by a **G-PURE import-graph gate** (no `node:`/`Bun.`/
  `process.` in the library entry's transitive graph) plus a browser-execution fixture smoke
  run in a Worker — bundling alone proves nothing.
- `dist/unify.browser.js` exported as `./browser`, MPL/MIT notices preserved through bundling.
- **First consumer: unify's own docs "try unify" playground.** Self-hosted — no esm.sh
  transform drift, no paywall, no underscore problem — and the genuinely hard preview
  mechanics (root-relative URLs resolving against the host origin in an iframe, link
  interception, serving assets from the output Map) get solved under unify's control, with a
  spec'd section if preview chrome ships in-repo.
- **The CodePen previewer**: a provenance-dated, PRO-tier-disclosed recipe published only
  after four on-platform spikes pass from an unblocked machine: (a) underscore files are
  fetchable from the preview iframe; (b) fetch returns authored bytes, not
  Compiler-instrumented HTML; (c) `.md` auto-Block interaction; (d) preview-file selection.
  If underscore files aren't fetchable, **do not fork the authoring idiom to compensate** —
  the previewer simply stays a playground/docs feature.

### Phase 4 — ecosystem/political (parallel; gated on public repo + adoption signal)

SARIF CI recipe (documentation-only — the fingerprinted SARIF already exists); self-serve
`netlify.toml`/`vercel.json` recipes as the committed deliverable, preset PRs as best-effort
(the named preset vehicles are gatekept or archived); a StackBlitz "try unify" link (free once
Phase 1 ships — WebContainers are Node-only); and the **CodePen Block petition, reframed**:
its near-term value is reconnaissance (learning where Blocks execute; Eleventy's Block implies
server-side Node, which favors the keystone substrate) and demand-building. Cost: one support
message. Send it after Phase 1, citing the Eleventy precedent and the Node-clean package.

## 5. Do NOT build

- **Resolve/load callbacks or any plugin/hook API** — host code executing during composition
  is a second way to compose, a network vector, and a determinism hole. The tree-as-value
  seam covers every real host. (Unanimous.)
- **A page-scope `compilePage`** — unify's guarantees are site-scoped; a page API is unify
  minus its guarantees.
- **A separate `unify-core` package** — subpath exports + the purity gate buy the boundary
  without a second release surface to drift.
- **The in-Pen previewer as headline or free-tier claim** — 3-file cap + underscore mechanics
  make it a PRO-tier maybe; the first-party playground comes first and spikes decide.
- **Client-side composition as a deploy path** — an engine Pen deployed to `*.codepen.app`
  ships uncomposed source plus a runtime: the no-client-runtime law broken by unify's own
  recipe. Design-time workbench only, stated in the recipe.
- **Host-facing mute/suppress/severity-remap over build diagnostics, or any score** — red
  lines the data model already makes impossible; keep it that way.
- **WASM** — the engine is pure JS; WASM adds a toolchain for zero portability gain.
- **Incremental/cached recomposition for hosts** — full-rebuild-only is law; hosts debounce,
  unify rebuilds.
- **Any CodePen-specific (or host-specific) code in `src/`** — hosts meet unify at the
  contract: files in, files out; tree in, tree out.

## 6. Open items the debate surfaced but did not settle

Nobody — three designs, six critiques — addressed these; they are work, not footnotes:

1. **Embedded-use security posture**: hostile Maps (adversarial keys, unbounded trees,
   pathological markdown, deep include chains) — the CLI's threat model (author's own disk)
   does not transfer; the library needs a trust statement and bounds.
2. **API versioning**: `schemaVersion` covers only the audit JSON today; the `buildTree`
   result shape and diagnostic records become semver-bound surfaces needing their own
   versioning and a spec-amendment propagation rule.
3. **MPL-2.0 bundling mechanics**: Exhibit A notice preservation through the browser bundle;
   esm.sh/CDNs serving *transformed* copies of MPL-covered files.
4. **A named first external consumer** and an adoption tripwire that green-lights Phase 3
   spend versus stopping at the keystone.
5. **Virtual-tree text normalization**: CRLF/BOM in Map values, Windows separators in keys,
   cross-OS byte-identity — the dual-*runtime* axis got argued at length; the dual-*OS* axis
   on the same determinism claims did not.
6. **Supply-chain integrity**: npm provenance attestations, 2FA, SRI/checksum guidance for
   any CDN-served artifact.
7. **A ratification round through a library/browser host** — the existing protocol validates
   the authoring surface empirically; a round conducted through `buildTree` or the playground
   is the experiment that catches host-forked authoring idioms before they ship as recipes.
8. **A performance budget for full-rebuild-per-edit in interactive hosts** — the one place
   the no-incremental law actually bites, currently unquantified.

## 7. Corrections to the prior assessment

The uploaded "Authoring unify sites in CodePen 2.0" holds up well on postures and hazards;
three of its load-bearing beliefs do not survive contact with the code and registry:

- *"Bun-only … is the thing most likely to block it forever"* → the composition core runs on
  Node today [verified]; the block is one packaging release.
- *Implicit: the npm package is currently unusable without Bun* → `npx unify` works today on
  a Bun-free machine — by silently installing a 99MB Bun binary into the consumer's
  `node_modules` [verified]. The current state is not "Bun-only"; it is "Node-hostile by
  accident and 99MB overweight."
- *The Block conversation should wait on "deciding the Bun question"* → there is no Bun
  question to decide; there is a keystone release to ship, after which the petition costs one
  message and the same package serves every other host on the list.
