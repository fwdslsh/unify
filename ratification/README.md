# Ratification rounds

Can an agent, given only `docs/authoring-rules.md` and the `unify` binary, build the site a
brief asks for? A round answers that for one unify (your working tree, a release, or any
commit) and one model: each sample agent works alone, in a directory that cannot see the
rest of this repository, and its site is then rebuilt and checked. You get a score, a
summary, and everything each agent wrote and ran.

[`ratification-protocol.md`](ratification-protocol.md) is the method — why rounds are run
this way and how to triage what they find — and [`ratification.md`](ratification.md) is the
record of past rounds. This page is how to run one.

## Quick start

```bash
bun install
bun run ratify --list
```

```bash
bun run ratify --brief publishing
```

That builds unify from your working tree, runs one sample of every free OpenCode Zen model
on the `publishing` brief, and prints the summary when it finishes. Leave out `--brief` to
run every brief; name a model to run only that one:

```bash
bun run ratify --brief publishing --model opencode/big-pickle
```

### Requirements

- **Linux**, with `unshare` (util-linux). Run as root, or as a user allowed to create
  user namespaces (on Ubuntu 23.10 and later: `sudo sysctl
  kernel.apparmor_restrict_unprivileged_userns=0`). Elsewhere, run it in a Linux container
  or VM.
- **Bun** 1.2 or later, and **git**.
- **[OpenCode](https://opencode.ai)**: `npm install -g opencode-ai`. The free models need
  no account, only access to `opencode.ai`. Any other model OpenCode can use works too —
  whatever you have signed in to with `opencode auth login` or configured as a provider:
  `opencode models` lists them, and `--model` takes any name it prints. Your providers and
  credentials are all that reaches a sample from your OpenCode setup; your environment
  variables reach it too, since OpenCode reads provider keys from them.
- The repository cloned **outside `/tmp`**, which a sample's view replaces.

The free models cost nothing. Any other model is billed by its provider, and `SUMMARY.md`
totals the cost OpenCode reports.

## Running a round

| Option | Default | |
|---|---|---|
| `--unify <ref>` | the working tree | the unify to evaluate: a tag (`v0.11.16`), branch or commit |
| `--brief <name>` | every brief | repeatable; `--list` names them |
| `--model <id>` | `free` | repeatable; `provider/model` as `opencode models` prints it; `free` is every free OpenCode Zen model |
| `--samples <n>` | `1` | samples per brief and model |
| `--stagger <secs>` | `20` | between launches |
| `--timeout <secs>` | the brief's, else `1800` | per sample |
| `--mask <path>` | | one more path to hide from samples (repeatable) |
| `--name <id>` | time and ref | the round's directory name |
| `--rejudge <dir>` | | score a finished round again, with the checks as they are now |
| `--agent <command>` | | run a shell command instead of OpenCode, to test the harness: it gets the prompt on stdin and runs isolated, so it cannot read this repository |

The tuning loop is short: edit `docs/authoring-rules.md` or `src/`, run the briefs that
failed, read `SUMMARY.md`, repeat. Uncommitted edits count, and the summary names them by a
hash so two loops can be told apart. A result you mean to act on needs the protocol's bar,
4 of 5 samples, so finish with `--samples 5`:

```bash
bun run ratify --brief callouts --samples 5
```

To see whether a release holds, name it: `bun run ratify --unify v0.11.16 --samples 5`. A
fresh clone may need `git fetch --tags` first.

A check that got something wrong is fixed in `scripts/checks.mjs` or the brief's
`brief.json` and re-applied to the round you already have, at no model cost:

```bash
bun run ratify --rejudge ratification/rounds/<round>
```

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
<brief>/judge-results.json   the judge's full record: chosen command, diagnostics, markers
```

A round exists only in this checkout. Copy the directory somewhere durable to keep it.

## How a sample is scored

A sample passes when every scored check passes. Every brief starts with three:

- **agent-finished** — the agent exited 0 within its time, reported no error, and wrote `REPORT.md`.
- **publish-command** — `REPORT.md` states a `unify build` command in a fenced block.
- **strict-build** — that command, re-run where the agent ran it with `--dry-run --strict`,
  exits 0: no problem and no advisory.

Each brief's `brief.json` adds its own checks from
[`scripts/checks.mjs`](scripts/checks.mjs), most of them read from a fresh build of that
command:

| Check | Passes when |
|---|---|
| `addresses` | every internal link is under the brief's address and names no `.html` file |
| `absent` | none of the listed paths is published, and no published text contains a listed string |
| `minPages` | at least `min` pages are published |
| `feed` | `feed.xml` has at least `minEntries` entries, each timestamped |
| `postArticles` | at least `min` dated pages, each with Article or BlogPosting JSON-LD |
| `postShareCards` | at least `min` dated pages, each with an `og:image` under the address (and its size, with `dimensions`) |
| `auditStrict` | `unify audit --strict`, with the command's own options, exits 0 |
| `ranCommand` | the agent ran a shell command matching `pattern` (from its event stream) |
| `noSlots` | no `<slot>` reached a published page |
| `bareFragment` | a `*.fragment.html` is published, without `<html>`, `<head>` or `<body>` |
| `cssUrls` | every root-relative `url()` in published CSS is under the address |
| `clientFetches` | every fetch target the judge found in the pages resolves |
| `privacy` | no private value from the seed file is published |

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
hidden. The sample's OpenCode gets your providers and credentials and nothing else of yours —
no instructions, agents, commands, plugins, MCP servers or skills — and keeps its session in
the sample's harness directory, not yours. Its permissions are answered in advance, so
nothing waits for a person: file and shell tools are allowed; subagents, skills, the web
tools, questions and directories outside the sample are refused. A provider that only a
plugin adds is therefore not available. Before any sample starts,
the runner searches the whole filesystem from a sample's view for unify's documentation and
stops if it finds any; hide what it names with `--mask <dir>` or remove it.

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
inside the same isolation.

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
