# The website to build

**Bellwick Repair Collective** is a volunteer workshop that fixes household
things instead of landfilling them. Build its public site. Plain HTML and CSS
you write yourself; the tool is `./unify`, in this directory, and its complete
documentation is `./rules.md`. There is no browser available to you, and the
finished site may load nothing from another website. You have no image files:
write a small placeholder SVG wherever one is needed.

## Pages

1. A home page introducing the collective.
2. A **Visit** page — where the workshop is, opening hours, what to bring.
3. A **News** section: at least **four dated posts** in Markdown, written by
   volunteers who do not write HTML, with an index page listing every post,
   newest first.
4. Every page shares the collective's header (a small gear mark) and footer.

## What the news must do out in the world

- **Shared on social media, every post must show a preview card** — an image,
  the post's title, and its description — at the real published address.
- **Search engines must be able to read each post as an article**: title,
  description, its date, and its author, as machine-readable article data —
  without you hand-writing JSON.
- **Readers follow news with feed readers.** The published site must include a
  working feed that lists every post; a reader subscribing to it must see each
  post's title, address, and when it was posted. Say how you verified this.

## How it is published

- It is served from **`https://bellwick.example/workshop/`** — a subdirectory,
  not the root of a domain.
- The addresses visitors see must not end in `.html`.

## Done means

`./unify build` succeeds and the published output is correct **for that
address** — not merely correct locally. State the exact publish command line
**in a fenced code block**, say how you verified the pages, the preview cards,
the article data, and the feed.

## Before you finish

Write `REPORT.md` in this directory answering, briefly and honestly:

1. What did `rules.md` not answer? Name the sentence you wanted and could not find.
2. What did you have to re-read, and why did it not land the first time?
3. Was there anything you guessed at, or inferred rather than read?
