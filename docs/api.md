# The JavaScript API

> **Experimental: this API may change or be removed in any release before v1.**
> The command line is the surface unify promises not to break. If you depend on
> the API, pin unify's version.

The package exports one function, `run`. It builds the site, the way
`unify build` does, and returns what the build produced as data.

```js
import { run } from "@fwdslsh/unify";

const { status, diagnostics, files, report } =
  await run({ source: "site", baseUrl: "https://example.com/", dryRun: true, audit: true });

for (const d of diagnostics) console.log(d.severity, d.file, d.line, d.message);
console.log(`status ${status}, ${files.size} files`);
console.log(`${report.findings.filter((f) => f.severity === "broken").length} broken findings`);
```

## `run(options)`

`run(options)` is `unify build` with those options, in your process and your
working directory. It runs the same code the command runs: `unify.yaml` is read
the same way, the same files are written and the same lines are printed.

**Options** are the command's flags by their long names in camelCase, and mean
what they mean in the [CLI reference](cli-reference.md): `--pretty-urls` is
`prettyUrls`, `--base-url` is `baseUrl`, `--dry-run` is `dryRun`. A flag takes
`true`; an option with a value takes a string; `exclude` takes an array of
strings. `false` and `undefined` mean the option was not given. There are no
options of its own.

**It resolves to** one object, always with these four keys:

| Key | |
|---|---|
| `status` | The exit code: `0`, or `1` when a problem was found (or, under `strict`, an advisory; with `audit`, a `broken` finding, or any finding under `strict`). |
| `diagnostics` | The problems and advisories the build printed, as objects: `{ severity, file, line?, message, context?, fixes? }`, ordered by path, then line. `file` is relative to the working directory. |
| `files` | A `Map` from output path to bytes (a `Uint8Array`): the site that was built, whether or not it was written — `dryRun` writes nothing and still returns it. Empty when a problem, or the `audit` gate, kept the site from being published. |
| `report` | With `audit: true`, the document `unify audit --format json` prints, as an object. Otherwise `null`; also `null` when the build stopped before there was a site to evaluate, such as a failing generator. |

**It rejects** in the two cases the command exits without a result:

- **A usage error** — what the command line exits 2 for: an unknown option, a
  bad `baseUrl`, a missing source directory. The error is a `UsageError`
  (`error.name`), with the command line's own `message` and its `fixes`.
- **Anything unexpected** — an I/O error, or a bug in unify — with the original
  error. A value that cannot be an option's value (`{ source: 5 }`) is a
  `TypeError`.

```js
import { run } from "@fwdslsh/unify";

try {
  await run({ baseUrl: "example.com" });
} catch (error) {
  console.log(error.name, error.message);
}
```

## Worth knowing

- **To evaluate without publishing**, pass `dryRun: true` and `audit: true`:
  the site is built, checked and audited, nothing is written, and you get
  `files` and `report`.
- **It prints.** `run` writes what the command writes, to the same streams.
  The return value is in addition to that, not instead of it.
- **It does not exit.** `run` never calls `process.exit` and never sets
  `process.exitCode`; `status` is yours to act on.
- **One at a time.** unify reads the working directory, so await one call
  before starting the next.
- **Not a plugin API.** A caller supplies options and receives results, as the
  command line does. Nothing hooks into composition: there is no lifecycle, no
  transform, and no callback that can alter a page, a path or the manifest.
- Both runtimes: Bun >= 1.2.0 and Node >= 22.12.0. No `.d.ts` files ship; `run`
  is documented with JSDoc.
