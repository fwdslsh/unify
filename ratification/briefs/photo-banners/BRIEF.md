# The website to build

**Alderfen Arboretum** is a small community arboretum. Build its public site. Plain HTML
and CSS you write yourself — no CMS, no JavaScript, and nobody on the team knows a
template language. The tool is `./unify`, in this directory; its complete documentation
is `./rules.md`.

Placeholder photographs are provided in `./images/` — the logo, a wide photo for the home
page, and a banner photo for each of the two sections. Use these files; do not create new
image files.

## Pages

1. A home page. It opens on a banner: the wide photo filling the full width of the
   window, with the arboretum's name and a one-line welcome sitting on top of the photo,
   readable over it. Below that, an introduction to the arboretum.
2. A **Visit** section. Its landing page opens on its own banner in the same style but
   shallower — that section's photo with "Visit" over it — then covers opening times,
   getting here, and accessibility.
3. A **Collections** section. Its landing page opens on its own shallower banner the
   same way, then introduces the living collections.
4. Inside Collections, guides — at least three, written in Markdown by the curators, who
   will not touch HTML: the oaks, the maples, the witch hazels. Each names its curator
   and the month the collection is at its best.
5. Every page shares the arboretum's header (with the logo) and footer — including the
   guides, one folder further down.

## How it will be published

- It is served from **`https://alderfen.pages.dev/arboretum/`** — a subdirectory, not
  the root of the domain. Every link, photo and stylesheet must still resolve there.
- The addresses visitors see must not end in `.html`: `/arboretum/visit/`, not
  `/arboretum/visit.html`.

## Done means

`./unify build` succeeds and the published output is correct for that address — every
page, and every photo on every page, at that address. Write down the exact command line
the arboretum should use to publish, and check the output yourself before you call it
done.
