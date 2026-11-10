# The JavaScript API

> **Experimental: this API may change or be removed in any release before v1.**
> The command line is the surface unify promises not to break. If you depend on
> the API, pin unify's version.

The package exports one function, `run`. It is the command line as a function —
the same one the `unify` program calls — and it returns what the run produced
as data.

```js
import { run } from "@fwdslsh/unify";

const built = await run(["build", "--source", "site", "--base-url", "https://example.com/"]);
for (const d of built.diagnostics) console.log(d.severity, d.file, d.line, d.message);
console.log(`status ${built.status}, ${built.files.size} files`);

const audited = await run(["audit", "--source", "site", "--base-url", "https://example.com/"]);
const broken = audited.report.findings.filter((f) => f.severity === "broken");
console.log(`${broken.length} broken findings`);
```

## `run(argv)`

`argv` is the arguments you would type after `unify`: `run(["build", "--dry-run"])`
is `unify build --dry-run`, in your process and your working directory. Every
command and every flag in the [CLI reference](cli-reference.md) means what it
means there; `unify.yaml` is read the same way; the same files are written and
the same lines are printed. There are no options of its own.

It resolves to one object, with the same four keys for every command:

| Key | |
|---|---|
| `status` | The exit code: `0`, or `1` when a problem was found (or, under `--strict`, an advisory; for an audited run, a `broken` finding, or any finding under `--strict`). |
| `diagnostics` | The problems and advisories the run printed, as objects: `{ severity, file, line?, message, context?, fixes? }`, ordered by path, then line. `file` is relative to the working directory. |
| `files` | A `Map` from output path to bytes (a `Uint8Array`): the site the pipeline built, whether or not it was written. `--dry-run` and `audit` write nothing and still return it. Empty when a problem, or the `--audit` gate, kept the site from being published, and for commands that build no site. |
| `report` | The document `unify audit --format json` prints, as an object, when the run was audited (`audit`, or `build --audit`), whatever `--format` printed. Otherwise `null`; also `null` when the pipeline stopped before there was a site to evaluate, such as a failing generator. |

It rejects in the two cases the program exits without a result:

- **A usage error** — what the command line exits 2 for: an unknown flag, a bad
  `--base-url`, a missing source directory. The error is a `UsageError`
  (`error.name`), with the command line's own `message` and its `fixes`.
- **Anything unexpected** — an I/O error, or a bug in unify — with the original
  error.

```js
import { run } from "@fwdslsh/unify";

try {
  await run(["build", "--base-url", "example.com"]);
} catch (error) {
  console.log(error.name, error.message);
}
```

## Worth knowing

- **It prints.** `run` writes what the command writes, to the same streams.
  The return value is in addition to that, not instead of it.
- **It does not exit.** `run` never calls `process.exit` and never sets
  `process.exitCode`; `status` is yours to act on.
- **One at a time.** unify reads the working directory, so do not overlap calls
  in one process: await one before starting the next.
- **`dev` and `watch` do not return** until they are stopped, as on the command
  line.
- **Not a plugin API.** A caller supplies arguments and receives results, as the
  command line does. Nothing hooks into composition: there is no lifecycle, no
  transform, and no callback that can alter a page, a path or the manifest.
- Both runtimes: Bun >= 1.2.0 and Node >= 22.12.0. No `.d.ts` files ship; `run`
  is documented with JSDoc.
