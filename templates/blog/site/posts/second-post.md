---
title: A second post
description: The second sample post — it exists so the generated listing and feed have more than one item to show.
og:title: A second post
og:description: The second sample post — it exists so the generated listing and feed have more than one item to show.
schema: BlogPosting
date: 2026-02-03T14:05:00Z
author: Your Name Here
og:type: article
---

# A second post

<p class="placeholder">Another sample — the byline, and the date 2026-02-03T14:05:00Z, are placeholders and not facts. Delete both of these once you have written a post of your own.</p>

This file is dated later than `hello-world.md`, so the generated listing shows it first: `scripts/gen.mjs` sorts by each post's `date`, newest first, and breaks ties by filename so that two runs of the script can never disagree.

The feed leaves the author out entirely. RSS's `<author>` element wants an email address — the one field `_data/authors.json` keeps private — so the generator emits no author rather than publish one. Excluding a file cannot protect a field; only the script that writes the page can.
