# Agent-authorship panel — chair's synthesis

**Date:** 2026-08-11
**Method:** 10-agent debate (5 position papers → 4 adversarial critics → synthesis) against product-spec.md Draft v2.
**Status:** recommendations only — nothing applied to the spec.

---

# unify spec v2 — agent-authorability review: chair's synthesis

*Panel: 5 position papers, 4 adversarial critiques. All line/section references verified against `/home/founder3/code/github/fwdslsh/unify/docs/product-spec.md` (347 lines), plus `git show aa67fdd`, `docs/dom-spec.md`, `CLAUDE.md`, and the panel's five scratchpad rule-file drafts.*

---

## 1. Verdict

**Yes — unify spec v2 is the best substrate for agent authorship in the SSG ecosystem, and it is that way because of §5, not §3. But it currently has six places where a spec-compliant agent produces wrong output on a clean, exit-0 build, and four of those are the spec contradicting itself rather than the agent misreading it.**

**The strongest evidence for.** The decisions that make unify agent-safe were made for humans and are load-bearing product commitments, not accidents: §5's "No templating language" deletes the entire code-generation surface on which models hallucinate (there is no Liquid-vs-Nunjucks-vs-Go-template to get wrong); §5's "No configuration language" deletes the key space agents invent into; §1 rule 2 makes every source file plain HTML, the densest region of any model's distribution; §3.5's URL provenance removes the one computation a single-file editor cannot perform; §4's post-build reference check converts the agent's highest-frequency error — a path to nothing — into a located, publish-blocking failure that no other generator provides out of the box; §4's all-or-nothing publish makes exit 0 a trustworthy postcondition; and §7's cut of "short-name layout resolution and every path-guessing heuristic" means the Jekyll instinct `layout: default` fails loudly instead of resolving to something plausible. The compression test passes empirically: I have the deliverable at exactly 60 lines / 692 words below, and five panelists independently produced 50–66-line drafts from this spec unaided.

**The strongest evidence against.** The spec instructs one thing and punishes it. §1 rule 2 orders complete HTML documents; §3.2 rule 2 then buries a page's `<main>` inside the layout's, producing invalid HTML with no diagnostic — and the spec does this *to itself*: §3.2's own blessed chaining pattern (line 155, "section layout → site layout", composing pairwise per line 177) unavoidably feeds a `<main>`-bearing body into a `<main>`. §3 uses the word "warning" seven times for a severity §4 never defines, and two of those cases omit the author's content while §3's own sentence two lines earlier promises "content is never silently dropped." §3.2 line 179 deletes any element carrying any `data-unify-*` attribute while §5 line 247 states the same rule for one marker — and this repository's own `docs/dom-spec.md:86` teaches `<style data-unify-docs="v1">`, which silently deletes the author's element. §4 line 236's `--exclude` guard covers layouts and includes only, so `_draft.html` — §1's own example of the underscore primitive — publishes silently. §2's scaffolded layout declares no `<meta charset>` at all, and §2 is asserted by the end-to-end suite. And §3.2 rule 3 requires every page in every unify site to carry a dangling separator inside its `<title>`, which is the only rule in the document whose correct form looks like a typo.

Five of the six are one-sentence fixes. Every one of them is a defect for the designer first and the agent second — which is the disposition test I applied throughout, and the reason none of my recommendations trade the human audience for the machine one.

---

## 2. The three structural findings that reorganize the debate

Before the recommendations, three things the individual papers could not see and that determine which proposals are admissible.

**(i) The advisory commons is a one-way ratchet and it is already overdrawn.** §5 forbids rule codes; §7 cut `--fail-on`/`--fail-level`; therefore there is no suppression mechanism and none can be added without reintroducing what §5 refuses. Every advisory unify ever ships is permanent, unsilenceable noise for every site that legitimately trips it. §4 lists 5 advisories in line 236 (plus 2 in line 227). The panel's combined proposals take that to ~16 — U001–U008 reassembled with the rule codes filed off. **§4 must state a cap**, or every future finding lands here by default. This kills roughly half of the panel's output on its own.

**(ii) For a human an advisory is information; for an agent it is an instruction.** §5's "plain language, no rule codes" was chosen for human comprehension. Plain imperative English in stdout, landing in an agent's context, gets *obeyed*. "Put the hook on `<body>` instead" is a change request against working code, reissued every session, forever. This is a phrasing constraint, not a code: advisories state what the build observed and what it did, never what the author should do next.

**(iii) The five panel rule-files disagree with each other — and they disagree in exactly the four places I am changing the spec.** Critic 4 read this as evidence against compressibility. It is the opposite: the variance is not in the compressors, it is in the source. The drafts split on the title convention, on whether a page's `<main>` nests, on pinning depth, and on `data-unify-*`. Every other rule compressed identically five times out of five. **The corollary is a sequencing instruction: land §3's fixes before canonizing the rules document, or you will canonize the ambiguity.**

---

## 3. (a) SPEC CHANGES — ranked, six plus a bundle

### S1. The title separator moves into the layout — page titles become natural

**Where:** §3.2 rule 3; §2 lines 68, 89, 116; the §2 end-to-end fixtures.

**The defect.** Line 172 joins with "a space", so the separator must be typed inside each page's title. §2 teaches this three times (`<title>Home —</title>`, `title: About —`). A page writing `<title>Home</title>` emits `<title>Home My Site</title>` — on every page, in every tab, bookmark and search result, with a clean build and exit 0. I traced every catch mechanism in §4 lines 235–236: nothing covers it. Corroborating evidence the panel produced without noticing: one panelist's own careful draft encodes it as `<title>About — </title>` with a trailing space, which under a space-join emits a double space.

**Exact change.** §3.2 rule 3, first clause:

> The page's `<title>` is prepended to the layout's, joined with a space, so the separator is written once, in the layout: layout `<title>— My Site</title>` plus page `<title>Home</title>` emits `<title>Home — My Site</title>`. Pages write only their own name; a page with no title keeps the layout's alone.

