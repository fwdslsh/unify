# Docker Usage Guide

This repository ships **one** container image: the unify CLI, built from [`docker/Dockerfile`](../docker/Dockerfile). Use it to build a site in a pipeline or on a machine that has no unify install. It is a build tool, not a web server — serving the built site is the job of whatever host or server you deploy `dist/` to.

## The image

`docker/Dockerfile` is a two-stage build. The first stage installs Bun, runs `bun install --frozen-lockfile`, and compiles `src/cli.js` into a single executable with `bun build --compile`. The second stage copies that binary into `ubuntu:latest` — no Bun, no Node, no npm in the runtime image.

| | |
|---|---|
| Entrypoint | `unify` (arguments you pass are appended to it) |
| Default command | `--help` |
| Working directory | `/workspace` |
| User | non-root `appuser` (uid 1001, gid 1001) |

The image is published by the `docker` job in [`.github/workflows/release.yml`](../.github/workflows/release.yml) when a `v*` tag is pushed, as `fwdslsh/unify` — built from `docker/Dockerfile` in this repo, tagged with the release tag and `latest`.

```bash
docker pull fwdslsh/unify:latest
```

To build it yourself from a checkout:

```bash
docker build -f docker/Dockerfile -t unify:local .
```

## Usage

Mount your project at `/workspace` and pass a unify command. The complete CLI is in [`cli-reference.md`](cli-reference.md); the image adds nothing to it and takes nothing away.

### Build a site

```bash
docker run --rm \
  -v "$(pwd)":/workspace \
  -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  build --source src --output dist
```

`unify build` publishes all-or-nothing and exits `0` on success, `1` when problems were found (nothing published, the previous output untouched), and `2` on invalid usage or a fatal environment error — so the container's exit code is directly usable as a pipeline gate.

### Lint in CI

```bash
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  build --dry-run --strict
```

`--dry-run` runs the entire build and every check and writes nothing; `--strict` makes advisories affect the exit code. This is the one-line CI lint.

### Scaffold a new site

```bash
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  init blog
```

Templates: `default`, `basic`, `blog`, `docs`, `portfolio`.

### Watch

```bash
docker run --rm -v "$(pwd)":/workspace -u "$(id -u):$(id -g)" \
  fwdslsh/unify:latest \
  watch --source src --output dist
```

`unify watch` rebuilds on change and runs no server, which is exactly what pairs with a server you already run. Mount the volume writable (not `:ro`) so rebuilds can write, and note that file-change events do not always propagate into containers on macOS and Windows.

### About `unify dev` in a container

`unify dev` serves the output on `localhost:<port>` and unify has **no `--host` flag** — the dev server's scope is fixed at static files, directory indexes, a 404 page, and reload ([`product-spec.md`](product-spec.md) §4). Publishing a port from a container whose server is bound to loopback does not reach the host, so the supported patterns are: run `unify dev` on the host, or use the container for `build`/`watch` and point a real web server at the output.

## Docker Compose

Build with the CLI image, serve the result with a stock static web server:

```yaml
services:
  builder:
    image: fwdslsh/unify:latest
    working_dir: /workspace
    volumes:
      - ./:/workspace
      - site-dist:/workspace/dist
    command: build --source src --output dist --pretty-urls

  web:
    image: nginx:alpine
    depends_on:
      builder:
        condition: service_completed_successfully
    ports:
      - "8080:80"
    volumes:
      - site-dist:/usr/share/nginx/html:ro
    restart: unless-stopped

volumes:
  site-dist:
```

`web` is an ordinary nginx image with no unify in it; unify's involvement ends when `dist/` is written.

## Notes

- **Mount the project root, not just `src/`.** Layout discovery walks up from a page's directory to the source root, and `--source`/`--output` are resolved relative to the working directory.
- **What never ships.** Independent of `--exclude`, unify never emits the output directory, `.git/`/`.hg/`/`.svn/`, `node_modules/`, `.env` and `.env.*`, or `unify.yaml` — so mounting a whole project directory does not leak them into `dist/`.
- **Environment.** `DEBUG=1` (stack traces) is the only environment variable unify reads. There is no `NODE_ENV` behavior.
- **Saved flags.** A `unify.yaml` at the source root holds the same long option names as the CLI and never ships; CLI flags win on conflict. It keeps a containerized invocation short.

## Troubleshooting

**Files written as the wrong user.** The image runs as uid 1001. Pass `-u "$(id -u):$(id -g)"` so build output is owned by you.

**Permission denied reading the source.** The mounted tree must be readable by the container user:

```bash
chmod -R a+rX src/
```

**Nothing was published and the exit code is 1.** That is the transactional publish working as specified: problems were found, so `dist/` was left untouched. The diagnostics on stderr name the file, line, and fix.

**Inspecting a run.**

```bash
docker logs -f <container>
docker run --rm -it --entrypoint /bin/bash -v "$(pwd)":/workspace fwdslsh/unify:latest
```
