# Batch B9 — `--pretty-urls` must rewrite URL-valued `og:`/`twitter:` metas

Read first: the B8 Part-1 report's bug description (reproduced below),
`src/core/urls.js` (`applyPrettyLinks`, `SINGLE_URL_ATTRS`, `isUrlValuedMeta`
/ `URL_VALUED_META`, and how §11.1/§11.3 handle the same metas),
conformance-spec §11.1–§11.3 and the URL- rows in
`tests/conformance/rules.tsv`, plus `tests/conformance/mutations.tsv` anchors
in urls.js before editing.

## The defect

`content` of URL-valued `og:`/`twitter:` metas is rewritten by provenance
(§11.1) and `--base-url` (§11.3) but never by `--pretty-urls` (§11.2):
`applyPrettyLinks` walks only `href`/`src`/`poster`, `srcset`, and the
refresh-meta URL. Consequence, reproduced minimally: a page authoring
`<meta property="og:url" content="/about.html">` beside
`<a href="/about.html">` under `--pretty-urls --base-url https://example.com/`
fails the reference check with "/about.html does not resolve to any emitted
file" — on the meta only, while the anchor is rewritten and passes. The same
meta works under `--base-url` alone. This contradicts §11.1's one-list
framing of the reference-bearing attributes.

## Part 1 — fix + spec

- Extend §11.2's rewriting to the same URL-valued meta set §11.1/§11.3
  already own (one list, one reader — reuse the existing `isUrlValuedMeta`/
  `URL_VALUED_META` machinery; do not grow a second list). A page-targeting
  `og:url`/`og:image`/`twitter:image` content that names an emitted page in
  its `.html` spelling must come out in the directory spelling exactly as an
  `href` to the same target does, prefix included under `--base-url`.
- Asset-targeting values (images that are files, not pages) must be left
  exactly as §11.2 leaves an asset `href` — study how pretty-urls decides
  page-vs-asset for `href` and apply the identical rule.
- Update conformance-spec §11.2 (and §11.1's framing if it names the lists)
  to state the rule; update/extend the relevant URL- rows in rules.tsv.

## Part 2 — tests

- Conformance coverage for the new rule (behavior tier, real CLI): the
  minimal reproduction above must build clean and emit the rewritten meta;
  an asset-valued og:image must ship byte-unchanged by §11.2; both under
  `--pretty-urls` alone and with `--base-url`. covers() the touched URL-
  rules; re-point any mutations.tsv anchors the edit moves, keeping each
  row's intent.
- Re-run the B8 reproduction: after the fix, stamping `og:url` from a
  generator must work — but LEAVE `examples/catalog-search-blog` on its
  canonical-stamping design (it is shipped and reviewed; add nothing to it).

## Part 3 — small admin remainders

- `docs/cicd-workflows.md`: the "five jobs" description of `test.yml`
  predates the current seven-job workflow — bring that section current,
  nothing more.
- Dependency advisories: GitHub reports 6 moderate alerts on the default
  branch. Run `bun audit` (and `npm audit` in examples/eleventy-htmx) against
  THIS branch, and report exactly what applies here: which advisories, which
  dependency chains, whether a trivial in-range bump clears any. Apply a bump
  ONLY if it is in-range, dependency-count-neutral, and the full gate stays
  green; otherwise report, do not churn.

## Definition of done

Full gate green (fresh-ledger bun test, both traceability modes, module
graph, suite hygiene). The B8 reproduction passes. No behavior change beyond
the stated rule.