§2 line 68 → `<title>— My Site</title>`; line 89 → `<title>Home</title>`; line 116 → `title: About`. Line 98's built result is unchanged.

**Why not the panel's preferred fix.** Two of four critics ruled for hardcoding ` — ` into the join. I rule against it, siding with the second-order critic. Hardcoding relocates the silent failure rather than removing it (`<title>About — My Site</title>` then emits `About — My Site — My Site`, which is worse and which its own proposer had to add an advisory to catch), and it bakes a Latin-typography decision permanently into a tool that forbids configuration — a CJK or `|`-separator site would have to delete the layout's title and retype the site name on every page, which is precisely the cost `aa67fdd` was written to remove ("title-retyping removed from the accepted-costs list"). The layout-side separator delivers that commit's stated goal — "site name lives in one file" — while dropping its means.

**Cost to the human audience.** One: the layout's own standalone preview shows "— My Site" in the browser tab, and a title-less page emits the same. That wart lands in exactly the file where §2 line 62 already declares the content to be placeholder ("Its default content is its own preview") — the same file whose `<main>` reads "Page content appears here." It is in character, it is visible where the author is already looking, and there is one of it instead of N. Everything else improves for designers: `<title>About</title>` is what they type by instinct.

**Design rules brushed.** None. Still one sentence (rule 1), zero mechanism change — the join stays "a space", so the polyfill is untouched (rule 3), and no configuration is introduced (rule 4).

---

### S2. A `<main>` in incoming body content is unwrapped — including in layout chains

**Where:** §3.2 rule 2.

**The defect, in the form nobody in the panel found.** Two papers found the page-authored version: §1 rule 2 demands complete documents, complete documents carry `<main>`, and rule 2 buries it, yielding `<main><main>…</main></main>` — invalid HTML that breaks landmark navigation and every `main > *` selector, with no problem and no advisory (line 236 names `<header>`/`<footer>`, not `<main>`). But the decisive case is that **the spec does this to itself**: line 155 blesses chaining "(section layout → site layout)"; line 177 says chains "compose pairwise"; line 160's last clause means a section layout must contain `<main>` to receive a page at all. So step two feeds a body containing `<main>` into the parent's `<main>`. The only escape — writing `<main class="unify-content">` on the section layout — routes straight through the rule-1/rule-2 precedence gap that §7 item 2 already concedes is "the case that made the original four rules ambiguous."

This is why the narrower wording one panelist proposed ("a page whose body is a single `<main>` wrapping everything") does not fix the spec's own documented pattern. The unwrap must be general.

**Exact change.** §3.2 rule 2, appended:

> Incoming body content is unwrapped once: if it contains a `<main>`, that element is replaced by its children before the merge — so a page written as a complete semantic document, and a chained layout's own `<main>`, both compose without nesting `<main>` inside `<main>`. No other element is unwrapped.

The final four words are the anti-creep clause and are load-bearing; without them this attracts "why not `<article>`, why not `<div class="wrapper">".

**Cost to the human audience.** Strictly positive: it removes invalid HTML from the output and rewards the semantic markup §1 rule 2 asks for instead of punishing it. The only loss is attributes on the page's own `<main>`, which is exactly how rule 1 already treats a page's area element.

**Design rules brushed.** §1 rule 3 (polyfill budget) — one unwrap step, trivially inside 200 lines. Do *not* pair it with an advisory; the unwrap makes the case correct rather than reportable.

---

### S3. Delete "warning" from §3; two severities only; one general content-loss rule

**Where:** §3 lines 138, 159, 160, 172, 177 (seven occurrences); §4's error-contract bullet.

**The defect.** §4 defines exactly two levels — problems (line 234: publish gated on zero; exits non-zero) and advisories (line 236: "print but never affect the exit code"). §3 uses a third word that appears nowhere in §4 and is never bound to either. Two of its uses accompany content loss on a clean build, and line 177's "unaddressed page content is omitted with a located warning" sits two sentences after that same paragraph's promise that "content is never silently dropped." An agent whose entire perception is the exit code is told success by a build that omitted a page's content; a designer cannot tell whether `--dry-run --strict` (the CI line §4 recommends) actually checks the rules §3 defines.

**Exact change.** Delete "warning" from §3 and assign explicitly:

| Case | Severity | Reasoning |
|---|---|---|
| §3.1 include cycle / depth violation | **problem** | A truncated chain is content the author wrote that does not appear. |
| §3.2 layout has areas but no `<main>`, unaddressed content | **problem** | Content loss. |
| §3.2 duplicate area class in a layout (first wins) | advisory | Hygiene. |
| §3.2 duplicate `<main>` in a layout (first wins) | advisory | Hygiene. |
| §3.2 page `<meta charset>` **identical** to the layout's | *silent* | Every correct page has one, per §1 rule 2. |
| §3.2 page `<meta charset>` **differing** from the layout's | advisory | The only genuine conflict. |
| §3.2 page area class matching no layout area | advisory | Line 177 designs the reroute; nothing is lost. |
| §3.2 layout with no `<main>` and no areas | *silent, and clarified* | See below. |

That last row is a subtraction: replace line 160's final sentence with "A layout with no `<main>` and no areas contributes its head and passes the page's body through unchanged." A head-only layout (shared stylesheet, shared metas, no body chrome) is a legitimate and useful construct; warning on it fires on a correct site.

Then one general rule appended to §4's error contract, which assigns every future case without an enumeration:

> **Content the author wrote is never dropped without failing the build.** If page content or a head element would not appear in the output — a layout with areas but no `<main>`, a `<main>` with no unpinned children to replace — that is a problem, located, naming the fix. Advisories never involve losing something the author wrote.

Plus one free rider that costs nothing and helps disproportionately: *every message about an area or a layout names the layout file it was checked against.*

