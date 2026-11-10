# The JavaScript API

> **Experimental: this API may change or be removed in any release before v1.**
> The command line is the surface unify promises not to break. If you depend on
> the API, pin unify's version.

**The API is the command line, called as a function.** `build()` is `unify build`
and `audit()` is `unify audit`, run by the CLI's own code in the current working
directory, with the two output streams captured instead of printed. Same flags,
same `unify.yaml` handling, same behaviour, same files written. There is nothing
else to learn: [the CLI reference](cli-reference.md) is the reference.

It is deliberately **not a plugin API**. A caller supplies inputs and receives
results, exactly as the command line does; nothing hooks into composition.
Anything you can do through it, a person with a shell could already do.

## Example

```js
import { build, audit } from "@fwdslsh/unify";

const audited = await audit({ source: "site", baseUrl: "https://example.com/", format: "json" });
const report = JSON.parse(audited.stdout);
console.log(`${report.summary.broken} broken findings`);

if (audited.status === 0) {
  const built = await build({ source: "site", baseUrl: "https://example.com/", strict: true });
  process.stderr.write(built.stderr);
  console.log(`build status ${built.status}`);
}
```

## The two functions

```
build(options?) -> Promise<{ status, stdout, stderr }>
audit(options?) -> Promise<{ status, stdout, stderr }>
```

- **`status`** is the exit code the command would have had: `0`, `1` (problems, or
  findings) or `2` (a usage error). It is returned; the process never exits and
  `process.exitCode` is never set.
- **`stdout`** and **`stderr`** are exactly the bytes the command would have written
  to each stream: diagnostics, the summary, the `--dry-run` listing, the audit
  report in the chosen `--format`, a generator's own output, the `--save-config`
  message, usage errors (message and `fix:` lines), and the `unify: <message>` line
  for an unexpected failure. Nothing reaches the real `process.stdout` or
  `process.stderr`.

Machine-readable output is the CLI's own: ask for `format: "json"` or `"sarif"` on
`audit()` and parse `stdout`. Diagnostics are the CLI's `FILE:LINE: SEVERITY:
message` lines on `stderr`.

## Options

Options become command-line flags and are parsed by the CLI's own parser, so every
flag is available and a misuse is the usage error the CLI gives:

| option value | argv |
|---|---|
| `prettyUrls: true` | `--pretty-urls` |
| `prettyUrls: false` or `undefined` | (omitted) |
| `baseUrl: "https://example.com/"` | `--base-url=https://example.com/` |
| `exclude: ["_*", "drafts/**"]` | `--exclude=_* --exclude=drafts/**` |

The key is the long flag in camelCase (`dryRun`, `searchCorpus`, `saveConfig`,
`format`, `external`, ...). There is no list of options in the API: an unknown
option, or `baseUrl: true`, comes back as `status: 2` with the CLI's message in
`stderr`.

The one thing the API checks itself: a value that is not a boolean, a string or an
array of strings, or `options` that is not a plain object, is a programmer error,
and the returned promise rejects with a `TypeError`.

## Behaviour worth knowing

- **It runs in `process.cwd()`**, as the command does; relative paths resolve
  against it, and `unify.yaml` is found as the CLI finds it.
- **Calls are queued.** The pipeline reads the working directory, so calls started
  together run one at a time, in order, each as if it were alone.
- **Same bytes.** For the same tree and flags, a call and the command produce the
  same `status`, `stdout`, `stderr` and files, on Bun and on Node. A test holds them
  to it (`tests/conformance/api-equivalence.test.js`, gate G15).
- **Only the package root is importable.** Importing it starts nothing and prints
  nothing; a deep import such as `@fwdslsh/unify/src/core/compose.js` is an error.
  It exports `build` and `audit`, and nothing else.

## Limitations

- No `.d.ts` files ship; the functions are documented with JSDoc.
- `dev`, `watch`, `init` and `update` are CLI-only.
