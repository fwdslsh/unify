# Ratification protocol

This measures whether an author can produce a compliant site from
`docs/authoring-rules.md`, a plain-English brief, seeded assets and the compiled CLI.
Samples must not read the specification, repository, other samples or prior sessions.
For prerequisites, commands and output locations, use the [runner README](README.md).

## Standard execution only

Use the committed runner unchanged. It runs serially from clean HEAD with the
brief's committed timeout. Select the installed model, brief scope, sample count
and round name; `--expect-context` can assert a limit but cannot override it.

Do not create experiment-specific proxies, credential relays, forwarding servers,
model adapters, patched SDKs, custom agents or launch wrappers. Do not patch the
runner, engine, briefs, prompts or scoring thresholds during a run, including inside
a container. Per-run context/output overrides, timeout/concurrency tuning and custom
isolation masks are prohibited. Existing OpenCode provider settings and normal network
configuration belong to the operator; the harness does not replace them.

Keep every attempted outcome. Do not replace failures, combine favorable subsets,
add follow-up hints or synthesize reports. Model timeouts and context-limit errors
remain sample failures. Provider/authentication failures stop further launches and
leave pending samples unscored. Inspect interrupted execution before doing anything
else; a recovery run requires explicit authorization and a separate record. Do not
change infrastructure, credentials or models to rescue a running experiment.

## The bar

Full ratification uses all seven committed briefs and five fresh samples per brief/model.
Every scored check must pass for a sample to pass. The model meets the bar only if
at least four of five samples pass **each** brief. A process exit of zero or a report
file is not a pass. Smaller runs are diagnostic only.

Record the commit, CLI version, model, effective context/output limits, plugin policy,
prompt/rules hashes, all sample outcomes and infrastructure failures. Do not claim that an interrupted run
is a clean capability measurement. A stronger-model comparison is a separate experiment
and must be requested explicitly.

## How a sample is scored

Every brief starts with four scored checks:

- **agent-finished** — the agent exited 0 within its time, reported no error, and wrote `REPORT.md`.
- **publish-command** — `REPORT.md` states a `unify build` command or a resolvable
  `npm run <script>` in a fenced or indented code block (outside blockquotes).
  Verification commands containing `--dry-run`
  are not publish candidates, including when hidden behind an npm script.
- **strict-build** — the resolved Unify command with `--dry-run --strict` exits 0:
  no problem and no advisory. An npm wrapper first runs in a scratch copy, including
  nested scripts and pre/post hooks; failed preparation fails this check.
- **fresh-build** — the publish command exits 0 in a separate copy with its previous
  output removed. The named checks below read that fresh output.

Npm resolution supports static commands joined by `&&`, with exactly one Unify build,
and nested `npm run <script>` calls without extra arguments. Cycles, directory changes,
shell substitutions, and ambiguous/multiple builds are reported as unsupported.
The original wrapper runs unchanged, so preprocessing is retained; strict and audit
flags are applied only to the resolved Unify invocation. All judge commands, including
direct builds and generators, run in copies. Original sample files are preserved,
and saved isolation masks apply to both copies.

Each brief's `brief.json` adds its own checks from
[`scripts/checks.mjs`](scripts/checks.mjs), most of them read from a fresh build of that
command:

| Check | Passes when |
|---|---|
| `addresses` | checked internal links are under the brief's address, name no `.html` file (404 and fragments excepted), and resolve to published files |
| `absent` | none of the listed paths is published, and no published text contains a listed string |
| `minPages` | at least `min` pages are published |
| `feed` | `feed.xml` is well-formed Atom with at least `minEntries` entries, each with a full timestamp, a title and an alternate link |
| `postArticles` | at least `min` dated pages, each with Article or BlogPosting JSON-LD |
| `postShareCards` | at least `min` dated pages, each with an `og:image` under the address (and its size, with `dimensions`) |
| `auditStrict` | `unify audit --strict`, with the command's own options, exits 0 |
| `ranCommand` | the agent ran a shell command matching `pattern` (from its event stream) |
| `noSlots` | no `<slot>` reached a published page |
| `mainLandmarks` | every page has exactly one `<main>` (meta-refresh redirects aside); with `skipLink`, a same-page link before it lands on it or inside it; with `labelled: n`, at least `n` pages give theirs a name of its own (`aria-label`, or `aria-labelledby` naming an element of the page); with `outside`, no element naming one of those files (`src`, `srcset`, `poster`, `style`) is inside it |
| `jsonListing` | `path` is a published JSON array of at least `min` entries, each with a `title`, a `date` and a `url` that is the full address of a published page, in exactly the form a static host serves without redirecting |
| `bareFragment` | bare HTML is published, including extensionless endpoints, without a document wrapper; empty list fragments may coexist with a nonempty panel |
| `cssUrls` | every root-relative `url()` in published CSS is under the address |
| `clientFetches` | every fetch target the judge found in the pages resolves |
| `privacy` | no private value from the committed seed is present in the fresh output |

`addresses` also checks links inside fetched bare fragments against the **including
page's URL**, honoring its first `<base href>`. Inline scripts and local `<script src>`
files are inspected without executing them. Static analysis recognizes literal paths,
templates, concatenation, unambiguous aliases, simple path-returning functions and
`hx-get`. A script must both read response text and insert HTML before its fetches are
considered possible fragment insertion contexts. Each matched context and broken link
is recorded in `results.json`.

This is not browser execution or full JavaScript data-flow analysis. Dynamic patterns
match emitted files; they cannot prove which runtime values a user will request.
Unresolved fetch expressions, unavailable scripts, and unmatched patterns appear in
the check's `coverage` notes. Imported modules, links synthesized from JSON, and arbitrary
DOM/JavaScript logic still need manual review. Unknown contexts are never replaced with
the fragment's own URL or an invented page URL.

A check marked `"scored": false` is reported, never counted.

The checks decide facts a person could verify from the files. They do not decide whether
the agent reached for the mechanism the brief was written to compel, or whether a failure
was the documentation's fault: that is [triage](#triage-and-changes), and it starts from each
agent's answer to "what did `rules.md` not answer?", which the summary quotes.

After every run that exits 0 without an error, pass or fail, the runner also asks the same
agent, in the same session, to look back on using unify (`briefs/RETROSPECTIVE.md`). The
answer is kept as `RETROSPECTIVE.md` beside the run's event stream. It is never scored,
and like the self-report it is evidence of what the agent expected, not of what it did.

### Coverage limits

The catalogue page-count check counts emitted pages, not a semantic inventory of every
variety. The Svelte checks do not prove a genuine compiler pipeline. These limits and
the static-analysis limits above require manual review, not relaxed scoring.

## Isolation, and what it does not cover