**Cost to the human audience.** None from the taxonomy — it names what the two-level design already implies. Two cases become build failures instead of silently empty pages, which is the outcome a designer wants, and `dev`/`watch` still render the located diagnosis in the browser (line 233).

---

### S4. Publish safety, advisory discipline, and the cap

**Where:** §4 line 225 (`--exclude` prose), line 235 (error contract), line 236 (advisories).

**The defect the whole panel got partly wrong.** Four papers flagged that `--exclude` replaces the `_*` default (line 225 states this explicitly — one paper's claim that "the spec never says it" is simply false) and that the guard is an advisory, hence exit 0. But all four then promoted or reworded a guard whose scope is "a file used as a layout or include that also ships as its own page" — which does not cover `_draft.html` (§1 table row 4's own example of the primitive), `_scripts/gen-blog.mjs` (a copied asset, not a layout or include), or `_notes/`. `_notes/spec-remediation-plan.md` R1 ratified replace semantics on the premise that the hazard "is already caught by an existing advisory." That premise is true for layouts and false for everything else. This is a direct §8 failure: "Nothing you didn't mean to publish ever reaches `dist/`."

**Exact changes.**

1. **Keep replace semantics.** Settled across five commits, confirmed by R1, and required so a Netlify site can ship `_headers` and `_redirects` — which §4 line 226's dotfiles-ship reasoning says this audience needs. Do not make `--exclude` additive; nobody proposed it and I am pre-empting round two.

