# Ratification rounds

Run the checked-in harness unchanged through the installed OpenCode CLI. Select an
existing model from `opencode models`. OpenCode resolves its normal configuration and
authentication, including environment variables, custom endpoints and authentication
plugins. The runner does not create or manage a provider connection.

**Reuse the runner unchanged.** Do not create run-specific proxies, relays, adapters,
launch wrappers or patches. Existing OpenCode provider settings, network proxies and
credentials are supported; they are operator configuration, not harness customization.
If the configured connection fails, report the blocker. Fixes belong in a reviewed,
tested repository change before another run.

The [protocol](ratification-protocol.md) defines the rules. The
[result status](ratification.md) contains no retained historical results.

## Quick start

```sh
bun install --frozen-lockfile
opencode models
bun run ratify --list
bun run ratify --check --model "provider/model"
bun run ratify --model "provider/model" --samples 5 --name full-ratification
```

That runs all seven briefs, five samples each, **serially**, using committed HEAD and
the existing model definition. Replace `provider/model` with any ID listed by
`opencode models` in this checkout. For one sample from each brief, use `--samples 1`.

## Requirements

- Linux with working mount namespaces (`unshare`), Git, Bun and the standard OpenCode CLI.
- A clean checkout outside `/tmp`, with committed engine, harness, briefs and rules.
- Existing provider authentication/configuration. Keep credentials out of Git and
  exported results. Samples can inspect their process environment; direct provider
  authentication is not a secret vault. Do not solve this by adding a custom proxy.
- Use an ordinary isolated container or VM if needed. Do not mount host secrets or
  the Docker socket, patch the harness in the container, or replace the transport.

Provider selection, configuration precedence, authentication and networking belong to
OpenCode. Global, project and `OPENCODE_CONFIG*` settings are resolved normally before
sample isolation; provider definitions and plugins are retained. Environment variables
are not rejected based on their names. The runner has no provider/domain allowlist and
no endpoint, adapter, proxy or custom-agent options. Do not add an experiment-specific
relay or change model settings to rescue a run.

`--check` validates the model ID, configuration, clean inputs, binary build and namespace
isolation **without inference**. It cannot establish upstream authentication, billing or
model health. Check a run at any time without custom monitor scripts:

```sh
bun run ratify --status ratification/rounds/full-ratification
```

Normal completion is separate from scored passes. Connection/authentication errors stop
launching further samples and produce an **incomplete** round with pending samples
excluded from pass/fail counts. Timeouts and context-limit errors remain recorded sample
failures. There are no automatic replacement samples. Resolve a blocker before explicitly
requesting a separate run; never patch a running experiment.

Exit codes: **0** means the per-brief bar is met, **1** means it is not, and **2** means
blocked/incomplete. With fewer than five samples, exit 0 means all diagnostic samples
passed, not that full ratification was established. `results.json` includes an explicit
`verdict` with completeness, planned/completed counts and `barMet`.

## Supported options

| Option | Default | Purpose |
|---|---|---|
| `--model <id>` | required | installed model; repeatable; `free` selects free Zen models |
| `--brief <name>` | all seven | select a committed brief; repeatable |
| `--samples <n>` | 5 | samples per brief/model; fewer than five is diagnostic only |
| `--name <id>` | timestamp and HEAD | simple directory name |
| `--list` | | list the committed briefs without inference |
| `--check` | | preflight without model inference |
| `--status <dir>` | | read progress without launching or judging anything |
| `--rejudge <dir>` | | offline scoring with the current judge; never new model calls |

`--agent`, `--unify`, `--stagger`, `--timeout` and `--mask` are not supported. There is
no override flag for the policy. Timeouts come from the committed brief (otherwise
30 minutes). Execution is always serial. Commit legitimate harness/engine fixes
before running; never use a temporary patch or a custom replacement command.

## What a round leaves behind

Everything is under `ratification/rounds/<round>/`, which git ignores:

```
SUMMARY.md, results.json     the score, every check per sample, the agents' own notes
round.json                   what ran: unify commit and version, rules and prompt hashes, OpenCode version, models
rules.md, bin/unify          exactly what every sample was given
<brief>/PROMPT.md            the prompt every sample of that brief received
<brief>/<sample>/            the agent's directory, exactly as it left it, REPORT.md included
<brief>/.harness/<sample>/   OpenCode's event stream (events.jsonl), stderr, exit, and its session data
<brief>/.build/<sample>/     the fresh build every check reads
<brief>/.judge/<sample>/     scratch copy for every strict judgement and npm-script preparation
<brief>/judge-results.json   the judge's full record: chosen command, diagnostics, markers
```

