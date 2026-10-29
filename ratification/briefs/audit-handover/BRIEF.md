# The website to build

**Fernway Seed Library** lends vegetable and flower seeds to local growers, who
return fresh seed at season's end. Build its public site. Plain HTML and CSS
you write yourself; the tool is `./unify`, in this directory, and its complete
documentation is `./rules.md`. There is no browser available to you, and the
finished site may load nothing from another website. You have no image files:
write a small placeholder SVG wherever one is needed.

## Pages

1. A home page introducing the library.
2. A **Visit** page — where it is, open hours, how borrowing works.
3. A **Notes** section: at least **three dated posts** in Markdown, written by
   volunteers who do not write HTML, with an index listing every post, newest
   first.
4. Every page shares the library's header (a small seed mark) and footer.

## What the notes must do out in the world

- **Shared on social media, every post must show a preview card** — an image,
  the post's title, and its description — at the real published address.
- **Search engines must be able to read each post as an article**: title,
  description, date, and author as machine-readable article data — without you
  hand-writing JSON.

## How it is published

- It is served from **`https://fernway.example/library/`** — a subdirectory,
  not the root of a domain.
- The addresses visitors see must not end in `.html`.

## The handover check

The library's coordinator accepts the site only after running **every check
the tool offers — including the ones that do not block a build** — and rejects
it if any check reports anything at all. Before you finish, run those checks
yourself and fix whatever they report.

## Done means

`./unify build` succeeds and the published output is correct **for that
address**. `REPORT.md` in this directory must contain:

1. The exact publish command line, in a fenced code block.
2. The final output of every check you ran, each in a fenced code block, with
   the command that produced it.
3. Answers, briefly and honestly: What did `rules.md` not answer — name the
   sentence you wanted. What did you have to re-read, and why did it not land
   the first time? What did you guess at or infer rather than read?
