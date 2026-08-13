# Advanced examples

Two complete sites, each built by an agent that had never seen unify before — it was given
`docs/authoring-rules.md`, a client brief, and the compiled CLI, in a sandbox with no other
documentation. They are kept because they passed review, not because they were written to
be examples: what they show is what the 60 lines actually lead someone to build.

Both are the same brief, solved differently. Both build clean:

```bash
cd seed-library
node src/_scripts/gen.mjs
unify build -s src -o dist --pretty-urls --base-url https://fernhollow.pages.dev/library/
```

| | `seed-library` | `seed-library-alt` |
|---|---|---|
| pages | 41 | 42 |
| layouts | 2 | 3 |
| `<include>` | 4 | 5 |
| named slots | 1 | 0 |
| `data-layout="none"` | 2 | 1 |

`AUTHORS-NOTES.md` in each is the author's own write-up, unedited — including what it found
unclear. That is more useful than a tidy narration would be.

## The patterns worth copying

**Pages generated from data, by a script you run yourself.** unify has no data files and no
collections. `src/_scripts/gen.mjs` reads `varieties.json` and writes one Markdown page per
variety into the source tree; `unify build` then treats them as ordinary pages. The script
lives under `_scripts/` so it never ships, and the build step is two commands, not a plugin:

```bash
node src/_scripts/gen.mjs && unify build
```

The same shape produces the seasonal-notes index — read the entries' frontmatter, write the
index page — so nobody maintains a list by hand.

**Client-side filtering with no framework and no fetch.** The catalogue page renders every
variety at build time with its family and name on the element, and a small inline script
hides and shows them. There is no request, so nothing 404s on a subpath deploy and the page
works from `file://`. Prefer this to fetching a JSON endpoint: unify rewrites `href`/`src`
under `--base-url`, but it does not rewrite a URL inside JavaScript, so a fetched path is
one you have to keep correct yourself.

**A section that looks different but shares chrome.** `notes/_layout.html` is a complete
standalone document with its own styling, and pulls the same header and footer fragments the
site layout uses — which is what `<include>` is for. One page in that section opts back out
to the site layout with `data-layout`.

**A page with no chrome at all.** The availability page is embedded in another
organisation's CMS, so it carries `data-layout="none"` and ships as bare content.

**Deploying under a subdirectory.** Every link is written root-relative and the address is
supplied once at build time. Nothing in the source hardcodes the domain, so the same tree
publishes to a different host by changing one flag.

## What these examples do not show

Neither site keeps private data out of its published pages. The catalogue export carries a
seed-keeper name and contact for each variety, and both authors rendered the keeper's name
onto the public variety pages — `seed-library` dropped the email, `seed-library-alt` kept
the name too. The build cannot help here: the underscore rule and the never-shipped list
exclude *files*, and once a generator has copied a field into a page, that page is ordinary
content. If a data source has fields that must not be published, the generator is the only
place to drop them, and there is no diagnostic to catch you.