A round exists only in this checkout. Publish results only when explicitly requested, after inspecting and redacting credentials from every exported file. Never publish raw OpenCode state or authentication files. Do not add an authentication proxy to avoid this export check.

## How a sample is scored

A sample passes when every scored check passes. Every brief starts with four:

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
flags are applied only to the resolved Unify invocation. All judge commands, including direct builds and generators, run in copies. Original sample files
are preserved, and saved isolation masks apply to both copies.

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

A check marked `"scored": false` is reported, never counted. The round's score is the share
of samples that passed. The summary also says whether the protocol's bar was met — at least
4 of 5 samples of a model on every brief — or, with fewer than 5 samples, that the score is
only indicative.

The checks decide facts a person could verify from the files. They do not decide whether
the agent reached for the mechanism the brief was written to compel, or whether a failure
was the documentation's fault: that is triage, in the protocol, and it starts from each
agent's answer to "what did `rules.md` not answer?", which the summary quotes.

## Isolation, and what it does not cover

[`scripts/isolate.sh`](scripts/isolate.sh) gives each sample its own mount namespace: its
directory appears as `/tmp/sandbox`, `/tmp` is a fresh empty filesystem, and the
repository, the bun and npm caches, unify's template cache, your OpenCode configuration and
history, and the `~/.claude` and `~/.agents` directories OpenCode would load skills from are
hidden. The sample's OpenCode gets the resolved providers, authentication plugins and existing credentials;
configured instructions, agents, commands, MCP servers and skills are not forwarded. It keeps its session in
the sample's harness directory, not yours. Its permissions are answered in advance, so
nothing waits for a person: file and shell tools are allowed; subagents, skills, the web
tools, questions and directories outside the sample are refused. Installed plugins are
retained because providers may need them for authentication; plugins must not inject
project knowledge into an evaluation. Provider credential files and local plugin files
must be accessible inside the execution environment. Before any sample starts,
the runner searches the whole filesystem from a sample's view for unify's documentation and
stops if it finds any. Use a clean isolated environment; do not patch the runner or add masks.

What a sample *can* learn from, besides `rules.md`, is the tool itself: `./unify --help`,
its diagnostics, and the built-in templates `unify init` writes, whose READMEs restate the
rules. They are compiled into the binary, and a sample has already extracted one with
`strings`. None of `docs/` is.

Not covered:

- **The network.** OpenCode's web tools are refused, but a sample's shell can reach the
  web, so it could fetch unify's documentation with `curl`. Read the event stream of any
  result that looks too good.
- **Writes outside the sample.** Hiding a path is not protecting the rest of the disk: a
  sample has a shell and your permissions everywhere it can still see, and one has already
  written a scratch script into the home directory. Run rounds in a container or VM, or as
  a user with nothing to lose.

The judge and the fresh builds run each sample's own command, generator scripts included,
inside the same isolation. Legacy rounds' saved masks are reapplied during offline
judging, rebuilding and checks; new runs accept no custom masks. The output directory comes
from the evaluated binary's dry-run report, so settings saved in `unify.yaml` and CLI
overrides are both respected.

Harness regressions run with `bun test tests/unit/ratification.test.js tests/unit/ratification-runner.test.js`. On a Linux host
that supports the mount namespaces used for rounds, also run
`bun ratification/scripts/test-isolation.mjs`: an external sentinel proves that saved
masks reach the judge, fresh builds and audit checks when rejudging, even when the
caller's `RATIFY_MASK` differs. The fixture and compiled binary are removed afterward.

## Adding a brief

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
its round ran — and write a new brief to ask a new question. The protocol's [Designing the
brief](ratification-protocol.md#designing-the-brief) says how to compel a construct without
naming it.

The seven briefs here are the briefs of rounds 20 to 28, unchanged. Their seed files come
from `examples/` (the catalogue export, the Svelte component) or were made for this harness
(the photographs, the volunteers' drafts).
[`briefs/BRIEF-maintenance.md`](briefs/BRIEF-maintenance.md) is a different experiment, its
tasks delivered one at a time by hand, and the runner does not run it.
