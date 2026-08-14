# Advanced examples

Three complete sites, each built by an agent that had never seen unify before — it was given
`docs/authoring-rules.md`, a client brief, and the compiled CLI, in a sandbox with no other
documentation. They are kept because they passed review, not because they were written to
be examples: what they show is what the 60 lines actually lead someone to build.

The first two are one brief solved two ways; the third is a later, larger brief. All build clean:

```bash
cd seed-library
node src/_scripts/gen.mjs
unify build -s src -o dist --pretty-urls --base-url https://fernhollow.pages.dev/library/
```

| | `seed-library` | `seed-library-alt` | `seed-library-ondemand` |
|---|---|---|---|
| varieties | 27 | 27 | 225 |
| pages | 41 | 42 | 240 |
| layouts | 2 | 3 | 2 |
| `<include>` | 4 | 5 | 4 |
| named slots | 1 | 0 | 1 |
| `data-layout="none"` | 2 | 1 | 0 |
| catalogue loading | in page | in page | fetched per family |

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
works from `file://`. Do this whenever the data is small enough to ship in the page.

**Fetching on demand, without hardcoding the deploy address.** When the data is too large
to inline — `seed-library-ondemand` has 225 varieties across 12 families — the browse page
loads one family at a time. The problem this creates is that unify rewrites `href` and
`src` under `--base-url` but never a URL inside JavaScript, so a root-relative `fetch()`
path silently 404s at a subdirectory address while resolving fine locally.

The example's answer is to never write the URL in JavaScript at all. Each family is a real
anchor pointing at its own JSON:

```html
<a href="/catalogue/data/allium.json" data-family="Allium">Allium</a>
```

which unify rewrites to `/library/catalogue/data/allium.json` like any other link. The
script intercepts the click and reads `link.href` — already absolute, already correct —
and fetches that. The deploy address appears nowhere in the JavaScript, and the page still
works with JavaScript off, because the anchors are real links. Writing the fetch path
relative to the page (`../data/allium.json`) is also correct and simpler; hardcoding
`/library/` works until the day the site moves.

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

Two of the three leak private data into published pages. The catalogue export carries a
seed-keeper name and contact address for each variety; `seed-library` and
`seed-library-alt` both put the keeper's name on every public variety page. Only
`seed-library-ondemand` publishes neither the names nor the addresses — its generator
selects the fields it emits instead of spreading the whole record.

Every one of them correctly kept `varieties.json` itself out of the output, which is the
point: the underscore rule and the never-shipped list exclude *files*, and once a generator
has copied a field into a page, that page is ordinary content. Across two rounds and twelve
independent authors, all twelve excluded the file and eight still published its private
fields. **The generator is the only place that privacy can be enforced, and no diagnostic
exists to catch you** — so name the fields you emit rather than spreading the record, the
way `seed-library-ondemand` does.
