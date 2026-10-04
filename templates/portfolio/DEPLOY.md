# Publishing this site

`unify build` writes the whole site to `dist/`. There is nothing to run in production: `dist/` is
plain files, so any static host serves it — GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket,
or a directory on a server you already have.

## 1. Replace the placeholders

Nothing a scaffold writes is a fact about you. **The site's name is written in more than one file**,
and the ones a build never corrects are the ones that publish it anyway — so this list names every
one of them rather than the first:

- **the site's name and byline** — `site/_layout.html` (the title suffix and the footer), and then
  `site/index.html`, `site/404.html` and `site/contact.html`, which each write it into their own
  visible text and their own `description`. Grep the scaffolded name once and you will find them
  all: `grep -rn 'My Site' site/`, with whichever name your template shipped;
- **the contact details** on `site/contact.html` — a reserved `example.com` address, and no postal
  address at all, because a plausible street address in a scaffold is one an author publishes;
- **a generator's own constants**, if your project has one. The blog template's
  `scripts/gen.mjs` opens with `SITE_NAME` and `LISTING_DESCRIPTION`. Its feed's links are
  **absolute** and take the `--base-url` you build with (step 3); until you pass one they name
  the placeholder `https://you.example`, which unify never rewrites or checks, because the feed
  is a mirror-copied asset. Build with your address and the feed follows;
- `site/assets/share-placeholder.png` — a flat 1200×630 placeholder card, not a photograph. It is
  the image social crawlers show. Replace the file, and **if your image is a different size,
  correct `og:image:width` and `og:image:height` in `site/_layout.html` to match it**: a declared
  size the file contradicts is a claim nothing else will ever catch;
- `site/robots.txt`, which blocks nothing. Edit it if you need to — unify never decides what a site
  should block.

## 2. Check before you publish

    unify build --dry-run --strict    # the whole build and every check, writing nothing
    unify audit --strict              # what a reader or a crawler would find missing

A fresh scaffold passes both. Keep it that way as you add pages: every page wants its own title,
description, and single `<h1>`, and a link in from somewhere.

## 3. Build with your address

`--base-url` is the site's whole public address, never a bare path. It prefixes every
root-relative link, makes `og:` and canonical URLs absolute — which is what share crawlers fetch —
and writes `dist/sitemap.xml`. Every page that authors no canonical of its own gets one naming its
own final URL (`--canonical none` switches that off); an authored canonical always wins.

Hosting the site under a subpath? Name the whole thing, trailing slash included:
`--base-url https://you.example/handbook/`.

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
