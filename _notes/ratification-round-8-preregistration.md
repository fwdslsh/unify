# Round 8 — pre-registration (written before any sample ran)

The experiment nobody has run: **does the diagnostic output teach an author to repair a
site?** Every round so far tested whether the 60 lines teach you to *build* something. The
error contract is a much larger surface and has never been validated at all.

Recorded before launching, so the analysis cannot be fitted to the result.

## Fixture

`/tmp/ratify/harness/broken/src` — a seven-page bike-shop site carrying eight planted
problems and two advisories, spread across the catalogue:

| Planted | Where | Rule |
|---|---|---|
| Include target missing (typo'd filename) | `index.html:10` | P01 |
| `<include>` with content between the tags | `_layout.html:13` | P03 |
| Layout named as a bare word (`data-layout="repairs"`) | `repairs/winter-service.html:2` | P04 |
| A section layout that itself declares `data-layout` | `repairs/_layout.html:2` | P15 |
| Frontmatter in an `.html` page | `about.html:1` | P10 |
| Output collision (`contact.html` + `contact.md`) | root | P12 |
| Broken internal reference (`/about/` written for `about.html`) | `repairs/index.html` | P13 |
| v0.6 area class (`class="unify-content"`) | `fittings.html:8` | P08 |
| Void `<include …/>` | `index.html:10` | A01 |
| Fill naming a slot the layout lacks (`slot="sidebar"`) | `about.html:16` | A02 |

Every page carries a unique `MARKER-*` sentence, so content loss is mechanically
detectable: a repair that deletes a page to silence its error fails the round.

## Arms

- **A — diagnostics only** (3 Haiku + 1 Sonnet): the CLI and the broken source, no
  `rules.md`. Tests the error contract *alone* as documentation.
- **B — diagnostics + the 60 lines** (3 Haiku): tests how much of the gap the doc closes.

## Verdict, mechanical

1. `unify build --dry-run --strict` exits 0 on my own independent re-run.
2. All eight `MARKER-*` strings present in `dist/`.
3. No page lost; the collision resolved by keeping both texts, not by deleting one.
4. Per-defect: repaired correctly / repaired by deletion / worked around / untouched.

## Hypotheses, stated in advance

**H1 — cascade noise dominates.** The fixture prints **17 problems for 8 planted faults**.
Nine are second-order: when a page fails to compose it emits no file, so every link to it
from shared chrome is then reported as a broken reference, at the *fragment's* line, with
`fix: check the path spelling and casing` — advice that is false, because the path is
right and the page is broken. Prediction: at least one sample edits a correct link or
deletes a correct nav entry chasing one of these.

**H2 — the same diagnostic repeats once per consuming page.** `nav.html:2` prints twice
here, and would print twenty times in a twenty-page site, because the reference check runs
per output file while the diagnostic is located at the provenance file. Prediction: samples
report a far larger fault count than exists, and at least one reports being unable to tell
whether a fix landed.

**H3 — P03 leaves a live `<include>` in the output, which is then reported as a broken
reference to `/_includes/footer.html`.** The include resolves perfectly well; the element
simply never expanded. Prediction: a sample "fixes" this by moving or renaming a fragment
that was never wrong.

**H4 — the messages that name the replacement work.** P08 and P04 print the v0.7.0
spelling in their `fix:` line. Prediction: those two are repaired correctly in nearly every
sample, in both arms, with no doc.

**H5 — P12 and P15 are the conceptual ones.** The collision message says "rename or remove
one of the sources", and *remove* under a no-content-loss constraint is a trap; P15 says
make the layout standalone, which requires knowing what a standalone layout contains.
Prediction: arm B beats arm A on these two and only these two.

If H1–H3 hold, the finding is **not** an authoring-doc defect: it is the reference check
reporting cascade damage as independent faults. That is triaged against §12 and §14 of the
conformance spec before anything is changed, and the fix is measured by re-running this
same fixture and brief unchanged.
