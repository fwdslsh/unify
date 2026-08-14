# The website to build

**Thistleknap Forge** is a community blacksmithing collective. Build its public site.
Plain HTML and CSS you write yourself; the tool is `./unify`, in this directory, and its
complete documentation is `./rules.md`. You also have `node` and `npm`, and the npm
registry is reachable. There is no browser available to you, and the finished site may
load nothing from another website.

## Pages

1. A home page introducing the forge.
2. A **Courses** page listing what the forge teaches, and a **course notes** section — at
   least three dated notes in Markdown written by the instructors, who do not write HTML,
   with an index listing every note, newest first. Notes are added after most sessions by
   people who will forget to update an index by hand.
3. A **Visit** page — where the forge is, open days, safety rules.
4. Every page shares the forge's header (the anvil mark) and footer. You have no image
   files: write a small placeholder SVG wherever one is needed.

## The fee estimator

The collective's volunteer developer maintains the course-fee estimator, and maintains it
**in Svelte** — future revisions will arrive as `.svelte` files, so it must not be
rewritten in anything else. The component is provided in this directory at
`components/FeeCalculator.svelte`.

- On the **Courses** page, a visitor sets how many people are coming and for how many
  hours, and watches the estimated cost update as they type, without the page reloading.
- Whatever it takes to turn the developer's component into something a visitor's browser
  runs must be **repeatable**: when the next revision of the `.svelte` file arrives, the
  collective runs one command and publishes. Write that command down.

## How it is published

- It is served from **`https://thistleknap.pages.dev/forge/`** — a subdirectory, not the
  root of a domain. Everything must resolve there, from every page, including everything
  the estimator needs at runtime.
- The addresses visitors see must not end in `.html`.
- The instructors' working notes are in `drafts/` in this directory and must never appear
  in the published site.

## Done means

`./unify build` succeeds and the published output is correct **for that address** — not
merely correct locally. State the exact publish command line and the estimator's build
command, and say how you verified the pages, and that the estimator's code actually
reaches the visitor's browser at that address.
