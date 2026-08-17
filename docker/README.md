# unify

**HTML-native composition — no expression language, no client runtime.**

unify is a static site generator for people fluent in HTML and CSS. Define a header, footer, nav, or page layout once, in plain HTML files, and have it rendered into every page of the site. The output is the HTML and CSS you wrote; unify adds no JavaScript of its own.

This image is the **unify CLI** — a build tool, not a web server. Use it to build a site in a pipeline or on a machine that has no unify install. Serving the built site is the job of whatever host or server you deploy `dist/` to.

| | |
|---|---|
| Entrypoint | `unify` (arguments you pass are appended to it) |
| Default command | `--help` |
| Working directory | `/workspace` |
| User | non-root `appuser` (uid 1001, gid 1001) |

## Usage

Mount your project at `/workspace` and pass a unify command.

```bash
# Build a site
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  build --source src --output dist

# Lint in CI — the whole build and every check, writing nothing
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  build --dry-run --strict

# Scaffold a new site
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  init blog
```

Pass `-u "$(id -u):$(id -g)"` so build output is owned by you rather than uid 1001. Mount the **project root**, not just `src/`: layout discovery walks up from a page's directory to the source root.

## Commands and options

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server (pair with your own)
unify init [template]      scaffold a starter site

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, and make og:/canonical absolute for share crawlers
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI. The image adds nothing to it and takes nothing away.

## Exit codes

`unify build` publishes all-or-nothing, so the container's exit code is directly usable as a pipeline gate:

| Code | Meaning |
|---|---|
| `0` | The site was published (with `--dry-run`: would have been). |
| `1` | Problems were found — nothing was published, the previous output is untouched. |
| `2` | Invalid usage or a fatal environment error. |

## Notes

- **`unify dev` in a container.** The dev server binds to loopback and unify has no `--host` flag, so publishing a port does not reach the host. Run `unify dev` on the host, or use this image for `build`/`watch` and point a real web server at the output.
- **What never ships.** Independent of `--exclude`, unify never emits the output directory, `.git/`/`.hg/`/`.svn/`, `node_modules/`, `.env` and `.env.*`, or `unify.yaml` — so mounting a whole project directory does not leak them into `dist/`.
- **Environment.** `DEBUG=1` (stack traces) is the only environment variable unify reads.
- **Watch in a container.** Mount the volume writable (not `:ro`), and note that file-change events do not always propagate into containers on macOS and Windows.

## Documentation

- [GitHub project](https://github.com/fwdslsh/unify)
- [Docker usage guide](https://github.com/fwdslsh/unify/blob/main/docs/docker-usage.md) — Compose recipes and troubleshooting
- [CLI reference](https://github.com/fwdslsh/unify/blob/main/docs/cli-reference.md)
- [Authoring rules](https://github.com/fwdslsh/unify/blob/main/docs/authoring-rules.md) — the complete authoring surface
