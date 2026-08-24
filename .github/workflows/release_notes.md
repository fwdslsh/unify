## What v0.8.2 fixes

No new authoring surface: the five primitives are untouched and a 0.8.1 site builds unchanged. Everything here came out of building two real sites with unify — this project's own documentation site, and fwdslsh.dev — and then asking what each of them had to work around.

- **An extensionless link resolves under `--pretty-urls`** (#68). The flag publishes `about.html` at `/about/`, so `/about` is the URL it exists to produce — and it was the one spelling the rewrite ignored, reaching the reference check unrewritten and failing there as an unresolvable reference. `/about.html` and `/about/` both worked; the clean form did not, while `unify dev` served it happily. It is now resolved and rewritten like the others, tried as `about.html` and then as `about/index.html`. A link naming no page is still a problem, and without `--pretty-urls` nothing changes. Measured on fwdslsh.dev, whose authors had written links the way the flag advertises: 198 problems across 39 files, to zero.
- **A bare `@import` is a reference** (REF-11). `@import url("/x.css")` was already checked, because it is a `url()`. `@import "/x.css"` — the commoner spelling in hand-written CSS — was not, so a stylesheet importing a stylesheet that does not exist published green while the identical mistake one line down blocked the build.
- **A repeated single-value option is a usage error** (CFG-04). `-o dist -o other` published to `other` and said nothing about it; two `--generate` paths ran the second instead of the first. Both at exit 0, both an author's instruction discarded in silence. Repeating `--exclude` still accumulates, because it is a list, and repeating a boolean flag is still fine. This is a strictness increase in a patch release, taken deliberately: it turns a silently wrong answer into a loud one.
- **`unify audit`'s summary names the problems the same run reported** (AUD-16). A run that hit a build problem and found no findings printed the problem, then said `audit: nothing to report`, then exited 1 — three lines that read as a tool bug, and what unify's own documentation site printed while it was red. The two severity axes stay separate; the summary line simply stops omitting one of them.
- **A generated asset's `--dry-run` row says `← generated`** (GEN-04). Pages already did. An asset named its overlay-relative path instead, pointing the reader at a file that does not exist anywhere in the source tree.
- **`--generate`'s failure names the runtime that ran it.** The fix line said `bun <script>` unconditionally: wrong under `npx @fwdslsh/unify`, where node hosts the build, and impossible on the standalone binary, whose whole promise is a machine with neither runtime installed.

**`data-slot` is now diagnosed as retired vocabulary** (§6.3, P08). `data-unify` and the `unify-*` area classes were already located problems naming their replacement. `data-slot`, from the same retired generation and with the same content-loss failure mode, produced no diagnostic at all — it is inert, so a page carrying it composed at exit 0 with the fill silently dropped. The cost was measured on a production site, where a shared layout's `<title>` carried it and every page emitted the layout's default title with nothing reported. If your site still uses it, this release will tell you where, and `slot="name"` with `<slot name="name">` is the replacement.

**New in the documentation:** a recipe in [`docs/integrations.md`](https://github.com/fwdslsh/unify/blob/main/docs/integrations.md) for getting a prebuilt package's browser files into a build. `node_modules/` never ships and there is no copy flag, so a package that already ships a browser-ready bundle had no documented path at all — which is why syntax highlighting was dead on fwdslsh.dev. The recipe resolves `<pkg>/package.json` and joins from its directory, which reaches files a package does not export and behaves identically under both runtimes, and it is explicit about what the build does not check for you.

## Upgrading from 0.8.1

Nothing to change to keep working, with two things worth checking.

If any script passes the same value-carrying option twice — `-o` twice, `--generate` twice — it now exits 2 instead of silently using the last one. That was always a bug in the invocation; it just used to be invisible.

If your site still carries `data-slot`, this release reports it rather than ignoring it. Those fills were never applied, so the build was already producing something other than what the markup asked for.

Sites that write extensionless internal links under `--pretty-urls` build now where they did not before, and you can delete any trailing slashes you added to work around it. The emitted output is identical either way.
