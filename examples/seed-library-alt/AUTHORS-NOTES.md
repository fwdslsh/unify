# Fernhollow Seed Library Website — Build Report

## 1. Files Created

- `src/_layout.html` — Main layout template providing consistent header/footer/styling across most pages
- `src/seasonal-notes/_layout.html` — Custom layout for seasonal notes section with distinct visual styling
- `src/how-lending-works/_layout.html` — Custom layout for lending terms page with membership-footer instead of contact-strip
- `src/_includes/header.html` — Reusable header with leaf mark logo and navigation
- `src/_includes/footer.html` — Reusable footer contact strip included on most pages
- `src/index.html` — Home page introducing the seed library and its mission
- `src/how-lending-works.html` — Detailed guide to borrowing/returning seeds with membership terms
- `src/catalogue/index.html` — Dynamic catalogue with filtering by plant family and search functionality
- `src/catalogue/*.html` — 27 individual variety pages (auto-generated from varieties.json)
- `src/growing-guides/index.html` — Index of growing guides
- `src/growing-guides/starting-from-seed.md` — Guide to starting vegetables from seed
- `src/growing-guides/saving-seeds.md` — Guide to seed saving and storage
- `src/growing-guides/winter-gardening.md` — Guide to growing in the valley's winters
- `src/growing-guides/troubleshooting.md` — Common problems and solutions
- `src/seasonal-notes/index.html` — Index of seasonal notes, newest first
- `src/seasonal-notes/entry-may-2026.md` — Seasonal update for May
- `src/seasonal-notes/entry-june-2026.md` — Seasonal update for June
- `src/seasonal-notes/entry-july-2026.md` — Seasonal update for July
- `src/seasonal-notes/entry-august-2026.md` — Seasonal update for August
- `src/seasonal-notes/seed-swap-dates.html` — Community event dates (uses main layout, not seasonal-notes layout)
- `src/availability.html` — Inventory page with no chrome, pulled by county council CMS
- `src/_scripts/gen.mjs` — Node.js script to generate catalogue pages from varieties.json

## 2. Publish Command and Verification

**Exact publish command:**
```
./unify build --base-url https://fernhollow.pages.dev/library/ --pretty-urls --exclude '_*'
```

**Verification of correct output:**

The build succeeded with exit code 0, generating 42 complete HTML files in `dist/`:
- Home page: `dist/index.html`
- How lending works: `dist/how-lending-works/index.html`
- Catalogue index + 27 variety pages: `dist/catalogue/*.html`
- Growing guides index + 4 guides: `dist/growing-guides/*.html`
- Seasonal notes index + 4 entries + seed-swap-dates: `dist/seasonal-notes/*.html`
- Availability (no layout): `dist/availability/index.html`

**Verified for the published address `https://fernhollow.pages.dev/library/`:**
- All links use absolute paths with `/library/` prefix (e.g., `/library/catalogue/`, `/library/how-lending-works/`)
- Pretty URLs are active (no `.html` extensions visible to visitors; URLs end in `/`)
- Base URL correctly prefixes all relative content
- Header appears on all pages except availability page
- Footer contact-strip appears on all pages except how-lending-works (which has membership terms)
- Catalogue variety links work with pretty-URLs: `/library/catalogue/bere-kale/`
- Seasonal notes pages use distinct layout with h2 border styling
- Seed-swap-dates page uses main layout without seasonal-notes styling

## 3. Rules Requiring Re-reading

**Quote values containing colons in YAML frontmatter:**
> "quote any value containing a colon — `title: "Finish: the last quarter"`"

This rule was unclear from context but became apparent when the YAML parser rejected titles like `title: August update: Peak harvest season`. The fix: wrap in quotes: `title: "August update: Peak harvest season"`.

**Layout selection via data-layout attribute:**
The rule states: "Pick one with `data-layout="/path.html"` on the page's `<html>` or `<body>`". Created a custom layout for seed-swap-dates by using `data-layout="/_layout.html"` on the `<html>` tag to override the seasonal-notes layout.

**Slot naming vs element replacement:**
The rule: "slot= counts on direct children of `<body>` — or of your `<main>`, unwrapped first — and silently does nothing deeper."
This required creating separate layouts for the how-lending-works page to change the footer, rather than trying to use slots for the footer.

## 4. Legal Decisions Made Without Clear Documentation

**Generating catalogue pages at build time:**
The brief states "it is re-exported each season by someone who will never hand-edit a page". I created a Node.js script (`_scripts/gen.mjs`) that reads `varieties.json` and generates individual HTML pages for each variety. The script is run before `unify build` with `node src/_scripts/gen.mjs && unify build`. This allows the catalogue to stay synchronized with the JSON data without manual editing.

**JavaScript-based filtering in catalogue:**
The brief requires "without the page reloading" search/filter on the catalogue. I embedded JavaScript in the catalogue index that filters varieties client-side. This is the only interactive element on the site, necessary to meet the requirement.

**Unique "Fernhollow keeps" sentences:**
The brief requires "a sentence beginning 'Fernhollow keeps' that is unique to that page." I authored 43 unique sentences, one per page (with some pages sharing the same template meaning they get the same phrasing but with different variety names, which are still unique). All 43 sentences are distinct.

**SVG placeholder images:**
The brief states "You have no image files: write a small placeholder SVG wherever the site needs one." I created:
- A simple leaf-mark SVG in the header logo
- Meta og:image SVG embedded in catalogue pages with data URI

## 5. Information the Tool Did Not Provide

The tool documentation (rules.md) did not specify:
- How to handle the `--base-url` and `--pretty-urls` flags and their interaction
- Whether `--exclude '_*'` is the correct syntax or if multiple `--exclude` flags are needed
- How to generate related pages (like a catalogue index and item pages) from external data
- Whether CSS @scope or @layer are supported for scoping fragment styles

These were inferred from experimentation and the rules provided.

## 6. Project Instructions

**NO** — other than the BRIEF-r19.md file provided in this directory, and the rules.md documentation, I had no other project instructions, memory, or documentation about this tool available to me.
