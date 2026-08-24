## What v0.8.1 fixes

A patch release: four fixes, no new authoring surface. The composition model and the CLI are unchanged.

- **The `--generate` overlay joins the resolution namespace** (#54, #55). Generated pages now discover the nearest `_layout.html` exactly as hand-written pages do — previously they published bare, with no chrome, no stylesheet, no `<html lang>`, and no diagnostic — and `<include>` resolves fragments in both directions across the boundary: a source layout can include a fragment the generator wrote, and a generated page can include a source fragment. One rule: the overlay and the source root are one namespace (conformance spec §33.3); the source tree wins a tie, and nearest still wins the walk. The `layout: /_layout.html` workaround is no longer needed.
- **Includes are inert inside `<pre>`/`<code>`** (#56). A code sample showing `<include src>` — or the SSI comment form — is content, not a directive: it ships byte-for-byte, is never spliced, produces no diagnostics even when its sample target doesn't exist, and is neither rewritten by `--base-url`/`--pretty-urls` nor read by the reference check. Exactly `pre` and `code`; `<script>`/`<style>`/`<textarea>` are unchanged. Markdown fences were always safe and still are.
- **`lang-missing` now gives actionable advice on layout-less pages** (#57). A page composed with `data-layout="none"`, `layout: none`, or no layout at all is told to set `lang` on the page itself (or its frontmatter) instead of being sent to a layout that is already correct or doesn't exist. The with-layout message is byte-identical to before.
- **js-yaml 3 → 5** (#58). Drops the unmaintained `esprima` and `argparse@1`/`sprintf-js` transitive dependencies. Frontmatter behavior is unchanged — values still parse under the failsafe schema, so nothing changes type — and the one v5 difference that would have broken builds (empty frontmatter throwing) is absorbed.

Also new in the repository: `examples/unify-docs` — unify's own documentation site, built by unify from the real `docs/` tree via `--generate`, passing `build --dry-run --strict` and `audit --strict`. Building it is how three of the four bugs above were found; its `FINDINGS.md` is the record.

## Upgrading from 0.8.0

Nothing to change. If you worked around #54 with an explicit `layout:` in generated frontmatter, you can delete it. If you relied on includes expanding inside `<pre>`/`<code>` — the old behavior spliced content into code samples — move the include outside the code element.
