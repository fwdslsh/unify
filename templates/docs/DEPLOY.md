# Publishing this site

`unify build` writes the whole site to `dist/`. There is nothing to run in production: `dist/` is
plain files, so any static host serves it — GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket,
or a directory on a server you already have.

## 1. Replace the placeholders

Nothing a scaffold writes is a fact about you. **The site's name is written in more than one file**,
and the ones a build never corrects are the ones that publish it anyway — so this list names every
one of them rather than the first:

- **the site's name and byline** — `site/_layout.html` (the title suffix and the footer), and then
  `site/index.html` and `site/404.html`, which each write it into their own visible text and their own
  `description`, as does every page you copy out of `site/_examples/`. Grep the scaffolded name once
  and you will find them all: `grep -rn 'My Site' site/`, with whichever name your template shipped;
- **the contact details** — the reserved `example.com` mailbox in `site/index.html`'s footer line and
  in `site/_examples/contact.html`, and no postal address at all, because a plausible street address
  in a scaffold is one an author publishes;
- **a generator's own constants**, if your project has one. The blog template's
  `scripts/gen.mjs` opens with `SITE_NAME` and `LISTING_DESCRIPTION`;
- `site/assets/share-placeholder.png` — a flat 1200×630 placeholder card, not a photograph. It is
  the image social crawlers show. Replace the file, and **if your image is a different size,
  correct `og:image:width` and `og:image:height` in `site/_layout.html` to match it**: a declared
  size the file contradicts is a claim nothing else will ever catch;
- `site/robots.txt`, which blocks nothing. Edit it if you need to — unify never decides what a site
  should block.

## 2. Check before you publish

    unify build --audit --strict      # the whole build, every check and the audit; publishes only if all of it passes
    unify build --dry-run --audit --strict   # the same, writing nothing

The audit is what a reader or a crawler would find missing (`unify audit --strict` runs it alone).
A fresh scaffold passes. Keep it that way as you add pages: every page wants its own title,
description, and single `<h1>`, and a link in from somewhere.

## 3. Build with your address

`--base-url` is the site's whole public address, never a bare path. It prefixes every
root-relative link, makes `og:` and canonical URLs absolute — which is what share crawlers fetch —
and writes `dist/sitemap.xml`. Every page that authors no canonical of its own gets one naming its
own final URL (`--canonical none` switches that off); an authored canonical always wins.

Hosting the site under a subpath? Name the whole thing, trailing slash included:
`--base-url https://you.example/handbook/`.

A site whose pages declare `schema: Article` or `schema: BlogPosting` — the blog template's example
post does — also gets `feed.xml`, an Atom feed of those pages, with nothing to run. Link it from
`site/_layout.html` once you build this way (`<link rel="alternate" type="application/atom+xml"
title="Posts" href="/feed.xml">`): a fresh scaffold has no feed to link yet, and the build says so
if the link comes first.

If your project has a generator — the blog template's `scripts/gen.mjs`, named in `unify.yaml` —
unify runs it as part of every build, so the derived pages are current by construction. Every
command in this file runs from here, the project root, where `unify.yaml` and the script live
beside the site.

## 4. Publish `dist/`

Whatever your host reads is the last step, and it is not a unify command. Copy the directory
(`rsync`, `scp`), push it to a Pages branch, or hand it to your host's own CLI — for example
`npx wrangler pages deploy dist` or `netlify deploy --prod --dir=dist`. In CI, run the two checks
from step 2 first and let a non-zero exit stop the deploy.

## The two commands

    unify build --base-url https://you.example/
    rsync -av --delete dist/ you@your-host.example:/var/www/your-site/
