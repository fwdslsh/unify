# The first mutation sweep of the §26–§33 modules

Six modules shipped across §26, §29, §30, §31 and §33 with **no mutation rows at
all**: `structured-data.js`, `feed.js`, `search-index.js`, `external.js`,
`report.js`, `generate.js`. Fourteen rows were written for them and swept
against the working tree. This is the record, including the rows that were
wrong, because those turned out to be the more useful half.

## The headline

**A survivor has two possible causes, and they demand opposite responses.**

1. The rule is real and untested — a genuine coverage gap. Write the test.
2. The mutation could not change behaviour — an unreachable line, a no-op
   replacement, a default parameter that never fires. The row is the defect.

Five of fourteen rows were case 2. Three times the first reading was "we found a
gap", and only chasing *why* the mutant lived showed otherwise. That chase is
not overhead; it is where two of the four real gaps came from — retargeting a
defective row at the line its rule was actually about exposed a rule with no
test behind it.

`run-mutations.mjs` already refuses to score a CRASHED row. Nothing catches a
row that is merely inert, and nothing can: an inert mutation is indistinguishable
from a well-defended one at the level of an exit code. Only reading the code the
anchor sits in tells them apart.

## The defective rows, and what each taught

| row | why it could not work |
|---|---|
| `feed-zero-entries-still-writes` | Neutering the zero-entry guard sends `serializeFeed` looking for a newest entry that does not exist. The wrong implementation cannot RUN, so it can only ever report CRASHED. |
| `feed-checks-feed-level-links` | Anchored an empty-path guard that is unreachable for entry links — an entry's address is its own page's, which always has a path. |
| `fingerprint-includes-line` | Added `String(finding.line ?? "")` to the hash. A `Finding` has no `line` property, so the term is `""` on every finding and not one byte changes. |
| `structured-data-overwrites-authored` | Written as a DEFAULT PARAMETER (`record = { jsonLd: [] }`), which fires only when the argument is `undefined`. `record` is always passed. |
| `generate-in-process-cache` | Dropping `argv[3]` leaves the generator with nowhere to write and the build dies in its own scan. CRASHED, not scored. |

Four of the five share one root cause: **the row was written from the rule's
words without checking that the anchored line can express the rule's opposite.**
The lesson is cheap to apply — before committing a row, confirm the mutated code
both runs and produces different output on some input you can name.

## The four genuine gaps, and their tests

All four are in `feed.js` and `report.js`, and all four are URL-or-identity
rules from the §29–§31 repair round. That round fixed the code and the
specification and did not add a test on the input that separates each rule from
its opposite — which is exactly the gap mutation testing exists to expose.

1. **FEED-02, an entry's address.** §29.5 resolves a page's canonical against
   its own URL. Every existing feed test authored an ABSOLUTE canonical, where
   `new URL(absolute, base).href` returns the input; returning the raw canonical
   instead was invisible. A RELATIVE authored canonical separates them, and
   unify accepts one: unresolved it ships `<id>post.html</id>` in a feed at the
   output root.
2. **FEED-05, `--feed-full` URLs.** The existing test asserts the body REACHES
   `<content type="html">` and never inspects the URLs inside it. Both relative
   forms need covering, since they arrive by different routes: §11.3 prepends
   only the path prefix, and §11.1 leaves a page's own relative URL untouched.
   `src` is asserted beside `href` because one handler serves both.
3. **FEED-06, feed-level links.** Reading a feed's own `rel="alternate"` made a
   site with an Article page and no root `index.html` fail with P13 against
   `src/feed.xml` — a file the author does not have. Every feed test authors a
   root index, so nothing had the shape that fails.
4. **RPT-02, cross-page fingerprints.** The existing test pins two DIFFERENT
   faults on ONE page and explicitly checks both findings share a file. Nothing
   pinned ONE fault on TWO pages — and "the same fault has the same fingerprint"
   is a natural-sounding wrong implementation that lets one CI suppression hide
   a second, real fault.

## Method note

Every replacement row and every new test was verified OUTSIDE the repository
before being applied: the tree was copied to `/tmp`, the mutation applied there,
and the test run to confirm it fails for the stated reason and passes without
it. That is what turned "this test should catch it" into evidence.
