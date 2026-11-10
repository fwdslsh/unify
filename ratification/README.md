# Ratification

Use `bun run ratify` to run isolated OpenCode samples against Unify's authoring rules
and score the generated sites. The [protocol](ratification-protocol.md) defines the
execution policy, pass criteria, isolation boundaries and evidence rules. Each sample that finishes cleanly is then asked for a
retrospective of using unify, kept with the round's evidence and never scored.

## Quick start

From a Linux checkout outside `/tmp`, with Bun installed:

```sh
bun run ratify:setup
```

Setup installs repository dependencies and offers to install OpenCode 1.18.25 if it
is missing. It keeps an existing OpenCode installation, prompts you to configure a
provider using OpenCode's own login flow (or keep your existing setup), lists models,
and runs preflight for the model you select. It prints the run commands without
starting an evaluation or creating a provider configuration file. Missing system
tools or unsupported isolation are reported; setup does not change OS security settings.
If Bun's global executable directory is outside your shell's PATH, setup uses it for
its checks and prints the `export PATH=...` command to run afterward.
Use an interactive terminal; `bun run ratify:setup --help` shows its requirements.

For an already-configured environment, the manual commands remain:

```sh
bun install --frozen-lockfile
opencode models --pure
bun run ratify --list
bun run ratify --check --model "provider/model"
bun run ratify --model "provider/model" --samples 5 --name full-ratification
```

That runs all seven briefs, five samples each, **serially**, using committed HEAD and
the existing model definition. Replace `provider/model` with any ID listed by
`opencode models` in this checkout. For one sample from each brief, use `--samples 1`.

## Environment and provider

Use Linux with working mount namespaces (`unshare`), Git, Bun and OpenCode, and a clean
checkout outside `/tmp`. A disposable Linux container or VM is suitable. Provider
credential files must be accessible inside the execution environment.

OpenCode's native `--pure` mode disables external plugins while retaining built-in
authentication. Configured instructions, agents, commands, MCP servers and skills are
not forwarded to samples.

Provider selection, configuration precedence, authentication and networking belong to
OpenCode. Global, project and `OPENCODE_CONFIG*` settings are resolved normally before
sample isolation; provider definitions are retained, external plugins are not. Environment variables
are not rejected based on their names.

Preflight prints the **effective context and output limits inside isolation**, and each
round records them in `round.json`. A server's larger context does not automatically
update OpenCode's client definition. Configure that definition before starting. When a
specific context is required, assert it without overriding configuration:

```sh
bun run ratify --check --model "provider/model" --expect-context 102400
bun run ratify --model "provider/model" --expect-context 102400 --samples 1
```

A mismatch stops before inference. There is no minimum context imposed on other models.
Providers requiring an external authentication plugin need a native OpenCode connection
for this evaluation.

## Progress and results

`--check` validates the model ID, configuration, clean inputs, binary build and namespace
isolation without inference. It cannot establish upstream authentication, billing or model
health. Check progress or rescore unchanged samples with:

```sh
bun run ratify --status ratification/rounds/full-ratification
bun run ratify --rejudge ratification/rounds/full-ratification
```

`--status` reads the last durable checkpoint; it is not a remote health probe. An
abruptly stopped supervisor can leave a running checkpoint. Inspect it before recovery
and never overwrite an existing round. `--rejudge` scores offline with the current
judge and makes no model calls.

Exit **0** means the [ratification bar](ratification-protocol.md#the-bar) was met, or
all samples passed in a smaller diagnostic. Exit **1** means it was not met; **2** means
blocked/incomplete. `results.json` separates execution completeness, passed samples
and `barMet`. Pending samples are excluded from pass/fail counts.

## Supported options

| Option | Default | Purpose |
|---|---|---|
| `--model <id>` | required | installed model; repeatable; `free` selects free Zen models |
| `--brief <name>` | all seven | select a committed brief; repeatable |
| `--samples <n>` | 5 | samples per brief/model; fewer than five is diagnostic only |
| `--name <id>` | timestamp and HEAD | simple directory name |
| `--expect-context <n>` | | require this exact configured context; never changes it |
| `--list` | | list the committed briefs without inference |
| `--check` | | preflight without model inference |
| `--status <dir>` | | read progress without launching or judging anything |
| `--rejudge <dir>` | | offline scoring with the current judge; never new model calls |

There are no agent, binary, timeout, concurrency or isolation-mask overrides. Timeouts
come from the committed brief, defaulting to 30 minutes. See the
[execution policy](ratification-protocol.md#standard-execution-only) before changing inputs.

## What a round leaves behind

Everything is under `ratification/rounds/<round>/`, which git ignores:

```
SUMMARY.md, results.json     the score, every check per sample, the agents' own notes
round.json                   commit, prompt/rules hashes, OpenCode version, models, effective context/output limits, plugin policy
rules.md, bin/unify          exactly what every sample was given
<brief>/PROMPT.md            the prompt every sample of that brief received
<brief>/<sample>/            agent's directory, including persistent AGENTS.md and REPORT.md if authored
<brief>/.harness/<sample>/   OpenCode's event stream (events.jsonl), stderr, exit, and its session data;
                             RETROSPECTIVE.md and retrospective-*: the follow-up turn (below)
RETROSPECTIVE.md             the follow-up prompt every finished sample received
<brief>/.build/<sample>/     the fresh build every check reads
<brief>/.judge/<sample>/     scratch copy for every strict judgement and npm-script preparation
<brief>/judge-results.json   the judge's full record: chosen command, diagnostics, markers
```

Publication and redaction rules are in the [protocol](ratification-protocol.md#evidence-handling).

## The retrospective

When a sample's run ends on its own without an error — exit 0 and no error in its event
stream — the runner sends the same agent one more message in the same session:
[`briefs/RETROSPECTIVE.md`](briefs/RETROSPECTIVE.md), which asks it to look back on using
unify. It is asked **whether or not the site would pass**: the checks have not run yet, and
a sample that failed its brief is the one whose account is most worth reading. A run that
timed out, was killed, exited non-zero or reported an error is not asked.

The answer is evidence for review and is never scored. It is written to
`<brief>/.harness/<sample>/RETROSPECTIVE.md`, with the turn's own event stream, stderr and
exit record beside it as `retrospective-events.jsonl`, `retrospective-stderr.txt` and
`retrospective-exit.json`; `SUMMARY.md` lists each one under its brief and `results.json`
records it per sample. The turn runs in the sample's isolation, with OpenCode told to
refuse the tools that write files or run commands, so the sample's directory stays exactly
as its run left it, and it has ten minutes. Its cost is included in the summary's total.

Read a retrospective the way the protocol reads `REPORT.md`: as evidence of where the
agent hesitated and what it expected, not of what it did. The transcript says what it did.

## Testing the runner

```sh
bun test tests/unit/ratification.test.js tests/unit/ratification-runner.test.js tests/unit/ratification-setup.test.js tests/unit/docs-sync.test.js
bun ratification/scripts/test-isolation.mjs
bun ratification/scripts/test-opencode.mjs
```

The integration checks require working Linux mount namespaces; the last also requires
OpenCode. They verify evidence preservation, isolation during judging/builds/audits,
persistent instructions after compaction and external-plugin exclusion. The OpenCode
test uses a local HTTP fixture, never a real model or an evaluation transport. These
checks produce no ratification results.

## Status

Historical results and evidence were removed at the owner's request. Those pass claims
are not current ratification; Git history has not been rewritten. New results remain
local under `rounds/` until publication is authorized. A passing diagnostic does not
establish full ratification. Do not restore withdrawn results without authorization.
