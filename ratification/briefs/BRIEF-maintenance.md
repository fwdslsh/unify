# Maintain the notes site

You are taking over this small site. The existing content must survive your changes.
The tool is `./unify`; the supplied documentation is `authoring-rules.md`,
`getting-started.md` and `integrations.md`. Use those files and the tool's help and
diagnostics. The published address is **https://example.com/handbook/**, and page
addresses must not end in `.html`. Work offline; no new packages are needed.

Your coordinator will give you one task at a time. Complete only that task, then update
`REPORT.md` with the exact publish command in a fenced code block, the commands and
results of checks you ran, and the source files you changed. Preserve the earlier
entries. Say which documentation sentence you had to re-read, what it did not answer,
and anything you guessed rather than read. A check that reports a problem is not a
successful verification.

## 1. Add an article

Add a Markdown note called **Autumn planting**, dated `2026-10-01T09:00:00Z`, at
`/handbook/notes/autumn/`. Give it a heading, a short description and the visible sentence
“Autumn planting keeps the beds productive.” It must have the same navigation and
article appearance as the existing notes, without copying their shared page structure
into its content. Link to the first existing note's opening heading from the new note.

## 2. Rename the article

Change the article's address to `/handbook/notes/seasonal-planting/`, retaining its title,
date and all content. Update the site's links so they still reach the article. The old
address should leave the build output; no redirect is requested.

## 3. Change the navigation

Add a **Latest note** navigation link to the renamed article on every page. Future
changes to this shared navigation should require editing only one source file. Verify
the home page and the notes, not just the page currently open.

## 4. Build a notes index

Create `/handbook/notes/`, listing every published note exactly once, newest first, with
its title linked to the article. Add a draft that must stay out of both the site and the
list. Someone adding or renaming a note later must not have to update a second list;
one build must reflect the change. Check this on a temporary copy of your work. Link
the index from the shared navigation.

## 5. Repair two broken links

The coordinator has introduced two mistakes in links in your source. One points to a
file that does not exist; the other points to an absent heading on a page that does.
Find both using the tool, explain which check found each, and repair them to reach the
intended existing page and heading. Keep the links and all article content. Check again
after repairing; do not remove a page or a link to make a diagnostic disappear.

## 6. Reuse an article block

Give the new note and one existing note a **Next steps** panel with the same wrapper
markup but different visible headings and descriptions in each. A wrapper change must
need one edit and reach both panels. Keep each page's document title and description
correct. Explain where the visible words come from and where the document metadata
comes from. Use existing tool features, and verify the built markup as well as the
build's exit status.
