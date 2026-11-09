# Ratification process review

Scope: entry point and options, installed-provider handoff, scheduling, subprocess
lifecycle, mount isolation, evidence preservation, report parsing, fresh builds,
checks, scoring, documentation, and retained result artifacts. This is a code/process
review, not a model evaluation. Historical results have been removed.

| Finding | Resolution |
|---|---|
| Runs required improvised launch patches, proxies and monitor scripts. | One checked-in `bun run ratify` entry point; serial execution, `--check` and `--status` are built in. No custom agent, endpoint, timeout, stagger or mask options. |
| Cleanup restricted normal provider configuration and rejected unrelated environment variables. | OpenCode resolves global, project and environment configuration; provider definitions, built-in authentication, operator allow/deny lists and credential/network environment variables are retained. |
| Forwarding all plugins allowed unrelated instructions into samples. | Use native `--pure` mode for discovery, preflight and execution; do not forward external plugins. |
| A server context increase was mistaken for a client context increase. | Print and record limits resolved inside isolation. Optional `--expect-context` rejects mismatches before inference without overriding model settings. |
| Compaction summaries lost the report requirement. | Load the unchanged original contract and brief from a persistent absolute instructions file on every turn. Missing reports still fail, with no corrective retries or synthetic reports. |
| Per-run edits were accepted without review. | New inference runs reject dirty engine, harness, briefs, rules and dependency manifests. No bypass flag. |
| Provider failure could consume the remaining sample queue. | Stop launching after an infrastructure error, checkpoint the interrupted run, score only attempted samples, and return exit 2. No automatic retries/replacements. |
| A zero process exit was easy to confuse with a passing sample. | Status reports completed/planned execution separately from the scored verdict. The exit code and summary use the same per-brief bar. |
| Shared hard-linked binaries let one sample affect another. | Each sample and fresh build receives an independent binary copy. |
| A spawn error and close event could finalize the same job twice. | Completion is guarded so descriptors and exit records are finalized once. |
| Direct judge builds/generators could modify original evidence. | All direct and npm-wrapped judge commands run in scratch copies. Original reports/sites remain untouched. |
| Privacy expectations came from mutable sample input and checked stale output. | Expectations come from the committed fixture; the scored privacy check reads the fresh rebuilt output. |
| Audit command construction split quoted paths on spaces. | Reuse the report parser's shell-token scanner and preserve quoted arguments. |
| Filesystem scans followed symlinks and could recurse outside output. | Judge/check walkers skip symlinks; fresh output paths must remain below the sample directory. |
| Scores, archives and old automation instructions encouraged reusing bespoke infrastructure. | Removed retained results and local run/relay/recovery artifacts; retired the old check-in instructions. |

## Validation

Focused tests cover configured-provider reuse, inherited credential/network environments, clean-input checks,
serial execution, interruption, timeout/context classification, the per-brief verdict,
fresh-output privacy checks, quoted audit arguments and evidence preservation. Existing
report-parser, HTML/link/fragment, Atom, npm-wrapper and documentation tests remain in place.
The namespace regression runs real generators, npm preparation, strict judging, fresh
builds and audits in isolation, without a model or provider credentials.

The installed-OpenCode regression forces compaction with a local HTTP test fixture whose
summary omits the report. It verifies that the next agent request still carries the
original contract and brief verbatim, and that `--pure` prevents an external plugin
from executing. The fixture is a test only, never a transport for real evaluations.

Verified for the execution-policy fix: 69 focused runner, judge/parser, setup and
documentation tests pass. The installed OpenCode 1.18.25 compaction/plugin regression
passes. These tests do not make real model requests or establish a ratification result.

## Boundaries that remain explicit

- `--check` performs no inference. It verifies local configuration and isolation, not
  upstream billing/authentication or whether a model can finish a brief.
- Provider configuration is operator-owned and resolved by OpenCode. Ordinary network
  proxies and custom provider endpoints are supported. The procedure prohibits creating
  experiment-specific infrastructure; it does not police the operator's network.
- External plugins are disabled; built-in authentication is retained. Providers requiring
  an external auth plugin need a native OpenCode connection before evaluation. Credential
  files must be available in the execution environment. The namespace runner requires Linux.
- Namespace masking protects experiment context, not the host from a hostile shell.
  Run in an ordinary disposable environment without host secrets or a Docker socket.
  Authentication available to OpenCode can be observed by the sample. Export review
  and credential redaction remain mandatory; raw state must not be published.
- `--status` shows the last durable checkpoint, not a remote health probe. An abruptly
  terminated supervisor may leave a running checkpoint. Do not restart into an existing
  directory or overwrite its evidence; interrupted execution needs explicit triage.
- Address/fetch analysis is static; dynamic application behavior is not fully verified.
  The catalogue page-count check counts emitted pages, not a semantic inventory of every
  variety. The Svelte brief's current checks do not prove a genuine compiler pipeline.
  These are coverage limits, not permission to silently alter checks during a run.
- Git history is not rewritten by deleting current result artifacts. Historical commits
  are not current ratification evidence.
