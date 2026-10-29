# The website to build

**Harrowgate Observatory** is a small public observatory run by volunteers. Build its
public site. Plain HTML and CSS you write yourself; the tool is `./unify`, in this
directory, and its complete documentation is `./rules.md`. There is no browser available
to you, and the finished site may load nothing from another website. You have no image
files: write a small placeholder SVG wherever one is needed.

## Pages

1. A home page introducing the observatory.
2. A **What's Up** page — three or four things visible in the sky this season.
3. A **Visit** page — where the observatory is, opening nights, what to bring.
4. An **observing log**: at least three dated entries in Markdown, written by volunteers
   who do not write HTML, with an index page listing every entry, newest first.
5. Every page shares the observatory's header (a small star mark) and footer.

## The equipment callouts

Across the site, the same **equipment callout** appears in nine or ten places — on
"What's Up" beside each object, on "Visit" beside the opening-nights table, and in most
log entries. Every callout looks identical: a bordered panel with a small telescope icon,
a bold heading, a paragraph of body text, and a muted "difficulty" line at the bottom.

Only the words differ. The heading, the body text and the difficulty line are different in
every single one; the panel, the border, the icon and the layout are the same everywhere.

The volunteers who write log entries must be able to add a callout without copying the
panel markup, and **the day the border style changes, it must change in one place** — not
in ten files.

## How it is published

- It is served from **`https://harrowgate.pages.dev/observatory/`** — a subdirectory, not
  the root of a domain.
- The addresses visitors see must not end in `.html`.
- Half-written log entries are in `drafts/` in this directory and must never appear in the
  published site.

## Done means

`./unify build` succeeds and the published output is correct **for that address** — not
merely correct locally. State the exact publish command line, say how you verified the
pages, and say what you would edit to change every callout's border at once.

## Before you finish

Write `REPORT.md` in this directory answering, briefly and honestly:

1. What did `rules.md` not answer? Name the sentence you wanted and could not find.
2. What did you have to re-read, and why did it not land the first time?
3. Was there anything you guessed at, or inferred rather than read?
