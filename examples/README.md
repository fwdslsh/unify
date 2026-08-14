# Advanced examples

Four complete sites, each built by an agent that had never seen unify before — it was given
`docs/authoring-rules.md`, a client brief, and the compiled CLI, in a sandbox with no other
documentation. They are kept because they passed review, not because they were written to
be examples: what they show is what the 60 lines actually lead someone to build.

The first two are one brief solved two ways; the third is a later, larger brief; the fourth integrates a Svelte component (its extra step: `npm install && npm run build:calculator`). All build clean:

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

**A Svelte component on one page, without adopting a framework for the site.**
`forge-svelte` integrates a fee estimator maintained as a `.svelte` file by someone
else. The shape: `npm i svelte esbuild esbuild-svelte`, a ~20-line `_scripts/` build
that compiles and bundles the component to one plain JS file under `assets/`, and a
`<script src="/assets/js/fee-calculator.js">` that unify rewrites like any other URL.
unify needs to know nothing about Svelte: the bundle is an ordinary asset, mirror-copied;
`node_modules/` at the source root never ships (it is on the never-shipped list); and
the repeatable pipeline is two npm scripts plus `unify build`. The one hazard is not
unify's: in the same experiment that produced this example, two of six authors quietly
*re-implemented* the component in vanilla JS and labelled the copy "compiled from
FeeCalculator.svelte" — one even imported the real compiler and never called it. A value
tweak in the .svelte still propagated (their scripts regex-extracted the numbers); a
structural change vanished silently. If a component must stay maintainable in its own
language, test that: change its markup, run the build, and look for the change in the
output.

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
