# The website to build

**Fernhollow Seed Library** lends vegetable seed to its members. Build their public site.
The tool is `./unify`, in this directory; its complete documentation is `./rules.md`. You
also have `node`. There is no browser available to you, and nothing may be loaded from
another website.

## The catalogue

`varieties.json` in this directory is this season's catalogue, exported from the membership
system. It holds 225 varieties across 12 plant families, and it is re-exported each season
by someone who will never hand-edit a page. Every variety needs a page of its own.

There must be one **Browse the catalogue** page. Most members arrive on a phone, on a poor
rural connection, and the library is emphatic about this: opening that page must not pull
down all 225 varieties. Visitors pick a family first, and only that family's varieties
arrive — without the page reloading. Sending everything and hiding most of it in the
browser is exactly what they are asking you not to do.

## The rest of the site

- A home page, a **How lending works** page, and a **Growing guides** section of at least
  three guides written in Markdown by volunteers who do not write HTML.
- The library's leaf mark appears in a shared header on every page, and the same contact
  strip at the foot of every page — except **How lending works**, which ends with the
  membership terms instead.
- The **Growing guides** section has been redesigned and has its own look, while carrying
  the identical header and footer as the rest of the site.

## How it is published

- It is served from **`https://fernhollow.pages.dev/library/`** — a subdirectory, not the
  root of a domain. Everything the site loads must still resolve there, from every page,
  at every depth, including anything the browser asks for after the page has loaded.
- The addresses visitors see must not end in `.html`.
- The volunteers' working notes are in `drafts/` and must never appear in the published
  site. Neither may `varieties.json` itself — it carries members' names and addresses.
- You have no image files: write a small placeholder SVG wherever the site needs one.

## Done means

`./unify build` succeeds and the published output is correct **for that address** — not
merely correct locally. Before you call it done, state the exact publish command line, and
say how you checked that a visitor at that address gets a working page, including whatever
the browse page fetches after it loads.