2. **New problem in §4's error contract**, scoped literally, with no heuristics:
   > An emitted file whose path contains a `_`-prefixed directory segment, or that is a `_`-prefixed `.html`/`.md` page, is a problem naming the file and the `--exclude` line that fixes it — replacing the default can never silently publish the build's own working files.

   This closes `_layout.html`, `_includes/`, `_scripts/`, `_notes/`, `blog/_draft.md`, and deliberately still permits root-level non-page files like `_headers` and `_redirects`. Line 225's parenthetical becomes: *"(replacing the default without covering what the build consumes stops the build and prints the line that fixes it: `--exclude '_*' --exclude 'drafts/**'`)"*.

3. **Delete** the advisory "a `unify-*` area no page ever overrides" from line 236. §2's scaffolded `_layout.html` carries `<footer class="unify-footer">` and no scaffolded page overrides it — the override at lines 100–110 is illustrative prose, not a file — so `unify init && unify build --dry-run --strict`, the spec's own scaffold under the spec's own recommended CI line, exits non-zero. Worse, the advisory reports §3.2 rule 2's own documented behavior (line 171: "a page supplying only content keeps the layout's default hero") as a defect. Keep the general "a file used as a layout or include that also ships as its own page" as an advisory for the non-underscore case.

4. **State the cap and the phrasing constraint**, appended to the advisories bullet:
   > The list above is closed and fits on one screen. An advisory that fires on a correct site is a bug in the advisory: `unify init && unify build --dry-run --strict` exits zero, and the end-to-end suite (§7 item 15) asserts it. Every entry names the single edit that clears it, printed as a line you can paste where the fix is mechanical. Adding an advisory means removing one — there are no rule codes (§5), so there is no way to silence one you have chosen to accept, and every advisory unify ships is permanent. Advisories report what the build observed and what it did; they never tell the author to restructure markup that composed correctly.

5. **One clause of publish-safety honesty** in §4 line 225, completing line 60's own reasoning: *"Everything in the source root ships unless a glob holds it back, so anything that is not part of the site — notes, drafts, working files, scripts — belongs under a leading underscore."*

**Net effect on the advisory list: 5 → 4.** I am shrinking it while closing the safety hole.

**Cost to the human audience.** A site deliberately publishing an underscore page must rename the file — essentially nobody wants that. Deleting the unoverridden-area advisory loses an occasional dead-area-name catch; that is paid to make `--strict` mean "something is wrong," which is worth more to a designer running CI than to anyone.

**Design rules brushed.** §5's no-governance-machinery — which is why the cap is stated as prose discipline, not a suppression mechanism.

---

### S5. Narrow `data-unify-*` to one literal marker — and Cut the convention it collides with

**Where:** §3.2 line 179; §3.3 line 183; §7 Cut list.

**The defect.** Line 179 removes "any element the author marks with a `data-unify-*` attribute" — an open namespace that exists to serve exactly one post-MVP script tag (§6 item 3) — while line 247 states the identical rule narrowly for that one tag. §3.3 line 183 claims a closed attribute set that line 179 contradicts. Silent, total deletion of an element and its subtree is the worst failure class in the document, and this repository actively teaches authors into it: `docs/dom-spec.md:50/80/86`, `docs/include-syntax.md` (5 sites), `docs/getting-started.md:52/149`, `docs/app-spec.md` (4 sites), and `CLAUDE.md:120` all teach `<style data-unify-docs="v1">`.

**Exact changes.**

§3.2 line 179 → *"`data-unify` attributes are removed from output, and a `<script>` carrying `data-unify-polyfill` is removed with it (§6 — an author-signed request to strip a design-time aid, not unify deciding to touch the author's JavaScript). That is the only marker: any other `data-unify-*` attribute, and `data-unify` on any element other than a page's or layout's `<html>` or `<body>`, is a problem naming the element and the file — the latter naming `<include src="…">` as the replacement, since `data-unify` is never a component import. `unify-*` classes are **kept** in output."*

§3.3 line 183 → *"the only attributes are `data-unify` and the single marker `data-unify-polyfill`."*

**And the consequence nobody traced:** narrowing the rule means every `<style data-unify-docs>` block in a repo that followed the published docs **starts shipping into production HTML**, because `dom-spec.md:86` currently promises they are stripped. Add to §7 Cut:

> `<style data-unify-docs>` contract blocks and their build-removal behavior — taught in `dom-spec.md`, `app-spec.md`, `getting-started.md`, `include-syntax.md`, and `CLAUDE.md`; §3.3's class prefix is the only area-discovery mechanism the product ships. (§5 already refuses "contract/documentation blocks".)

**Why a problem and not pass-through.** One critic argued that once narrowed, a stray `data-unify-area="hero"` is an inert data attribute and unify should leave it alone. I rule against: pass-through converts a silent deletion into a silent no-op, and the agent that believed it was slotting never learns. The line that ages correctly is **validate unify's own closed grammars, never blocklist another tool's vocabulary** — `data-unify` is unify's name with exactly two members, so a third is unambiguously an error and needs no maintenance. The same principle admits `layout:` accepting only a path or `none`, and forbids the `draft`/`tags`/`permalink` blocklist several panelists wanted (see rejections).

---

### S6. Settle rule 2's pinning scope and the `<main class="unify-*">` precedence

**Where:** §3.2 rule 2. Required work regardless of agents — §7 item 2 already names it.

**The defect.** One sentence in line 160 states pinning at two scopes: "areas inside `<main>` are pinned" (any depth) and "only `<main>`'s *unpinned* children are replaced" (direct children). Under the direct-child reading, `<main><div class="grid"><section class="unify-hero">…</section></div></main>` deletes the wrapper and the area with it — and wrapping a hero in a container is an ordinary designer move. Separately, a layout writing `<main class="unify-content">` is governed by rules 1 and 2 simultaneously with no precedence; per S2, that construct is the escape hatch from chained nesting, so this is blocking, not academic. And `unify-content` is not reserved, despite `CLAUDE.md:61` and `:117` presenting it as canonical.

**Exact change.** Replace rule 2's pinning clause:

> …except that a direct child of `<main>` is **pinned** if it, or any element inside it, carries a `unify-*` class: pinned children stay exactly where the layout put them, and only the unpinned children are replaced. If the layout's `<main>` itself carries a `unify-*` class, rule 1 governs it and this rule does not apply. No area name is special — the default slot is `<main>`, and `unify-content` is an ordinary area.

The all-pinned-`<main>` case needs **no clause**: S3's general content-loss rule already assigns it as a problem naming the fix. Worked input→output pairs go to the conformance spec per §7 item 16, where each doubles as a fixture.

**Cost to the human audience.** Rule 2 grows by a clause. §7 item 16 already concedes exactly this about exactly this rule: "a rule the author learns in one sentence may still need a page of edge cases to implement identically twice."

---

### S7. The copy-edit bundle — eleven one-liners, each stating something already true

Every item is a clarification, a subtraction, or a correction. None adds a concept, command, or flag.

| # | Where | Change |
|---|---|---|
| 1 | §2 line 68 | Add `<meta charset="utf-8">` to the scaffolded layout. **`charset` appears exactly once in 347 lines and the golden-path site — which §2 says the E2E suite asserts — ships pages with no charset at all.** |
| 2 | §3.2 rule 3 | "A page `<meta charset>` is dropped in favor of the layout's; **if the layout declares none, the page's is kept and moved first**." (Currently undefined, and the scaffold hits it.) |
| 3 | §3.2 item 5 | **Delete** `_includes/layout.html`; renumber item 6 → 5; update §7 item 1 to "(§3.2 item 4)". Item 4's upward walk already finds `src/_layout.html`. It is the only place in §3.2 where a filename must be memorized rather than derived, and it inverts the underscore convention (underscored directory, unprefixed file). Nothing depends on it. |
| 4 | §5 no-templating bullet | **Delete** "an active nav state" from the accepted-costs list, and append: *"Active nav state is not in that list: the page sets `<body class="home">` (§3.2 rule 4) and the stylesheet does the rest — `body.home .nav-home { … }`. Styling only, no `aria-current`; that is the trade."* The spec is apologizing for a cost rule 4 already pays, and an over-pessimistic non-goal is exactly what makes a capable author (or agent) build a Node script for a one-selector CSS problem. |
| 5 | §3.4 | Append: *"There are no other reserved keys — unify has no `date`, `tags`, `categories`, `draft`, `permalink`, or `slug` behavior; those are other generators' features and here become plain `<meta>` tags. A leading underscore (`_draft.md`) is how a page is held back. A list value emits one `<meta>` per item, in order."* (The list case is genuinely undefined today and sits on §5's own sanctioned blog workflow.) |
| 6 | §3.4 | Slug algorithm, executable as written: *"(lowercase; each run of whitespace becomes one hyphen; every remaining character that is not a letter, digit, or hyphen is dropped; leading and trailing hyphens trimmed; a repeat within the page gets `-2`, `-3`)"*. As printed, a space **is** a non-word character, so "Getting Started" → `gettingstarted`. |
| 7 | §3.2 rule 3 | *"Exact-duplicate stylesheet/script URLs are deduplicated, **compared after §3.5 resolution**, so a page's `assets/style.css` and a layout's `/assets/style.css` are one reference."* Today head merge runs during composition and §3.5 resolves "after includes and layouts" (line 197), so both ship — a double download, or a doubled analytics pageview. The author who caused it was obeying §3.5's headline instruction. |
| 8 | §3.5 / §4 line 235 | §3.5: *"Rewriting applies to `href`, `src`, `srcset`, and `poster`. It does not reach inside `<style>` blocks or `style` attributes: a `url()` written in a layout or fragment must be root-relative, or live in a stylesheet file."* §4, one durable principle instead of a growing list: *"The reference check reads every URL the output contains, not only the ones rewriting touches — so anything the rewriter does not reach fails loudly instead of 404ing quietly."* Line 229 already concedes `content` on og:/canonical carries URLs while §3.5 excludes it. |
| 9 | §4 line 237 | `--dry-run` names the resolved layout: *"…each page naming what it composed from — `write dist/about.html ← about.md + _layout.html`, `← posts/hello.md + posts/_layout.html + _layout.html` for a chain, `← 404.html (no layout)` for an opt-out."* Layout resolution is the only fact in §3 not readable from a single file. Content in an existing report, in the mode whose purpose is "tell me what you would do." |
| 10 | §4 lines 217/236 | Resolve the `--strict` contradiction. Line 236: "`--strict` promotes them to problems for CI" → *"with `--strict` they affect the exit code too — never what is published, so a stray `.psd` can never cost you a publish."* Then one sentence: *"Exit 0 means the site was published (with `--dry-run`, would have been); non-zero means nothing was published and the previous `dist/` is untouched — except under `--strict`, where advisories alone also exit non-zero without changing what was published."* No exit-code table (see rejections). |
| 11 | §4 line 235 | *"Diagnostics go to stderr; the build summary and `--dry-run` list go to stdout; both are ordered by path then line, so two runs over the same tree print the same bytes. Each line begins with its location and severity (`src/about.html:12: problem: …`). The location prefix and severity token are stable; the message text is prose and is not a contract."* Use `problem:`/`advisory:`, never `error:`/`warning:` — introducing a third vocabulary immediately after deleting "warning" would be self-defeating. The exact grammar goes to the conformance spec. |

**Two more, honesty edits.** §1 rule 2: change "opens, lints, and edits anywhere" to **"opens and edits anywhere"** — `<include>` is an unhyphenated unknown element, so the W3C validator rejects every unify source file ("Element include not allowed as child of element body"); two panelists built an "agents can self-verify with a parser" strength on a promise the spec cannot keep. And §3 line 132: "(normative — this section is the complete spec)" → **"(normative — the composition rules; §4 carries the file, exclusion, and error rules)"**, because anyone compressing "the complete spec" from §3 alone drops the underscore-exclusion semantics entirely.

---

## 4. (b) NON-NORMATIVE ARTIFACTS — nothing in the tool, and the highest ratio in the review

### N1. `docs/authoring-rules.md` — the canonical 60-line file *(do this today)*

The product owner's requirement is that the rules be **easy to provide** in a small context. That is fully satisfied by one canonical, quotable, curl-able file at a stable path — pasteable into a system prompt, a skill file, or a `CLAUDE.md`, linkable from anywhere, and updated with the tool rather than frozen in someone's repo. Section 5 below is that file, ready to ship.

- **Canonical source:** `docs/authoring-rules.md` (60 lines, 692 words, ~950 tokens).
- **README** embeds it verbatim as its reference section; one test asserts byte-identity, so §8's "the README teaches 100% of the product" holds with one source of truth.
- **One §8 criterion** (the only spec-side half): *"The rules an author needs fit on one screen. `docs/authoring-rules.md` states every rule and nothing else, in under sixty lines; the end-to-end suite (§7 item 15) builds the §2 site driven only by it."* This is the load-bearing half — it makes the compression a countable test that cannot rot, and it serves the designer at least as much as the agent.
- **Sequencing:** publish it *after* S1–S6 land. Writing it against today's §3 canonizes the four ambiguities the panel's five drafts split on.

### N2. `unify init` writes `AGENTS.md` — **defer, do not kill**

All five panelists proposed it; two critics killed it outright. Both are half right, and the argument each side missed is the same one.

*Against:* it stamps a mutable rule set into thousands of repos unify can never update; it bets on a filename convention with a short half-life; `init` would claim a project-root file it does not own; and it is the first thing in the scaffold not addressed to a designer.

*For, and nobody said this:* the staleness objection is weaker for unify than for any tool in the ecosystem, **by unify's own promise**. §8: "A site built today builds identically in five years. No toolchain churn." A product that commits to not changing is precisely the product whose per-repo rules file does not go stale. The objection is transitional, not permanent — and right now, pre-realignment, it is at its strongest, because this review is changing four rules.

**Ruling:** ship N1 now; scaffold `AGENTS.md` after realignment, as a byte-identical copy of `docs/authoring-rules.md`, at the project root beside `src/` (outside the source root per §2 line 50, so it can never ship), headed "Authoring rules" so it reads as a human cheat sheet, with a test asserting identity and an explicit commitment in §2: *"the only file unify will ever scaffold for a tool rather than an author."* That commitment is what turns the camel's nose into a closed door.

### N3. Make the `init` templates exercise each primitive exactly once

The best rules document for a repo-resident agent already ships and nobody costed it: §2's scaffold is a working, correct, minimal instance of the whole model, and every panelist independently observed that an agent reads one `_layout.html` and infers the system. Today the scaffold demonstrates include, layout, and underscore — but **no page overrides an area**, and no page opts out. Add one page that overrides `unify-footer` and one `404.html` carrying `data-unify="none"`. Zero new concepts, zero tool surface, and it serves designers and agents identically. §7 item 10 is already rewriting the templates.

### N4. Repo documentation is actively teaching agents wrong things, today

`docs/dom-spec.md:35` states: `data-unify="/components/card.html"` "(on any other host element) — triggers **component mode**". `CLAUDE.md` labels that file the normative reference. §7 cuts component mode from the implementation but cannot cut it from what agents have already read — and today writing that construct emits an empty `<div>` with no diagnostic. Together with the `data-unify-docs` convention (S5) and `.unify-content` presented as canonical in `CLAUDE.md:61/117`, this repository is the single largest source of wrong unify priors in existence. **Retiring `dom-spec.md` and rewriting `CLAUDE.md` is worth more to agent correctness than any spec sentence in this review**, and §7 item 16 already schedules it. Move it earlier.

### N5. Route the precision findings to the conformance spec, not to §3/§4

§7 item 16 names the destination and the exact categories: "every §3 merge rule with worked input→output examples, the collision matrix, URL rewriting order, the watch contract, the error/advisory taxonomy." That is where the pinning worked examples, the diagnostic line grammar, `--exclude` glob match depth (*"globs match a source-root-relative path segment by segment, so `_*` covers `_layout.html`, `blog/_draft.html`, and everything under `_includes/` and `_scripts/`"* — line 238 already settles the intent, it is a wording gap), frontmatter list serialization, and the textual-inlining consequences belong. The panel proposed appending all of it to the document it simultaneously says must compress.

### N6. Two cookbook entries for §6 item 1

- **Generated-file ownership.** §4 line 238 celebrates generated and hand-authored files being indistinguishable. That is a virtue when the author wrote the generator and a data-loss path when an agent wrote it in thirty seconds and the designer later hand-edits `blog.html`. One-line convention, established before the pattern scales: generated files carry a first-line comment naming the script that owns them.
- **Adopting an existing site.** The honest path when the first `unify build` reports N pre-existing stale links: they are all reported in one pass (line 234), and `unify watch` — "no server" (line 206), same write contract (line 232), error pages (line 233) — gives you composed output on disk with no browser while you work through them.

---

## 5. The deliverable — `docs/authoring-rules.md`, 60 lines

*Written against the spec **as amended by S1–S6**. If the owner declines S1, line 44's title clause reverts to "the page carries the separator: `<title>About —</title>`"; if S2 is declined, delete "Your own `<main>` is unwrapped…" from line 38. Everything else is independent.*

```markdown
# Authoring a unify site — the complete rules

unify composes plain HTML files at build time. No template language, no variables, no loops, no
config, no JavaScript: if you reach for `{{ }}`, `{% %}`, `<slot>`, or a config key, you are solving
it wrong. The product is four primitives — include, layout, area, underscore. Anything derived from a
set of files (a post index, a feed) is a zero-dependency script under `_scripts/` that emits real
files into the source tree, run first: `node _scripts/gen-blog.mjs && unify build`.

## Files
- Source root is `src/` if it exists, else the current directory. `.html`/`.md` are pages; every other
  file is copied byte-for-byte to the same path. Write `href`/`src`/`srcset` correct for the file you
  are editing — unify rewrites them for the composed page, so never hand-compute `../`.
- **Everything in the source root ships.** Anything that is not part of the site — notes, drafts,
  scratch, scripts — goes under a leading underscore (`_notes/`, `_draft.html`, `_scripts/`): the
  build still reads it, the output never contains it.
- Every file you write is valid standalone HTML — pages and layouts are complete `<!doctype html>`
  documents, fragments are balanced snippets. Never a partial page.

## Include — reuse a fragment
`<include src="/_includes/nav.html"></include>`, always with the closing tag; `/…` resolves from the
source root, anything else relative to the including file. Works anywhere: `.md` pages, `<head>`,
inside other fragments.

## Layout — chrome around a page
Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent; the page says
nothing. Pick another with `data-unify="/path.html"` on the page's `<html>` or `<body>` (Markdown:
`layout: /path.html`); opt out with `data-unify="none"` or `layout: none`. A bare name like `default`
is not a path, and `data-unify` means nothing anywhere but `<html>`/`<body>` — never a component import.

## Merging a page into its layout
- **Area.** A layout element with a `unify-*` class is a public area; list them with
  `grep -o 'unify-[a-z0-9-]*' src/_layout.html`. A page element with the same class replaces that
  area's **children** — the layout's tag, id and attributes stay, and attributes on your element are
  discarded. Omit an area and the layout's default stays.
- **Default slot.** Everything else in your body replaces the children of the layout's `<main>`,
  except children containing a `unify-*` class, which stay put; your content lands where the first
  replaced child was. Everything else the layout put in `<main>` is placeholder and is deleted —
  wrappers you want on every page go outside `<main>`, or carry a `unify-*` class. Your own `<main>`
  is unwrapped, so a page may be a complete semantic document. A bare `<header>`/`<footer>` does
  **not** override the layout's; only a matching `unify-*` class does.
- **Head.** The layout owns `<head>` and declares `<meta charset>` — never write one in a page. Your
  `<meta>` replaces the layout's with the same `name`/`property`; every other head element of yours is
  appended after the layout's, so page CSS wins. `<title>`: yours joins the layout's with a space and
  the layout carries the separator, so layout `<title>— My Site</title>` + page `<title>About</title>`
  gives `About — My Site`. Write only the page's own name.
- **Root attributes.** On `<html>`/`<body>` only, your classes are added to the layout's and any other
  attribute you set wins; attributes merge nowhere else. `<body class="home">` plus
  `body.home .nav-home {…}` is how you do active nav.

## Markdown
`title`, `layout`, `class`, `lang`, `dir` are the only keys with meaning; there are no others. `date`,
`tags`, `draft`, `permalink`, `slug` do nothing and ship as `<meta>` tags — `draft: true` publishes the
page, so hold a page back with a leading underscore instead. Any other top-level key becomes
`<meta name=…>`, a nested `og:` block becomes `property=`. Headings get slug `id`s.

## Finishing
`unify build --dry-run --strict` is the whole build and every check, writing nothing: it reports every
problem in one pass and names the layout each page resolved to. Then `unify build` — exit 0 means
`dist/` is the complete site; non-zero means nothing was published and the previous `dist/` is intact.
Never report success on a non-zero exit. `--exclude` **replaces** the `_*` default; pass `_*` too.
```

Source file at `/tmp/claude-1000/-home-founder3-code-github-fwdslsh-unify/cb22801d-f7f0-4af4-aaba-e885234fe56c/scratchpad/FINAL-authoring-rules.md`.

**What it deliberately omits, and why each omission is safe:** the SSI legacy alias (never write it in new files; reading it is obvious); duplicate area classes concatenating; layout chaining (rare, and after S2 it composes correctly); head dedup; `--base-url`/`--pretty-urls`/`unify.yaml` (flags, not authoring rules); the never-shipped list (a guard, not a rule); the advisory list (each one names its own fix in the terminal). Note what it spends five of sixty lines on: **negative rules** — no `{{ }}`, no `data-unify` on a div, no bare `default`, no `draft:`, `--exclude` replaces. That is the whole tax of near-zero training exposure, it is affordable, and it is the one thing an agent cannot discover by reading a layout: what unify *refuses*.

---

## 6. Genuine disagreements, and my rulings

**1. The title fix — hardcode ` — `, or move the separator into the layout?** Two critics ruled for hardcoding; the second-order critic ruled for the layout. **Ruled for the layout (S1).** Hardcoding relocates the failure to a doubled site name rather than removing it — its own proposer had to add an advisory to catch it — and permanently bakes Latin typography into a tool that forbids configuration, forcing CJK and `|`-separator sites back into per-page site-name retyping, which is exactly the cost `aa67fdd` removed. The layout-side separator changes zero mechanism, preserves the choice, and puts the one remaining wart in the file §2 already declares to be placeholder. This is a chair's call against the majority of critics and the owner should know it.

**2. Should the reference check stop blocking publication?** One panelist's headline product change; three papers and three critics against. **Ruled: keep it as a problem.** The premise is factually false — §4 line 206 defines `unify watch` as "no server", line 232 gives it the same write contract, line 233 emits error pages "while watching" for `dev` and `watch` alike, so an agent gets composed output on disk with no browser. Demoting it also falsifies §5's stated reason for refusing collections (line 256: "its output is checked by the reference check"; line 238: "rename a post and the build reports the stale index link") and contradicts §8 in as many words. The residual friction is real and accepted: there is no *one-shot* non-publishing composition. The answer is `watch`, not a flag.

**3. A page area class matching no layout area — problem or advisory?** One panelist and the second-order critic said problem (invented area names are the modal agent error); one panelist and two critics said advisory. **Ruled: advisory.** Line 177 designs the reroute deliberately and states the promise it keeps — "content is never silently dropped." Nothing is lost, so S3's content-loss bar is not met, and hard-failing it means a designer who renamed an area in the layout gets zero output on every page until they finish editing. `--strict` makes it fatal in CI.

**4. Include cycle / depth violation — problem or advisory?** **Ruled: problem.** A truncated chain is content the author wrote that does not appear, so S3's general rule assigns it automatically. The panelist who filed it as an advisory contradicted the very sentence they proposed in the same finding.

**5. An unknown `data-unify-*` attribute — error, advisory, or leave it alone?** Split three ways. **Ruled: error (S5).** Leaving it alone converts a silent deletion into a silent no-op and the agent never learns. The governing line is *validate unify's own closed grammars, never blocklist another tool's vocabulary*: `data-unify` is unify's name with exactly two members, so a third is unambiguously wrong, needs no maintenance, and ages perfectly. One critic's objection — that this makes unify police the author's attributes, in the family §5 rejects as security theater — is answered by that distinction: this is unify's namespace, not the author's.

**6. Foreign frontmatter keys — error, advisory, or one sentence?** Three remedies proposed. **Ruled: one documentation sentence (S7 #5).** A hardcoded table of Hugo/Jekyll keys must track other tools forever, contradicts §5's no-migration-path, punches a hole in §3.4's open namespace, and is rule-code machinery under a friendly name. The strongest counter — that `draft: true` publishes a page whose author wrote a word meaning *withhold*, failing §8 — I acknowledge and decline: §1's own table already teaches the underscore as the way to hold a page back, and the rules doc states it in the same breath as the trap.

**7. Where does precision go — §3/§4 or the conformance spec?** **Ruled: conformance spec (N5)**, except rules that change what the author *writes* (pinning depth, `<main>` unwrap, the title join), which must be in §3 because an author cannot derive them. This kills the proposed duplicate "§3.0 rules in brief" block with a precedence clause between two normative copies — a drift site and a governance construct §5 forbids, aimed at a job the compact artifact already does.

**8. Advisory philosophy — invariant, or cap?** One panelist stated the correct invariant ("an advisory that fires on a correct site is a bug in the advisory") and then proposed five advisories that fire on correct sites. **Ruled: the invariant is necessary but not sufficient; the cap is the mechanism (S4).** Without it, this panel alone would have taken the list from 5 to ~16 permanent, unsuppressable lines and rebuilt the linter §7 just deleted.

---

## 7. What the panel got wrong or missed

**Missed — the layout-chaining contradiction (§3.2 lines 155/160/177).** Two papers found the page-authored `<main>` nesting and framed it as an agent habit induced by §1 rule 2. Nobody noticed the spec prescribes the same defect to itself in its own blessed chaining pattern. That is what makes the unwrap in S2 mandatory and general rather than a courtesy scoped to "a page whose body is a single `<main>`."

**Missed — the golden path ships no charset.** `charset` appears exactly once in 347 lines. §2's `_layout.html` (lines 64–70) has a title and a stylesheet link and nothing else, and §2 line 36 says the E2E suite builds exactly this site and asserts the output. The whole panel debated charset noise under `--strict` and none checked whether the flagship example declares one. Rule 3's "dropped in favor of the layout's" is also undefined when the layout has none — which is the state of the scaffold.

**Missed — the `--exclude` guard does not cover `_draft.html`.** Four papers listed what a replacing `--exclude` publishes and every one of them named layouts, includes, and `_scripts/`. None named §1's own example of the primitive. This matters because `_notes/spec-remediation-plan.md` R1 ratified replace semantics on the explicit premise that the hazard "is already caught by an existing advisory" — true for layouts, false for everything else. Keep the decision; fix its justification.

**Missed — §3's header overclaims completeness (line 132).** "This section is the complete spec" is false: the `_*` exclusion default and its replace semantics, the never-shipped list, and the error contract are all normative authoring rules living in §4. Anyone — human or machine — who trusts the header and compresses §3 alone loses the underscore rule entirely. One panelist proposed a §3.0 brief block to fix extraction and never questioned the claim it was extracting from.

**Wrong — unmeasured claims stated in the register of measurement.** "300–600+ lines for a minimally-correct Eleventy rules doc," "no achievable small doc for Hugo at all," "roughly a 10x context advantage," "content markup is 80–95% of tokens." No comparison artifact exists; only the unify drafts are in the scratchpad. The unify-side measurements all verified exactly (50/53/63 lines; §3 = 1,361 words; the file = 38,223 bytes; seven `warning`s at lines 138/159/160/172/177). Do not cite the cross-ecosystem numbers downstream as data.

**Wrong — one paper claimed "`--exclude` replaces the default" is something the spec never says.** Line 225 says it verbatim, and that paper's rules-file line-count overrun was accounted to "repairs" that included this non-repair.

**My own addition — the panel never stratified by whether the paired designer catches the failure**, which is the test that separates product bugs from agent scaffolding. Findings that survive it are invisible at the browser too: nested `<main>` (renders fine), silent `data-unify-*` deletion (reads as the author's own mistake), pre-resolution stylesheet dedup (a duplicate network request), a 404ing `og:image` (visible only when shared), a `_scripts/` folder in `dist/`. Findings that fail it — a typo'd area class, a missing layout, `{{ title }}` sitting in the output, content in the wrong slot — are caught in one second by the human, and they drove most of the advisories I rejected.

**My own addition — `<include>` breaks §1 rule 2's "lints" promise.** Two papers built their strongest agent affordance ("an agent can validate its own HTML before building") on it. `<include>` is an unhyphenated unknown element; the W3C validator errors on every unify source file. One word in §1 rule 2 fixes the overclaim.

---

## 8. (c) REJECTED — with reasons

**Killed on evidence, do not revisit:**

- **Demote the reference check to an advisory.** Premise falsified (`unify watch` writes files, no browser, no server); contradicts §8 and §5's collections rationale. *(Disagreement 2.)*
- **`unify init` writes `AGENTS.md` now.** Deferred, not killed — see N2. Doing it before S1–S6 land freezes the exact ambiguities the panel's five drafts split on.
- **§1 design rule 5, "the whole authoring surface fits in 60 lines."** §8 line 344 already owns this measure and explicitly scopes it — "the four primitives of §1 … not this document's length." §1's rules govern which *features* may exist; a document line count is not a feature test. Adding a fifth rule to a section whose identity is four primitives and four rules, to serve a packaging concern, is the creep this spec exists to refuse. The measurable half lands in §8 (N1).
- **A "§3.0 rules in brief" block with "where they differ, this block is the spec."** Two normative copies plus a precedence clause = a drift site and governance machinery (§5), authored into the section §7 item 16 is about to halve.
- **Prefixing §5/§6/§7 "Non-normative."** False for §5 — "unify ships no JavaScript, ever" and "No behavior may exist that only a config file can express" are the most normative sentences in the document. For §7, line 4 already says it: "treat mismatches as planned work, not documentation bugs."
- **New advisories:** `{{ }}`/`{% %}` in page text (unsuppressable, and `{{ }}` is live Vue/Alpine syntax §5 line 247 explicitly permits); orphan pages (fires on the population §3.2 item 1 enumerates verbatim, and is a collections feature in a lint costume); orphaned underscore files / `_posts/` (fires on `_draft.html`, §1's own example); a page emitted with no layout (fires on every page of an SSI-migration site, a §5 launch use case); `<include>` in `<head>` (guards a promise §1 rule 2 explicitly withdrew); widening the header/footer advisory to `<nav>` (breadcrumbs and in-page ToCs are legitimate); a page title containing the layout's (a page legitimately titled "Design at My Site"); a layout whose `<main>` is all areas (a coherent design; S3's content-loss rule catches it at the point of failure). **All nine fail the S4 invariant, the S4 cap, or both.**
- **Frontmatter blocklists and reserved-but-refused keys.** *(Disagreement 6.)*
- **An exit-code table with a third code.** The real defect is a two-line contradiction between §4 lines 217 and 236; fixing the sentence resolves it (S7 #10). A third code is a permanent CI contract that scripts branch on forever, for a distinction stdout already carries and the recommended workflow (`--dry-run --strict` to check, `build` to publish) already separates.
- **`--json` diagnostics, `unify check`/`explain`/`why`, or a mandated diagnostic line grammar.** §4 declares the CLI complete; stable JSON keys are rule codes with different punctuation (§5); a mandated grammar is the same machine contract with the honesty removed. Everything an introspection command would report lives in `--dry-run` (S7 #9). The tiny stable prefix survives *because* the message body is declared non-contractual.
- **Checking `#fragment` references against heading `id`s.** Tempting — the build already computes the ids and it is the one internal-link class nothing verifies. Rejected on the S4 cap: `<details>` targets, tab anchors, and JS-generated ids are legitimate and would false-positive permanently with no suppression. Fix the slug algorithm (S7 #6) so authors can compute anchors correctly, and leave verification to the reader.
- **Making `--exclude` additive.** Nobody proposed it; pre-empted. It would make `_headers`/`_redirects` unshippable, which §4 line 226's own dotfiles reasoning says this audience needs.
- **Collapsing SSI `virtual` and `file` onto one path model.** They exist for fidelity with real SSI sites (§3.1, §5 line 251), where `file=` is filesystem-relative and cannot be absolute. Redefining them makes "supported indefinitely for compatibility" false in the one construct where compatibility is the entire point.
- **"An ancestor left with no content of its own is not emitted."** A new magic-deletion rule with surprising behavior; a designer's `<div class="footer-wrap">` would vanish conditionally. Page area elements are removed from the default content wherever they sit; an empty wrapper the author left behind is the author's, and it is visible.
- **Rewriting §5's no-migration rationale** (line 251 already argues from permanent feature loss, not effort — no word in it is about labor) **and the proposed §8 criterion "a site the owner did not personally type is still one they can read"** (unfalsifiable; every other §8 criterion is countable). The §1 sentence from the same finding survives and is worth taking: after "unify adds no JavaScript of its own," add *"Because the source is the same language as the output, a unify site stays reviewable by the person who owns it — read the source, read the built page, and see exactly what happened, no matter who or what wrote the files."* It is the only positioning change that strengthens the human pitch, and it is the honest reason unify's audience does not need to change to serve agents.
