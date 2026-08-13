# Round 22 — pre-registration (written before any sample ran)

## The question

Inline `url()` — in a page's `<style>` block or `style=` attribute — has **no correct
static spelling** under `--pretty-urls` + `--base-url` together: a relative one breaks
when the page's output moves (caught loudly by §12, which resolves against the output
file); a root-relative one misses the base's path prefix while **passing** §12 — the
check runs against the output tree, where the file exists — a silent 404 at exit 0, the
round-13 class; a full URL hardcodes the domain and is skipped by §12 entirely. The
round-19 post-fixes (2026-08-13) repaired the inverted advice in §11.1 and the rules doc,
which now says: keep every `url()` in a stylesheet file, written relative to that file
(mirror copy keeps stylesheet-internal references working at every deploy address).

The question deliberately left open that night, quoted from the notes: *"should §11.1
rewrite `url()` in a page's own `<style>`/`style=`? … Rewriting is spec-coherent — inline
styles are page content, not mirror-copied files, and §12 already parses the same values —
but it is a §11 amendment with fixture obligations, and the doc's new 'keep url() in a
stylesheet file' advice removes the need for most sites. Decide with evidence: a brief
that compels an inline background image would show whether authors actually write them."*

If authors write inline `url()` and ship silent 404s, the engine should rewrite it —
delete the choice. If nobody does, the doc line carries the load and the catalogue stays
closed. **The advisory middle ground is barred in advance** by §14.3's operational tests:
an inline `url()` that composed exactly as drawn is correct markup, and a warning on it
would instruct restructuring of markup that composed correctly.

## Design

5 Haiku + 1 Sonnet control, CLI in sandbox (publishing brief — the build is legitimately
in the loop), mount-namespace isolation (`isolate.sh`), 45-minute cap, launches staggered.
Runner: `./run-round19.sh round22 BRIEF-r22.md PROMPT-r22.txt 5 1 2700 seed-r22`.

New brief, deliberately: **Alderfen Arboretum**, a fresh non-Fernhollow identity. The
load: **the home page opens on a full-width photo banner with text over it, and each of
two section pages opens on its own narrower banner** — banners-with-text-over compel CSS
backgrounds more than `<img>` does, at several page depths (root, section landing one
folder down, Markdown guides two folders down under `--pretty-urls`). A handful of
content pages in Markdown. Deployed at **`https://alderfen.pages.dev/arboretum/`** —
a subdirectory — with `.html`-free visitor addresses, so both flags are compelled at
once. The brief names banners as content ("a photo … with the name sitting on top of it,
readable over it") and **never names a mechanism** — no "background", no "stylesheet",
no "inline", per the protocol's brief-design section.

Images are **seeded into the sandbox** at `images/` — logo, one wide home photo, two
narrower section photos (small solid-colour PNGs with honest dimensions, generated for
this round; the round-13 `card-*` names would be unsuitable for banners) — and the brief
says to use them and create no new image files. Marker sentences: "Alderfen keeps",
unique per page (the round-19 device, unchanged otherwise).

## Verdict, mechanical

Decision rule, fixed before launch:

If ≥2 of 5 Haiku ship an inline `url()` (in `<style>` or `style=` in any emitted page)
whose resolved URL at the deploy address does not fetch the seeded image, at exit 0, the
recommendation is: §11.1 rewrites `url()` in composed pages' `<style>`/`style=` (never in
mirror-copied `.css`, which byte-for-byte forbids). If ≤1 of 5, the recommendation is: no
engine change; the doc line carries the load; record and close.

Procedure per sample, judged from files and transcripts, in place:

1. Run the sample's **own** publish command exactly as its REPORT.md states (join
   backslash continuations; keep quoted args — truncated commands have produced false
   exit-2s twice), plus an independent `--dry-run --strict` sweep for the diagnostic list.
2. Extract every `url(` occurrence from emitted pages (`<style>` blocks and `style=`
   attributes) **and** from emitted `.css` files. Sweep the site output, not the sandbox.
3. Resolve each occurrence against the deployed URL of its containing page or stylesheet
   under the brief's base: `dist/` (or the sample's output dir) mounted at
   `https://alderfen.pages.dev/arboretum/`, directory URLs serving their `index.html`.
4. Classify each: **resolves-and-fetches** (an emitted file exists at the resolved path
   under the mapping; `data:` URIs and external URLs that are not the site's own count
   here only if they would fetch — a hardcoded full URL with the right base fetches, with
   a missing base segment it is a 404) vs **404-at-deploy** (no emitted file at the
   resolved path).
5. A sample counts toward the ≥2 threshold only when all three hold: the occurrence is in
   an emitted **page** (not a `.css` file), it is 404-at-deploy, and the sample's own
   publish command exits 0 on my re-run. A root-relative `url()` in an emitted `.css`
   file that 404s at deploy is the same silent class but **outside the decision count**
   — recorded separately if it occurs.

Secondary counts, pre-registered:

- Per sample, the banner mechanism chosen: **stylesheet-file `url()`** / **inline
  `<style>`-block `url()`** / **`style=` attribute `url()`** / **`<img>`** / other —
  and combinations.
- Whether any sample **quotes the doc's `url()` clause** ("keep every `url()` in a
  stylesheet file…") in its report — the round-20 attribution shape, measuring whether
  the clause reads.
- Markers preserved (all "Alderfen keeps" sentences reach the output), and the isolation
  YES/NO answer.

## Hypotheses, stated in advance

- **H1:** ≥3 of 5 Haiku put every banner `url()` in a stylesheet file — the clause is one
  round old, sits beside the fetch clause four of five quoted in round 20, and the
  one-stylesheet site is the default shape for a no-JS brief.
- **H2:** 1–2 of 5 write at least one inline `url()` anyway — three different banners on
  three pages is the classic per-page `style=` temptation — and any inline spelling will
  be **root-relative**, because the doc trains root-relative everywhere else ("a leading
  `/` means the source root, in any path you write"). That is exactly the silent shape.
  Stated plainly: my honest expectation sits at the decision boundary, which is why the
  rule was fixed before launch.
- **H3:** 0 of 5 hand-write the full deploy URL inside a `url()`.
- **H4:** any *relative* inline `url()` a sample writes from a page that moves is caught
  by §12 at exit 1 and repaired before the sample finishes — loud failures never reach
  the silent count.
- **H5:** the control (Sonnet) ships zero 404-at-deploy `url()` values by either route.

## If the count is ≥2 — what happens next, decided only with evidence in hand

The recommendation (not tonight's edit) is the §11.1 amendment: provenance rewriting
extends to `url()` tokens in composed pages' `<style>` blocks and `style=` attributes —
same skip list as §11.1, same §11.2/§11.3 pipeline position — while `url()` in
mirror-copied `.css` stays untouched (byte-for-byte, §4.4) with the relative-to-that-file
advice carrying it. Fixture obligations noted: the §11.1 fixture family grows a
`<style>`/`style=` pair, and §12's "checking is not rewriting" parenthesis is rewritten.
If ≤1 of 5: record the round, keep the doc line, close the question — and the catalogue
stays at nine of twelve.
