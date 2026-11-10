# The JavaScript API

> **Experimental: this API may change or be removed in any release before v1.**
> The command line is the surface unify promises not to break. The one firm
> contract on this side is the audit report's `schemaVersion`. If you depend on
> the API, pin unify's version.

unify can be driven from another program — a task runner, a CI script, a host
build platform — without shelling out. Two functions, `build()` and `audit()`,
run the pipeline the commands of the same names run and **return** what the
command line would have printed. This page has everything there is; every
literal below is tested (`tests/conformance/api-docs.test.js`).

It is deliberately **not a plugin API**. A caller supplies inputs and receives
results, exactly as the command line does. Nothing hooks into composition: no
lifecycle, no transform, no callback that can alter a page, a path or the
manifest, and no access to unify's intermediate state. Anything you can do
through the API, a person with a shell could already do.

## Example

```js
import { build, audit } from "@fwdslsh/unify";

const audited = await audit({ source: "site", baseUrl: "https://example.com/" });
const broken = audited.report?.findings.filter((f) => f.severity === "broken") ?? [];
console.log(`${broken.length} broken findings`);

if (audited.status === 0) {
  const built = await build({ source: "site", output: "dist", baseUrl: "https://example.com/", strict: true });
  for (const d of built.diagnostics) {
    console.log(`${d.file}${d.line ? `:${d.line}` : ""}: ${d.severity}: ${d.message}`);
  }
  console.log(`build status ${built.status}`);
}
```

To get the site back as bytes instead of writing it, dry-run it:

```js
import { build } from "@fwdslsh/unify";

const { status, files } = await build({ source: "site", dryRun: true });
for (const [path, bytes] of files) console.log(path, bytes.length);
```

## The package

`@fwdslsh/unify` exports `build` and `audit`, and nothing else: the package's
`exports` map exposes the root only, so a deep import such as
`@fwdslsh/unify/src/core/compose.js` is an error. Importing the package starts
nothing, prints nothing and reads nothing.

The API works the same under Bun >= 1.2.0 and Node >= 22.12.0.

## Options

The options are the camelCase of the long flag names, which are also the keys of
`unify.yaml`: `--pretty-urls` is `prettyUrls`, `--base-url` is `baseUrl`. They are
derived from the CLI's own option list, so a flag the CLI gains for these
commands is an option here.

- A boolean flag takes `true` or `false`; `exclude` takes an array of strings; the
  rest take a string. `undefined` is the same as leaving the option out.
- Relative paths resolve against `process.cwd()`, as the command line's do. There
  is no `cwd` option.
- `generate` is a **path** to a JavaScript file, never a function.
- An option that does not exist for the function, or has the wrong type, is a usage
  error (below).

| | `build(options)` | `audit(options)` |
|---|---|---|
| In common | `source` `output` `exclude` `prettyUrls` `baseUrl` `canonical` `feedFull` `strict` `catalog` `searchCorpus` `includeNoindex` `generate` `sourceInventory` `extends` | the same |
| Only here | `clean` `dryRun` | `external` |

`audit` writes nothing, so it has neither `clean` nor `dryRun`. `external: true` is
the one option that touches the network: it fetches the off-origin URLs the site
emits (`unify audit --external`).

Not available: `format` (serializing is the command line's job; the API returns an
object), a gated-publish option (call `audit()`, then `build()`), and everything
specific to `dev`, `watch`, `init` and `update`, which stay CLI-only. There are no
API-only options.

### `unify.yaml`, and `dryRun`

- **`unify.yaml`** is read exactly as the commands read it: the same discovery, the
  same resolution of relative paths inside it. An option you pass **wins over the
  file**, as a flag does on the command line, an explicit `false` included
  (`prettyUrls: false` beats a saved `pretty-urls: true`).
- **`dryRun: true`** (`build` only) runs every step, the reference check included,
  and publishes nothing; the output directory is neither created nor touched. The
  result carries `files` — the data form of what `unify build --dry-run` lists.

## Results

```
build(options)  -> Promise<{ status, diagnostics, files?, error? }>
audit(options)  -> Promise<{ status, diagnostics, report, error? }>
```

- **`status`** is the command line's exit code: `0` built, `1` a problem was found
  (or, under `strict`, an advisory; for `audit`, a `broken` finding, or any finding
  under `strict`), `2` a usage error. A usage error is *returned*, never thrown and
  never printed.
- **`diagnostics`** is the list of problems and advisories as plain objects,
  `{ severity, file, line?, message, context?, fixes? }`, ordered by path then line
  — the order and the content the command line prints, with `file` relative to the
  working directory. Empty on status 2.
- **`files`** (`build`, only for a dry run) is a `Map` from output path to bytes
  (a `Uint8Array`) — exactly the tree a real build would have published. It is
  empty when a problem stopped the build, and absent otherwise.
- **`report`** (`audit`) is the object `unify audit --format json` serializes,
  `schemaVersion` and all. It is `null` when the run stopped before the site could
  be evaluated: a usage error, or a problem that stops the pipeline before the
  scan, such as a failing generator (the problem is in `diagnostics`, `status` is
  `1`).
- **`error`**, `{ message, fixes }`, appears only with `status: 2`, a usage error:
  what the command line prints for exit 2.

Only what the command line would exit 0, 1 or 2 for is a result. Anything else — an
I/O error, a bug in unify — **rejects** the promise with the original `Error`.

Status 2 looks like this:

```js
import { build } from "@fwdslsh/unify";

const result = await build({ source: "site", baseUrl: "example.com" });
console.log(result.status, result.error.message);
```

## Behaviour worth knowing

- **Nothing is printed and nothing exits.** The API writes nothing to stdout or
  stderr and never calls `process.exit`.
- **Calls run one at a time.** unify reads the working directory, so overlapping
  calls in one process are queued rather than interleaved. Two calls in a row are
  independent: the second sees nothing of the first.
- **Same pipeline, same bytes.** For the same tree and options, `build()` and
  `unify build` produce byte-identical output and the same diagnostics, and
  `audit()`'s report equals `unify audit --format json`. A test holds them to it
  on both runtimes (`tests/conformance/api-equivalence.test.js`, gate G15).

## Limitations

- **A generator's output is dropped.** What `--generate` writes to its stdout and
  stderr reaches the command line's streams; it does not reach yours. A generator
  that fails still comes back as a located problem, with its error text in the
  message.
- No `.d.ts` files ship. The functions are documented with JSDoc.
- No observers, hooks, callbacks or in-memory input. These are not planned.