[`scripts/isolate.sh`](scripts/isolate.sh) gives each sample its own mount namespace: its
directory appears as `/tmp/sandbox`, `/tmp` is a fresh empty filesystem, and the
repository, the bun and npm caches, unify's template cache, your OpenCode configuration and
history, and the `~/.claude` and `~/.agents` directories OpenCode would load skills from are
hidden. Provider configuration follows the [README](README.md#environment-and-provider).
Sessions stay in the sample's harness directory. Permissions are answered in advance, so
nothing waits for a person: file and shell tools are allowed; subagents, skills, the web
tools, questions and directories outside the sample are refused. Before any sample starts,
the runner searches the whole filesystem from a sample's view for unify's documentation and
stops if it finds any. Use a clean isolated environment.

Each sample receives `AGENTS.md`, byte-for-byte identical to its original `PROMPT.md`
(shared contract plus brief). OpenCode loads that absolute path as persistent system
instructions on every agent turn, including after context compaction. The report requirement
does not depend on a model-generated summary remembering it. Missing reports still fail;
the runner never writes reports on the agent's behalf or resumes a failed sample with hints.

What a sample *can* learn from, besides `rules.md`, is the tool itself: `./unify --help`,
its diagnostics, and the built-in templates `unify init` writes, whose READMEs restate the
rules. They are compiled into the binary; none of `docs/` is.

Not covered:

- **The network.** OpenCode's web tools are refused, but a sample's shell can reach the
  web, so it could fetch unify's documentation with `curl`. Read the event stream of any
  result that looks too good.
- **Writes outside the sample.** Hiding a path is not protecting the rest of the disk: a
  sample has a shell and your permissions everywhere it can still see. Use a disposable
  container or VM without unrelated secrets or a Docker socket.
  Authentication available to OpenCode can be observed by the sample.

The judge and the fresh builds run each sample's own command, generator scripts included,
inside the same isolation. Legacy rounds' saved masks are reapplied during offline
judging, rebuilding and checks; new runs accept no custom masks. The output directory comes
from the evaluated binary's dry-run report, so settings saved in `unify.yaml` and CLI
overrides are both respected.

## Triage and changes

Inspect the report, authored files, transcript and fresh-build diagnostics. Distinguish
model output errors, documentation ambiguity, implementation defects, judge defects,
provider failures and harness failures. Fix a demonstrated defect in the repository,
add a meaningful regression test and review the change. Never change an expectation
just to obtain a pass; the specification determines the intended behavior.

A valid alternative implementation is not a failure. Repeated mistakes are a reason
to compare the rules with the specification before changing either; they do not alone
prove a model limitation. Use reports to identify ambiguity and actual files/transcripts
to establish what happened. Inspect output even when checks pass: automated checks do
not establish that the intended feature was exercised. Make small, attributable changes
and keep the brief and environment fixed when measuring their effect.

Offline `--rejudge` may apply a reviewed judge fix to unchanged samples. Identify it as
a rescore, keep authorship unchanged and preserve its provenance. It is not a fresh run.
Do not rerun inference, revive deleted evidence or publish results without authorization.

## Designing the brief

State what the site must do in plain language, without supplying the mechanism being
measured. Changes to briefs and checks require review and tests before a run.

A brief is a directory under `briefs/`:

```
briefs/<name>/
  BRIEF.md       the task, in plain English: what the site must do, never which mechanism
  brief.json     title, origin, baseUrl, checks; optionally timeoutSecs, judge
  seed/          optional: files copied into every sample's directory
```

[`briefs/PROMPT.md`](briefs/PROMPT.md) is prepended to every brief: it points at `./unify`
and `./rules.md` and asks for `REPORT.md`. Once a round has used a brief, keep its
`BRIEF.md` unchanged while you measure a fix — the summary flags a brief that changed since
its round ran — and write a new brief to ask a new question.

The seven briefs here are the briefs of rounds 20 to 28. Four are unchanged. Three gained
a requirement for 0.12.0, each with a check, so their results do not compare with the
rounds before it:

- `photo-banners` asks for exactly one main landmark on every page, a name of its own for
  it on the home page and each section's landing page, and the banner above it and not
  inside it: the page's own `<main>` reaching the output, whole or as attributes on the
  layout's (#147, #148).
- `audit-handover` asks for a skip link to each page's main content, which a page `id`
  that replaces the layout's breaks, and which only the audit the brief already demands
  reports (#147).
- `council-panel` asks for a JSON list of the notes' public addresses, which need the
  build's own address rules outside HTML (#149).

Their seed files come from `examples/` (the catalogue export, the Svelte component) or
were made for this harness (the photographs, the volunteers' drafts).

## Maintenance tasks after the first build

Maintenance tasks use a separately specified fixed guide corpus and are recorded
separately from rules-only authorship. [BRIEF-maintenance.md](briefs/BRIEF-maintenance.md)
is a manual experiment; the standard runner does not execute it.

## Evidence handling

Results stay under ignored `ratification/rounds/` until publication is explicitly
requested. Never publish authentication files, raw provider state or credentials in
transcripts. Inspect and redact exported artifacts directly; do not add a proxy as an
export safeguard. Preserve all authorized outcomes and disclose any redaction.
