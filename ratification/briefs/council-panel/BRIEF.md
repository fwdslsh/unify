# The website to build

**Holt Fen Windmill** is a restored windmill run by a small trust. Build its public site.
Plain HTML and CSS you write yourself; the tool is `./unify`, in this directory, and its
complete documentation is `./rules.md`. You also have `node`. There is no browser
available to you, and nothing may be loaded from another website.

## Pages

1. A home page telling the mill's story.
2. A **Visit** page — opening times, directions, what a tour costs.
3. A **Milling days** section — at least three dated notes written in Markdown by
   volunteers who do not write HTML, with an index listing every note, newest first.
   Notes are added whenever the mill runs, by people who will forget to update an index
   by hand.
4. Every page shares the trust's header (the sails mark) and footer. You have no image
   files: write a small placeholder SVG wherever one is needed.

## The panels

- The **district council's visitor site** shows the mill's opening hours inside its own
  pages: their system fetches a fixed address on the mill's site and drops whatever it
  receives straight into their page. What arrives must be bare markup — their loader
  rejects any response that carries its own `<html>`, `<head>`, or `<body>` — and the
  address must keep working season after season, because the council will not update
  their end.
- The same opening-hours panel appears on the mill's own **Visit** page. It is one panel,
  maintained in one place: when the hours change, one edit updates both the Visit page
  and what the council receives.
- On the home page, a visitor flips between **this month's** and **next month's** milling
  days without the page reloading. Each month's list is only fetched when the visitor
  asks for it.

## How it is published

- It is served from **`https://holtfen.pages.dev/mill/`** — a subdirectory, not the root
  of a domain. Everything must resolve there, from every page, including anything the
  browser asks for after a page has loaded.
- The addresses visitors see must not end in `.html`.
- The volunteers' working notes are in `drafts/` in this directory and must never appear
  in the published site.

## Done means

`./unify build` succeeds and the published output is correct **for that address** — not
merely correct locally. State the exact publish command line, and say how you verified
it: the pages, the council's address, and what the home page fetches when a visitor flips
the month.
