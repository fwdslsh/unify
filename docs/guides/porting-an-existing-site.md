---
description: "Keep an existing site's URLs when you port it to unify: which source path answers to each live address, and a check that every address still resolves."
---

# Porting an existing site: keeping its URLs

**Role**: a port has one constraint the tutorial does not: the addresses already exist. Search engines, shared links and other sites point at them, and every one has to come out of the new build unchanged. In unify a page's address is its source path and nothing else — there is no `permalink`, no `slug`, no route table — so a port is a mapping from each live URL to the one source path that answers to it. This guide is that mapping, plus a check that runs it against the whole list. Every literal in it is tested (`tests/conformance/porting-guide.test.js`).

## The rule

Read each row from left to right: the address you must keep, then the file that keeps it.

| Live URL | Source file in a plain build | Source file under `--pretty-urls` |
|---|---|---|
| `/` | `index.html` | `index.html` |
| `/about.html` | `about.html` | none — the flag publishes every `about.html` at `/about/` |
| `/about/` | `about/index.html` | `about.html`, or `about/index.html` — never both, that is a collision |
| `/blog/hello.html` | `blog/hello.html` or `blog/hello.md` | none |
| `/blog/hello/` | `blog/hello/index.html` or `blog/hello/index.md` | `blog/hello.html` or `blog/hello.md` |
| `/404.html` | `404.html` | `404.html` — never moved; hosts look for it there |

Two things the table implies. `--pretty-urls` is a site-wide switch: it moves *every* page, so a site whose live addresses are all directory-shaped can take it and keep flat source files, and a site with even one `.html` address it must keep cannot. And a directory address never needs the flag: `about/index.html` publishes at `/about/` in either build, which is the escape hatch for the mixed site below.

An extensionless address — `/about` with no slash and no `.html` — is a host convention, not a file: hosts answer it by redirecting to `/about/` or by serving that directory's `index.html`. Put the `/about/` form in the list you check, and link the real file in your pages — `about.html` — which the build rewrites to whatever the flags make it ([Getting started](../getting-started.md#links-and-assets) has that table).

## A mixed site

The port that takes thought is the one whose live addresses mix both shapes:

```
/                 /services/          /pricing/
/about.html       /blog/hello.html    /404.html
```

No flag reproduces that mix, so build without `--pretty-urls` and put each route in its path:

```
site/
├── _layout.html
├── index.html            →  /
├── about.html            →  /about.html
├── services/index.html   →  /services/
├── pricing/index.html    →  /pricing/
├── blog/hello.md         →  /blog/hello.html
└── 404.html              →  /404.html
```

`unify build --dry-run` prints exactly this mapping, one row per page, with the address in parentheses, so the port can be read off before anything is written:

```
write dist/about.html (/about.html) ← about.html + _layout.html
write dist/blog/hello.html (/blog/hello.html) ← blog/hello.md + _layout.html
write dist/services/index.html (/services/) ← services/index.html + _layout.html
```

## Markdown or HTML

A Markdown page publishes where the HTML page of the same name would: `blog/hello.md` answers to `/blog/hello.html` in a plain build and to `/blog/hello/` under `--pretty-urls`. A port can therefore change a page's *format* without moving its *address*, and links to it may name either spelling — `blog/hello.md` or `blog/hello.html` — because the build resolves both.

## Check every live URL

A port script reasons about addresses; a check reads them. `unify audit --format json` lists every page the build would publish with its final `url`, so one short script compares that against the list you must keep — the old sitemap, a crawl, a server log:

```js
// scripts/check-urls.mjs — every address in the list must be one the build publishes
import { readFileSync } from "node:fs";
const [, , reportPath, listPath] = process.argv;
const published = new Set(JSON.parse(readFileSync(reportPath, "utf8")).pages.map((p) => p.document.url));
const wanted = readFileSync(listPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const missing = wanted.filter((url) => !published.has(url));
for (const url of missing) console.log(`missing: ${url}`);
console.log(`${wanted.length - missing.length} of ${wanted.length} addresses published`);
process.exit(missing.length ? 1 : 0);
```

```sh
unify audit --format json --base-url https://acme.example/ > audit.json
node scripts/check-urls.mjs audit.json urls.txt
```

`urls.txt` is one absolute address per line, spelled exactly as the site serves it — `https://acme.example/services/`, trailing slash included — because this compares strings, not what a host would redirect. `--base-url` is what gives each page an absolute `url`; pass the address the site deploys at. The script exits 1 and names every address the build does not publish, which makes it a pre-deploy check rather than a port-day one: run it beside `unify build --dry-run --strict`.

## What not to reach for

- `permalink:` and `slug:` in frontmatter are build errors on purpose: each would publish or address a page somewhere other than where its source path says. Move or rename the file instead.
- An address you decide *not* to keep is a redirect, and redirects are your host's feature, not unify's. Its configuration file ships like any other non-page file.
- `--pretty-urls` chosen before the address list is read. The flag moves every page, the `.html` addresses you meant to keep included; decide it from the list, then write the tree.
