# Ratification protocol

This measures whether an author can produce a compliant site from
`docs/authoring-rules.md`, a plain-English brief, seeded assets and the compiled CLI.
Samples must not read the specification, repository, other samples or prior sessions.
The CLI's help, diagnostics and built-in templates remain part of the authoring surface.

## Standard execution only

Use `bun run ratify` from a clean checkout of the committed code under test. Use the
installed OpenCode CLI and its normal provider configuration and authentication. Select
any configured model from `opencode models`, as documented in [README.md](README.md).
Existing endpoints, environment variables, network proxies and authentication plugins
are supported. The harness must not implement provider-specific setup or transport.

The following are forbidden during a run:

- Creating experiment-specific proxies, credential relays or forwarding servers.
- Custom agent commands, patched SDKs, model adapters or launcher wrappers.
- Temporary edits to the runner, judge, engine, briefs, prompts or scoring thresholds,
  including edits made only inside a container.
- Per-run model/context/output overrides, custom timeout or concurrency tuning,
  or custom isolation masks. Ordinary OpenCode configuration and environment variables
  remain supported; the harness must not rewrite them to rescue a run.
- Replacing failed samples, combining favorable subsets, or presenting process exits
  and report presence as scored passes.

Select only the requested installed model, brief scope, sample count and round name.
The runner uses committed HEAD, serial execution and the brief's committed timeout.
It rejects uncommitted inputs and prohibited command options. There
is no bypass option. Containers and VMs may provide isolation, not customization.

Run `--check` before inference; it checks local prerequisites, not upstream billing or health.
Use `--status` for progress. If a provider/authentication error occurs, the runner stops
launching new samples and reports an incomplete round with pending samples unscored. Do not
invent infrastructure, change lab services, rotate credentials, increase context or
substitute a model. A needed implementation change must be a normal reviewed and
tested repository change before any new run. Model failures remain failures.
Infrastructure-interrupted samples must be identified separately and retained;
any recovery run requires an explicit request and a separate record.

## The bar

Full ratification uses all seven committed briefs and five fresh samples per brief/model.
Every scored check must pass for a sample to pass. The model meets the bar only if
at least four of five samples pass **each** brief. A process exit of zero or a report
file is not a pass. Strict builds must have zero problems and zero advisories.

Record the commit, CLI version, model, standard execution policy, prompt/rules hashes,
all sample outcomes and infrastructure failures. Do not claim that an interrupted run
is a clean capability measurement. A stronger-model comparison is a separate experiment
and must be requested explicitly. All earlier result records have been removed.

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

State what a site must do in plain language, without supplying the mechanism being
measured. Keep the brief, seeded files and prompt fixed during a comparison. Each brief
lives under `briefs/<name>/` with `BRIEF.md`, `brief.json`, and optional `seed/` files.
Changes to briefs and checks require ordinary review and tests, not run-specific edits.

## Maintenance tasks after the first build

Maintenance tasks use a separately specified fixed guide corpus and are distinct from
rules-only authorship. Do not improvise follow-up prompts within a ratification sample.
The manual maintenance brief is not part of the standard seven-brief run.

## Evidence handling

Results stay under ignored `ratification/rounds/` until publication is explicitly
requested. Never publish authentication files, raw provider state or credentials in
transcripts. Inspect and redact exported artifacts directly; do not add a proxy as an
export safeguard. Preserve all authorized outcomes and disclose any redaction.
