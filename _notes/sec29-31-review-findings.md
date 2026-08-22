## [blocking] 1. §29.6's "a relative URL … cannot arise" is false: --feed-full ships a page's own relative href/src verbatim, so every entry from a subdirectory page carries links that 404 in a reader
**where:** /home/user/unify/src/core/feed.js:330

**evidence:**
```
src/blog/post.html (schema Article, dated) body: `<p>Next: <a href="sibling.html">sibling</a>, and <img src="diagram.png" alt="d">.</p>`

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/ --feed-full
EXIT=0
$ sed -n '/<content/,/<\/content>/p' dist/feed.xml
    <content type="html">&lt;h1&gt;Post&lt;/h1&gt;
&lt;p&gt;Next: &lt;a href=&quot;sibling.html&quot;&gt;sibling&lt;/a&gt;, and &lt;img src=&quot;diagram.png&quot; alt=&quot;d&quot;&gt;.&lt;/p&gt;
</content>

The feed lives at https://example.com/feed.xml, so a reader resolves those against the feed's own base and fetches /sibling.html and /diagram.png; the real files are /blog/sibling.html and /blog/diagram.png. A second run under `--base-url https://example.com/repo/` with a root-level page shows the other half: `href="/repo/index.html"` and `src="/repo/pic.png"` — root-relative, not absolute.
```

**why:** §29.6: "with **URLs left exactly as they were emitted**. Under `--base-url` those are already absolute (§11.3), which is what a feed reader needs. Without `--base-url` there is no feed at all (§29.1), so the case where a relative URL would escape into a reader's page **cannot arise**." The premise is wrong about §11.3: §11.3 prepends only the *path prefix* to href/src (the **origin** goes only to og:/twitter: and canonical), and §11.1's third bullet leaves a page's own relative URL untouched entirely when the page did not move. rules.tsv FEED-05 restates the false claim verbatim. tests/conformance/feed.test.js:438's fixture body contains no URLs at all, so nothing separates the two readings.

**fix:** Resolve each `<content>` URL against the entry's own absolute address before emitting — the entry already knows it (`record.url`/the canonical §29.5 puts in `<id>`), so §11's provenance rule can be applied once more with the page's address as the base. If instead the verbatim-bytes rule is to win, §29.6's last two sentences must be deleted and replaced with the actual cost ("an entry's body carries the page's own root-relative and relative URLs; a reader resolves them against the feed's address, so a page below the output root ships links a reader cannot follow") — and that change must land in tests/conformance/rules.tsv FEED-05 in the same edit.

## [blocking] 2. §31.3's "closed set" is not closed: --external fetches CSS url() tokens (in <style> blocks and style attributes) and the <meta http-equiv="refresh"> URL
**where:** /home/user/unify/src/core/external.js:187

**evidence:**
```
src/index.html contains no href, no src, no og:/twitter: meta, no JSON-LD and no canonical — only a `<style>` url(), a meta refresh, and a `style="…url()"`; src/robots.txt carries an off-origin `Disallow:`.

$ bun /home/user/unify/src/cli.js audit --external
audit: nothing to report
EXIT=0
$ cat hits.json           # every request the local server received
["HEAD /from-style-block.png","HEAD /from-meta-refresh","HEAD /from-style-attr.png"]

Three network requests went out from a page holding nothing in §31.3's scope. (The `Disallow:` value was correctly not fetched.)
```

**why:** §31.3: "Scope is the **closed set** of off-origin references the manifest already holds: `href` and `src` values §12 skipped for being on another origin, the `og:`/`twitter:` image URLs, JSON-LD URL-valued properties (§12's list), and a `<link rel="canonical">` naming another site." A CSS `url()` and a refresh URL are each their *own* separate bullet in §12 and are named in none of §31.3's four items; rules.tsv RPT-03 repeats the closed list. `collectExternalReferences` reuses `collectHtmlReferences` whole (references.js:240 collects href/src/poster/srcset, og:/twitter:, the refresh URL, JSON-LD, `<style>` url() and `style` url()) and keeps every off-origin value, so the scope is §12's, not §31.3's. This is the only unify operation that touches a third party, and no test asserts the boundary — tests/conformance/audit-report.test.js:357 only fixtures plain `<a href>` targets.

**fix:** Filter `collectHtmlReferences`'s output down to §31.3's four items before `note()` — keep href/src/poster/srcset and `<link href>`, keep the og:/twitter: metas, drop the CSS `url()` refs and the refresh URL — or, if the wider surface is intended, widen §31.3's enumeration and tests/conformance/rules.tsv RPT-03 in the same edit and say why a `url()` is fetched while a `Disallow:` is not.

## [blocking] 3. --external turns a site whose off-origin links all live on one unreachable host into a false "could not reach the network" usage error (exit 2) instead of external-unreachable findings
**where:** /home/user/unify/src/core/external.js:317

**evidence:**
```
src/index.html with one off-origin link, `<a href="http://127.0.0.1:1/dead-one">`:

$ bun /home/user/unify/src/cli.js audit --external
unify audit --external could not reach the network
  fix: check connectivity, or drop --external to audit offline
EXIT=2

Same page with a second, reachable off-origin link added (`http://127.0.0.1:43390/live`, a live local server) — proving the network is up and the first URL is genuinely just a dead host:

$ bun /home/user/unify/src/cli.js audit --external
index.html: incomplete: "http://127.0.0.1:1/dead-one" failed: Unable to connect. Is the computer able to access the url? (ConnectionRefused) [external-unreachable]
  fix: confirm the URL is correct, or remove the reference — …
audit: 0 broken, 1 incomplete
EXIT=0

The identical fault is reported correctly in one run and swallowed into a usage error in the other, decided only by whether some *other* URL on the site happened to answer.
```

**why:** §31.3's table: "`external-unreachable` | incomplete | **the request failed**, timed out, or answered 4xx/5xx" — a connection refusal is a request that failed. The usage-error escape hatch is conditioned on "A run that **cannot reach the network at all**", which is false here. It also breaks §24.6's exit table (findings without `--strict` → 0, not 2) and §31.1's "Exit codes are §24.6's, unchanged", and contradicts §31.3's own rationale that a dead third-party host "is not wrong markup". `networkUnreachable` is computed as "every probed URL failed at the connection level", which is true of the extremely ordinary site with exactly one off-origin reference. No test covers it: every RPT-03 fixture has at least one reachable target.

**fix:** Make the usage error require evidence that the *network*, not a host, is down — e.g. only when every failure is a DNS-resolution failure across two or more distinct hosts, or drop the heuristic and report each failed URL as `external-unreachable` (which §31.3's table already prescribes for "the request failed"). Whatever rule is chosen, add a test with a single dead off-origin link asserting exit 0 and one finding.

## [blocking] 4. §29.7's "for a generated feed this can only pass" is false for a relative canonical: the feed emits record.canonical verbatim and re-resolves it against feed.xml at the root, blocking the publish of a valid site
**where:** /home/user/unify/src/core/feed.js:308

**evidence:**
```
src/blog/post.html declares `<link rel="canonical" href="post.html">` (valid, resolves to blog/post.html, accepted by §12), `<meta name="schema" content="Article">` and a dated `article:published_time`.

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/feed.xml: problem: post.html does not resolve to any emitted file
  in: post.html
  fix: check the path spelling and casing
EXIT=1
$ ls dist
(no dist — publish blocked)

The same relative canonical on a root-level page publishes instead, with a relative atom:id:

$ sed -n '/<entry>/,/<\/entry>/p' dist/feed.xml
  <entry>
    <id>post.html</id>
    <title>Post</title>
    <link rel="alternate" href="post.html"/>
…
```

**why:** §29.7 claims the check "can only pass" *because* `classifyCanonical` answers `self` only for a canonical resolving to the page's own output path. That argument requires one resolution; the code has two — `classifyCanonical` resolves the canonical against **the page's** output path (making it an entry), while `checkFeedLocs` resolves the identical string against **feed.xml at the output root** (feed.js:504). One value, two answers, which is exactly the single-interpretation law §29.4 invokes when it calls classifyCanonical "the shared reader, so 'which page does this URL name' keeps one answer". The user-visible cost is P13 against `src/feed.xml`, a file the author does not have, under `fix: check the path spelling and casing` — the spelling was right. The published variant is also wrong on its own terms: §29.5 calls `<id>` "the entry's **canonical URL**" and cites RFC 4287 §4.2.6's stability requirement, which a relative reference resolved against the feed's location cannot satisfy. tests/conformance/feed.test.js:317 only ever fixtures a *root-relative* canonical (`/index.html`), which §11.3 absolutizes, so nothing separates the two.

**fix:** In `serializeEntry`, emit the canonical resolved to an absolute URL rather than `record.canonical` raw — reuse the resolution `classifyCanonical` already performed against the page's own output path and prefix `base.origin`, so `<id>`/`<link rel="alternate">` are the absolute URL §29.5's column header names and §29.7's guarantee then actually holds. Add a fixture with a relative canonical on a subdirectory page.

## [blocking] 5. --format sarif emits documents that are invalid against SARIF 2.1.0: every `fix` object omits the required `artifactChanges`
**where:** /home/user/unify/src/core/report.js:239

**evidence:**
```
$ bun /home/user/unify/src/cli.js audit --format sarif > sarif-out.json
$ curl -s https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json -o sarif-schema.json   # 200, 112768 bytes
$ bun -e '…check each results[].fixes[] against schema.definitions.fix.required…'
runs[0].results[0].fixes[0] is missing required property "artifactChanges" -> {"description":{"text":"add a description describing this page; …"}}
… (5 of 5 results)
SARIF 2.1.0 definitions.fix.required = ["artifactChanges"]; violations = 5

Separately, the `$schema` the document declares 404s:
$ curl -sS -o /dev/null -w "%{http_code}\n" "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json"
404
```

**why:** §31.4: "`--format sarif` is exactly that: the same finding list §31.1 serializes, **mapped field for field into SARIF 2.1.0**", and rules.tsv RPT-04 repeats it. A document every SARIF validator (and every SARIF ingest, e.g. code scanning) rejects is not that. Note `fix` is not one of §31.4's five named mappings (`id`→`ruleId`, `file`→artifact location, `evidence`→message, `fingerprint`→`partialFingerprints`, severity→`level`) — it was added on top, and unify has no artifact change to put in `artifactChanges`, which is §31.4's own stated signal ("a future field needing a SARIF-only derivation is the signal this serializer has become an analysis path"). No test parses the output against the schema; tests only read fields back out of the JSON.

**fix:** Drop the `fixes` array (it is outside §31.4's five-field mapping and is the only thing making the document invalid); carry the fix string in `properties.fix` beside `outputPath`/`url` if it must be retained. Also point `$schema` at a URL that resolves (…/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json). Add a test that validates the emitted document's `fixes`/`results` shape against the schema's `required` lists.

## [blocking] 6. A site with an Article/BlogPosting page and no root index.html cannot publish: the feed-level <id> and rel="alternate" are P13'd against a src/feed.xml that does not exist
**where:** /home/user/unify/src/core/feed.js:370

**evidence:**
```
src/ containing only post.html (schema Article, dated), no index.html:

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/feed.xml: problem: https://example.com/ does not resolve to any emitted file
  in: https://example.com/
  fix: check the path spelling and casing
EXIT=1
$ ls dist
(no dist)
```

**why:** §29.5 makes the feed `<id>` and `<link rel="alternate">` unconditionally "the site's own address", §29.7 checks "every URL the feed emits … exactly as §21.6 checks a sitemap's" with no exemption, and §12/§21.6's directory-URL rule resolves that address only when `index.html` exists at the output root — while §29.1 activates the whole feature on any *one* page anywhere declaring the type, with no requirement that a home page exist (§29.5's own `<title>` fallback "else the site's host" anticipates exactly that). §29.7's "can only pass" argument rests solely on §29.4's third condition, which governs entries and says nothing about these two feed-level elements — the section is internally inconsistent, so I am reporting rather than picking a side. The diagnostic also names a file the author cannot open and tells them to check a spelling that is unify's own. (Disclosed in feed.js:354-369 and escalated in the reconciliation report; still unresolved and still blocking a correct site's publish.)

**fix:** Spec decision, then code: either exempt the two feed-level site-address URLs from §29.7's check (RFC 4287 does not require `atom:id` to dereference), or state in §29.1 that a feed-activating site must emit a root page and raise a located, actionable problem saying so. Whichever is chosen, tests/conformance/rules.tsv FEED-04/FEED-06 must be updated in the same edit, and a fixture without a root index.html added.

## [nonblocking] 7. A feed with zero entries omits <updated> entirely, publishing a document that is not a conforming Atom feed — reachable from §29.3's own worked example
**where:** /home/user/unify/src/core/feed.js:381

**evidence:**
```
src/index.html plus src/hello.md with `schema: Article` and `date: 2026-01-02` (§29.3's own example):

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — …
EXIT=0
$ cat dist/feed.xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/</id>
  <title>Home</title>
  <link rel="self" href="https://example.com/feed.xml"/>
  <link rel="alternate" href="https://example.com/"/>
</feed>
```

**why:** §29.5's element table lists `<updated>` (feed) with no omission condition — only `<summary>`, `<author>` and `<content>` carry one — and §29.2 commits the document to Atom, whose RFC 4287 §4.1.1 makes `atom:updated` a required child of `atom:feed`. The spec never says what the value is when there are no entries, so the code cannot be judged wrong against it; it is a gap that ships an invalid artifact at exit 0. tests/conformance/feed.test.js:180 builds exactly this zero-entry feed and asserts only that it exists and carries no entry — it never looks at `<updated>`, which is why the gap survived.

**fix:** Spec decision recorded in §29.5 (with the matching tests/conformance/rules.tsv FEED-04 edit): either suppress the file entirely when the entry set is empty — cheap, honest, and consistent with "a feed nobody can subscribe to is not a feed" — or state the feed-level `<updated>` fallback explicitly. It must not be the build clock (§20.10). Then assert it in the A17 test that already produces the case.

## [nonblocking] 8. An authored feed.xml's internal URLs are checked only under --base-url, so a root-relative broken reference in one publishes clean while the identical value in a page beside it is P13
**where:** /home/user/unify/src/cli/commands/build.js:462

**evidence:**
```
src/feed.xml (authored) containing `<id>/gone-id.html</id>` and `<link rel="alternate" href="/gone-link.html"/>`:

$ bun /home/user/unify/src/cli.js build
EXIT=0                       # published, nothing said
$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/feed.xml: problem: /gone-id.html does not resolve to any emitted file
src/feed.xml: problem: /gone-link.html does not resolve to any emitted file
EXIT=1

Control — the same value as an ordinary link in the page beside it, still with no --base-url:
$ bun /home/user/unify/src/cli.js build
src/index.html:3: problem: /gone-link.html does not resolve to any emitted file
EXIT=1
```

**why:** §29.7's suppression sentence is unqualified: an authored feed.xml "ships byte-for-byte, and has its internal URLs checked **exactly as a generated one does**"; §29 contains no analogue of §21.1's explicit "Activation governs this entire section, §21.6's verification included". §23.1 records this exact mistake being made once already — "An earlier version of this section borrowed §21.1's conclusion without its premise" — and gives the premise test: a `<loc>` is absolute by protocol so classifying one needs the site's address, whereas `/gone-link.html` is internal by inspection, no address required. The gate at build.js:462 wraps the feed check in the sitemap's `if (baseConfig)`, producing the same asymmetry inside one build that §23.1 calls a defect. No test exercises an authored feed.xml without --base-url.

**fix:** Move the `checkFeedLocs` call out of the `if (baseConfig)` block (passing `base` through, which governs only the stripping step, exactly as §12 and §23.3 do), or add to §29.7 the sentence §21.1 has — "activation governs this section, §29.7's verification included" — with the matching tests/conformance/rules.tsv FEED-06 edit. Either way add a fixture covering an authored feed.xml with a broken root-relative reference and no --base-url.

## [blocking] 9. A feed entry's <id> emits a relative canonical verbatim: the build either blocks on a P13 naming a file that does not exist, or ships a feed pointing at a different page than the sitemap
**where:** src/core/feed.js:308

**evidence:**
```
Case A — publish blocked on a site with nothing wrong. src/blog/post.html declares an ordinary relative self-canonical:

  <link rel="canonical" href="post.html">
  <meta name="schema" content="Article"><meta name="date" content="2026-01-02T09:00:00Z">

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/feed.xml: problem: post.html does not resolve to any emitted file
  in: post.html
  fix: check the path spelling and casing
EXIT=1        # `ls src` -> about.html post.html blog/ ; there is no src/feed.xml

Case B — same page, plus an unrelated root-level src/post.html so the check happens to pass. Build exits 0 and publishes:

dist/feed.xml:
  <entry>
    <id>post.html</id>
    <title>Blog post</title>
    <link rel="alternate" href="post.html"/>
dist/sitemap.xml (same page):
  <url><loc>https://example.com/blog/post.html</loc></url>

A reader resolving `post.html` against the feed's own address (https://example.com/feed.xml) gets https://example.com/post.html — a different page of the site — while the sitemap says /blog/post.html.
```

**why:** §29.7: "For a generated feed this can only pass … an entry's `<id>` is its canonical, and `classifyCanonical` answers `self` … only for a canonical that resolves to this page's own output path." That is false as implemented: `classifyCanonical` (§21.2, via isSelfCanonical) resolves the value against the PAGE's output path, while `checkFeedLocs` resolves the same string against `feed.xml` at the output root (feed.js:504, `resolveReference(stripped, FEED_PATH)`) — two resolutions of one value, the defect §20/§21.3's "same string by construction" rule exists to forbid. Case B additionally violates §29.5 ("`<id>` is the canonical because an id must be stable") and RFC 4287 §4.2.6, which requires an IRI, not a relative reference.

**fix:** In `serializeEntry` (feed.js:308), absolutize a non-absolute canonical against the page's own public URL before using it for `<id>` and `<link rel="alternate">` — e.g. `const c = record.canonical; const id = c === null ? record.url : (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(c) ? c : new URL(c, record.url).href);` — leaving an already-absolute authored value byte-for-byte untouched. That makes §29.7's "can only pass" claim true for this branch and makes the feed and the sitemap name one address.

## [blocking] 10. A site with an Article/BlogPosting page and no root index.html cannot be published under --base-url, and the problem is attributed to src/feed.xml, a file that does not exist
**where:** src/core/feed.js:370

**evidence:**
```
src/ contains only about.html and post.html (post.html declares `<meta name="schema" content="Article">` and a full date). No index.html.

$ bun /home/user/unify/src/cli.js build -o distA
EXIT=0

$ bun /home/user/unify/src/cli.js build -o distB --base-url https://example.com/
src/feed.xml: problem: https://example.com/ does not resolve to any emitted file
  in: https://example.com/
  fix: check the path spelling and casing
EXIT=1
$ ls -d distB
ls: cannot access 'distB': No such file or directory

`src/feed.xml` does not exist — the value came from feed.js:370/383, which emit the site address into the generated feed's `<id>` and `<link rel="alternate">`, and build.js:497-501 attributes a generated feed to the bare path `feed.xml`.
```

**why:** §29.7 asserts "For a generated feed this can only pass"; it does not. The spec is internally inconsistent and I am reporting rather than picking a side: §29.5 makes the feed `<id>` and `rel="alternate"` unconditionally "the site's own address", §29.7 checks "every URL the feed emits" exactly as §21.6 checks a `<loc>` (which resolves a directory URL only to an existing index.html), and §29.1 activates on any ONE page declaring the type, with no requirement that a home page exist. Separately, §14.1 requires a located diagnostic to name the offending markup's provenance file; `src/feed.xml` names nothing the author can open, and "check the path spelling and casing" names no path they can correct.

**fix:** Spec decision, then a matching edit to docs/conformance-spec.md §29.7 AND tests/conformance/rules.tsv in the same change. The narrow option: exempt the two feed-level site-address URLs from `checkFeedLocs` (RFC 4287 §4.2.6 does not require an atom:id to dereference) — in feed.js's `internalFeedUrls`, skip `<id>`/`<link>` that are direct children of `<feed>`. The alternative is to state in §29 that a feed-activating site must emit a root page. Either way, a generated artifact's P13 must not be attributed to a source path that does not exist.

## [blocking] 11. unify audit --external prints its findings in network-response order, so two runs over one unchanged tree emit different bytes
**where:** src/core/audit.js:794

**evidence:**
```
Site: one page, two off-origin links to a local server that alternates which endpoint is slow (700 ms) per request — i.e. ordinary network jitter, no change to the tree between runs.

$ for run in 1 2 3 4 5 6; do bun /home/user/unify/src/cli.js audit --external 2>/dev/null | grep external-unreachable; done
run 1: /aaa /zzz
run 2: /zzz /aaa
run 3: /aaa /zzz
run 4: /zzz /aaa
run 5: /aaa /zzz
run 6: /zzz /aaa

$ for run in 1 2 3 4 5 6; do bun /home/user/unify/src/cli.js audit --external --format json 2>/dev/null | md5sum; done
807e3be088f7518f167e3bd1104ed39e  -
91d8894f59deac901e85e278d8575b6e  -
807e3be088f7518f167e3bd1104ed39e  -
91d8894f59deac901e85e278d8575b6e  -
807e3be088f7518f167e3bd1104ed39e  -
91d8894f59deac901e85e278d8575b6e  -
```

**why:** §31.3: "the order of the report is not the order of the responses — findings sort by §24.5's rule like every other, so two runs over one tree print the same bytes whatever the network did." `sortFindings` (audit.js:107) compares only (file, id); every `external-unreachable` first referenced by one page ties on both. Array.prototype.sort is stable, so the tie order is the input order — and `externalUnreachableFindings` iterates `results`, whose insertion order is completion order (external.js:313, `results.set(url, await probeOne(...))` inside `mapBounded`). The bytes are therefore a function of the network. This also breaks §31.1's "`findings` is §24.5's order — so the two formats list the same things in the same sequence" as a run-to-run guarantee.

**fix:** In `externalUnreachableFindings` (audit.js:794) iterate `owners` instead of `results` — `for (const [url, record] of owners) { const result = results.get(url); if (!result || result.ok) continue; … }`. `owners` is built in manifest order (external.js:179) and is response-independent, so the stable sort's tie order becomes deterministic.

## [blocking] 12. --external reports "could not reach the network" and exits 2 for a site whose links are merely broken; whether a genuine broken link is reported depends on whether some other link happens to be up
**where:** src/core/external.js:317

**evidence:**
```
Site A — one page, one off-origin link, to a host that refuses connections:
  <p>See <a href="http://127.0.0.1:8799/partner">our partner</a>.</p>
$ bun /home/user/unify/src/cli.js audit --external
unify audit --external could not reach the network
  fix: check connectivity, or drop --external to audit offline
EXIT=2

Site B — the SAME dead link, plus one link to a host that answers 200:
$ bun /home/user/unify/src/cli.js audit --external
index.html: incomplete: "http://127.0.0.1:8799/partner" failed: Unable to connect. Is the computer able to access the url? (ConnectionRefused) [external-unreachable]
  fix: confirm the URL is correct, or remove the reference — the failure may be on the other server rather than this one, not in this site's output
audit: 0 broken, 1 incomplete
EXIT=0

The network was reachable in both runs (the 8741 server answered 200 in run B, seconds later).
```

**why:** §31.3's catalogue row: `external-unreachable` fires when "the request failed, timed out, or answered 4xx/5xx" — a refused connection is a failed request and must be reported. The usage-error escape is scoped to "a run that cannot reach the network at all", a statement about the run, not about one host. As written, `entries.every((r) => r.reason === "connection")` makes a single dead hostname — the commonest broken external link there is, and the whole reason someone runs `--external` — indistinguishable from having no network, and swallows the finding a CI job asked for behind exit 2.

**fix:** Require evidence about the run rather than about one host: in external.js:317 compute `networkUnreachable` only when the connection-level failures span more than one distinct host — e.g. `const hosts = new Set(urls.map(u => { try { return new URL(u).host; } catch { return u; } })); const networkUnreachable = hosts.size > 1 && entries.length > 0 && entries.every(r => r.reason === "connection");`

## [nonblocking] 13. --external fetches URLs on schemes fetch cannot handle and classifies the local rejection as a connection failure, leaking a runtime-internal message into a finding and (alone on a site) triggering the exit-2 path
**where:** src/core/external.js:232

**evidence:**
```
Site with one off-origin reference, an ordinary FTP download link:
  <p>Download it from <a href="ftp://ftp.gnu.org/gnu/hello/hello-2.12.tar.gz">the FTP mirror</a>.</p>
$ bun /home/user/unify/src/cli.js audit --external
unify audit --external could not reach the network
  fix: check connectivity, or drop --external to audit offline
EXIT=2

Same page plus one live http link:
$ bun /home/user/unify/src/cli.js audit --external
index.html: incomplete: "ftp://ftp.gnu.org/gnu/hello/hello-2.12.tar.gz" failed: protocol must be http:, https: or s3: (ERR_INVALID_ARG_VALUE) [external-unreachable]
audit: 0 broken, 1 incomplete
EXIT=0

No socket is ever opened in either run: `ABSOLUTE_RE` (external.js:71) accepts any `scheme://`, and fetch rejects it locally, which `probeOne` labels `reason: "connection"`.
```

**why:** §31.3 describes fetching "every off-origin URL the site emits" over HTTP (`HEAD`, `GET` on 405, redirects, timeout) — a scheme no HTTP client can speak is not a request that failed, and calling it a connection failure feeds the network-unreachable predicate evidence that has nothing to do with the network. The evidence string also quotes a Bun-specific message naming `s3:`, which is not prose about this site.

**fix:** In `collectExternalReferences`'s `note` (external.js:173), skip values whose scheme is not http/https after `withScheme` — or, if they should still be reported, give `probeOne` a fourth reason (`'unsupported-scheme'`) with a plain message and exclude it from `networkUnreachable`.

## [nonblocking] 14. --external fetches well outside §31.3's closed set: srcset entries, poster, a meta-refresh target, non-image og:/twitter: values, and CSS url() inside <style> blocks and style= attributes
**where:** src/core/external.js:187

**evidence:**
```
One page declaring only these (no <a href>, no og:image, no canonical, no JSON-LD):
  <meta property="og:video" content="http://127.0.0.1:8742/video.mp4">
  <meta http-equiv="refresh" content="30; url=http://127.0.0.1:8742/refresh-target">
  <style>body { background: url(http://127.0.0.1:8742/bg.png); }</style>
  <p style="background:url('http://127.0.0.1:8742/attr.png')">styled</p>
  <img src="/local.png" srcset="http://127.0.0.1:8742/one.png 1x" alt="a">
  <video poster="http://127.0.0.1:8742/poster.jpg"></video>

$ bun /home/user/unify/src/cli.js audit --external
audit: nothing to report

Request log of the third-party server:
HEAD /attr.png
HEAD /bg.png
HEAD /one.png
HEAD /poster.jpg
HEAD /refresh-target
HEAD /video.mp4
```

**why:** §31.3: "Scope is the closed set of off-origin references the manifest already holds: `href` and `src` values §12 skipped for being on another origin, the `og:`/`twitter:` image URLs, JSON-LD URL-valued properties (§12's list), and a `<link rel="canonical">` naming another site." None of the six above is in that list — the list is enumerated deliberately (it names `<link rel="canonical">` separately even though a link has an href). `collectHtmlReferences` is §12's whole reference surface, which is broader than §31.3's set by design: §11.1 says a `url()` value is never even rewritten, and §12 checks it against the output tree. The result is that the product's one networked operation contacts third-party hosts the spec says it does not, and can raise `external-unreachable` for values §31.3 does not authorize.

**fix:** Filter §12's refs down to §31.3's four categories rather than taking `collectHtmlReferences`'s output whole — have references.js tag each ref with the attribute/element it came from (it already knows: href/src/poster/srcset/meta/refresh/css) and, in external.js:187, keep only `href`/`src` refs, the `og:image`/`twitter:image` metas, and `<link href>`.

## [nonblocking] 15. A feed with no entries omits atom:updated, publishing a document that is not conforming Atom — reachable on an ordinary blog whose posts carry day-only dates
**where:** src/core/feed.js:381

**evidence:**
```
src/hello.html declares `<meta name="schema" content="Article">` and `<meta name="date" content="2026-01-02">` (the natural spelling; `date: 2026-01-02` in Markdown frontmatter reaches the same place).

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/hello.html: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
EXIT=0

$ cat dist/feed.xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/</id>
  <title>My Blog</title>
  <link rel="self" href="https://example.com/feed.xml"/>
  <link rel="alternate" href="https://example.com/"/>
</feed>

Required-element check: id present, title present, updated MISSING.
```

**why:** Spec inconsistency, reported rather than resolved unilaterally: §29.5's table lists the feed `<updated>` unconditionally as "the newest entry's `<updated>`" and gives it no "omitted when" (unlike `<summary>`/`<author>`), while §29.1 activates the whole feature on a declaration rather than on membership, so a zero-entry feed is reachable. RFC 4287 §4.1.1 requires exactly one atom:updated on a feed, so the emitted file is rejected by conforming readers. The implementation cannot invent the instant (§20.10, product-spec §6.1), so the gap is in §29, not in feed.js.

**fix:** Spec decision, applied to docs/conformance-spec.md §29 AND tests/conformance/rules.tsv in the same edit. The coherent narrow option: add a fourth clause to §29.1 — no feed is written when the entry set is empty — which keeps A17 as the explanation and never emits a non-conforming document; implementation-side that is `if (entries.length === 0) return generated;` before feed.js:426.

## [nonblocking] 16. A17's fix line for an HTML page names an element the page does not declare, so following it verbatim leaves the advisory firing and the feed empty
**where:** src/core/feed.js:253

**evidence:**
```
src/hello.html declares `<meta name="schema" content="Article">` and `<meta name="date" content="2026-01-02">`. The build says:

  src/hello.html: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
    fix: write <meta property="article:published_time" content="2026-01-02T09:00:00Z"> — a feed entry's timestamp needs a time and a time zone

The author does exactly that, keeping the meta they already had and adding the named one after it:
  <meta name="date" content="2026-01-02">
  <meta property="article:published_time" content="2026-01-02T09:00:00Z">

$ bun /home/user/unify/src/cli.js build --base-url https://example.com/
src/hello.html: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write <meta property="article:published_time" content="2026-01-02T09:00:00Z"> …
EXIT=0
$ grep -c "<entry>" dist/feed.xml
0

The same fix applied to a page that declared `article:published_time` in the first place does work (entry count 1), so the defect is specific to the `<meta name="date">` spelling.
```

**why:** §20.4 keeps "the first accepted declaration in document order", and `<meta name="date">` is an accepted source for `datePublished` (§20.3), so the added element never wins. §29.3's own worked example spells the fix as changing the value the page already wrote (`fix: write date: 2026-01-02T09:00:00Z`), not as adding a second declaration; §14.1 makes `fix:` "one edit per line", i.e. an edit that repairs the fault. An advisory whose repair is a no-op is the silent failure §14 exists to forbid.

**fix:** Make `dateOnlyFix` (feed.js:253-257) name the declaration the page actually made rather than guessing one — carry the winning meta's name on the record's date field, or, minimally, drop the element name from the HTML branch: `give the page's date a time and a time zone: content="${sample}"`, which is true whichever of the two metas supplied the value.

## [blocking] 17. `--base-url` alone now blocks publish on any site with an Article/BlogPosting page and no root `index.html` — a regression against the previous commit, with the problem located at a source file that does not exist
**where:** src/core/feed.js:370,383 (feed `<id>` / `rel="alternate"`), checked at src/cli/commands/build.js:497

**evidence:**
```
Fixture: `src/article.html` only (no `index.html`), declaring `<meta name="schema" content="Article">` + `article:published_time`.

$ bun <prev-commit-worktree>/src/cli.js build -s src -o dist-base --base-url https://example.com/
base exit=0
  dist-base/: article.html  sitemap.xml

$ bun /home/user/unify/src/cli.js build -s src -o dist-new --base-url https://example.com/
src/feed.xml: problem: https://example.com/ does not resolve to any emitted file
  in: https://example.com/
  fix: check the path spelling and casing
new exit=1
(no dist-new)

No new flag was passed. `src/feed.xml` does not exist in the source tree — `emittedFromSource.get(FEED_PATH) ?? feed.FEED_PATH` yields `feed.xml`, which `relocateDiagnosticsToCwd` then prints as `src/feed.xml`, so the author is pointed at a file they cannot open. Confirmed the same tree builds and publishes clean at 32a55a7.
```

**why:** §29.7 asserts "For a generated feed this can only pass", and rests that claim entirely on §29.4's third condition, which governs only *entry* URLs. §29.5 makes the feed-level `<id>` and `<link rel="alternate">` the site's own address unconditionally, and §12/§21.6's directory rule resolves that address only when `index.html` exists at the tree root, while §29.1 activates on any one Article/BlogPosting page anywhere with no requirement that a home page exist. The two sentences cannot both hold — an internal inconsistency in §29, not a code/spec disagreement. It also breaks the rule §21.1 states for the sibling feature (a site that built clean before a section existed keeps building clean when no flag opted it in), and §14.1's location contract (a diagnostic names a file the author can edit).

**fix:** Raise the §29.7 inconsistency to the spec owner and take one of its two resolutions in the same edit (updating tests/conformance/rules.tsv row FEED-06 with it): either exempt the feed-level `<id>`/`rel="alternate"` site address from §29.7's check — restoring §29.7's own "can only pass" guarantee, which `checkFeedLocs` would then satisfy by skipping those two values — or state in §29.1 that a feed-activating site must emit a root page. Independently, when a generated artifact has no source file, locate its diagnostic at the output path without the `src/` relocation, so the message never names a file that does not exist.

## [blocking] 18. `--feed-full` ships root-relative URLs inside `<content type="html">`, which resolve against the feed reader's origin — the exact failure §29.6 says cannot arise
**where:** src/core/feed.js:331 (extraction at src/core/feed.js:282-293)

**evidence:**
```
Fixture: `src/index.html`, `src/p.html` (declares `schema: Article` + `article:published_time`) whose `<main>` contains `<a href="/index.html">home</a> <img src="/pic.png">`, and `src/pic.png`.

$ bun /home/user/unify/src/cli.js build -s src -o dist --base-url https://example.com/ --feed-full
exit=0
$ grep -o '<content type="html">.*' dist/feed.xml
<content type="html">&lt;h1&gt;P&lt;/h1&gt;&lt;p&gt;&lt;a href=&quot;/index.html&quot;&gt;home&lt;/a&gt; &lt;img src=&quot;/pic.png&quot; alt=&quot;&quot;&gt;&lt;/p&gt;</content>

Same under a subpath address: with `--base-url https://example.com/repo/` the content carries `href="/repo/about.html"`, still root-relative — and `grep -o 'href="[^"]*about[^"]*"' dist/blog/hello.html` shows the emitted page itself carries exactly that, confirming §11.3 never made it absolute.
```

**why:** §29.6 states the rule ("URLs left exactly as they were emitted") and justifies it with a claim that is false: "Under `--base-url` those are already absolute (§11.3), which is what a feed reader needs." §11.3 prepends only the **path part** to `href`/`src`/`srcset`/`poster`; its **origin** is prepended only to `og:`/`twitter:` content and `<link rel="canonical">`. So every ordinary link and image in `<content>` leaves the site root-relative and a reader renders it against its own host — "the case where a relative URL would escape into a reader's page", which §29.6 says cannot arise. rules.tsv row FEED-05 carries the same false premise verbatim.

**fix:** Escalate the §29.6 inconsistency and, in the same edit as the rules.tsv FEED-05 update, make `mainMarkup`'s output absolute before XML-escaping: resolve root-relative `href`/`src`/`srcset`/`poster` in the extracted `<main>` markup against `base.origin + base.pathPrefix` — the identical origin-prepending §11.3 already performs for the elements crawlers require to be absolute — so "left exactly as they were emitted" governs the page and absolutization governs the syndicated copy.

## [blocking] 19. `unify audit --external` reports "could not reach the network" (exit 2) instead of `external-unreachable` whenever every off-origin URL happens to fail at the connection level — including the single-dead-link case the flag exists for
**where:** src/core/external.js:317

**evidence:**
```
Fixture A — one off-origin link, to a closed port:
$ cat src/index.html   # <a href="http://127.0.0.1:9/closed">the one dead link</a>
$ bun /home/user/unify/src/cli.js audit -s src --external
unify audit --external could not reach the network
  fix: check connectivity, or drop --external to audit offline
exit=2      (stdout empty — no finding, no `audit:` count line)

Fixture A plus one reachable link (local test server on 127.0.0.1:8791):
$ bun /home/user/unify/src/cli.js audit -s src --external
index.html: incomplete: "http://127.0.0.1:9/closed" failed: Unable to connect. Is the computer able to access the url? (ConnectionRefused) [external-unreachable]
  fix: confirm the URL is correct, or remove the reference — the failure may be on the other server rather than this one, not in this site's output
audit: 0 broken, 1 incomplete
exit=0

The same collapse fires on URLs no request was ever made for. Fixture B — one `ftp://` link alone: `unify audit --external could not reach the network`, exit=2; with a live link beside it: `index.html: incomplete: "ftp://ftp.example.org/pub/file.txt" failed: protocol must be http:, https: or s3: (ERR_INVALID_ARG_VALUE) [external-unreachable]` — unify declined to fetch it, then reported the author's link as unreachable.
```

**why:** §31.3's table specifies `external-unreachable` for "the request failed, timed out, or answered 4xx/5xx; one finding per distinct URL", and scopes the escape hatch to "a run that cannot reach the network **at all**". One refused connection is not evidence the network is down, and the module's own comment claims the collapse means only "nothing this run tried could even open a socket" — indistinguishable from one dead host when there is one URL. It also fights §24.6: a CI gate reads exit 2 as invalid usage, so the flag's headline case ("this link is dead") is unreportable, and a fetch the runtime refused outright is classified as a network condition rather than skipped.

**fix:** Require corroboration before collapsing: treat the run as network-unreachable only when more than one **distinct host** was probed and every one failed with `reason === "connection"` — a single-host run can then never satisfy it, so one dead host always reports its finding. Separately, skip non-`http(s)` schemes in `isOffOrigin`/`collectExternalReferences` rather than handing them to `fetch`, so a runtime refusal never reaches `reason` at all.

## [nonblocking] 20. A generated feed with zero entries omits `atom:updated`, which RFC 4287 requires on every feed
**where:** src/core/feed.js:381

**evidence:**
```
Fixture: `src/index.html` plus `src/dated.html` declaring `<meta name="schema" content="Article">` with `article:published_time` of `2026-01-02` (a day, so A17 excludes it).

$ bun /home/user/unify/src/cli.js build -s src -o dist --base-url https://example.com/
src/dated.html: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write <meta property="article:published_time" content="2026-01-02T09:00:00Z"> — a feed entry's timestamp needs a time and a time zone
exit=0
$ cat dist/feed.xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/</id>
  <title>Home</title>
  <link rel="self" href="https://example.com/feed.xml"/>
  <link rel="alternate" href="https://example.com/"/>
</feed>

The site publishes (exit 0) and the document carries no `<updated>` element at all.
```

**why:** §29.2 commits the document to Atom, and RFC 4287 §4.1.1 makes exactly one `atom:updated` mandatory on `atom:feed`. §29.5 defines the feed's `<updated>` as "the newest entry's `<updated>`", which presupposes an entry, while §29.1 activates on a page merely *declaring* Article/BlogPosting — so the entry-less feed is reachable and §29 specifies no value for it. §20.10 and product-spec §6.1 rightly forbid inventing one, so the section is incomplete rather than the code being wrong; the emitted artifact is nonetheless invalid against the standard §29.2 chose.

**fix:** A spec decision in §29, with the matching rules.tsv FEED-01/FEED-04 update: either say the feed is not written when the entry set is empty — activation becomes "at least one page is an **entry**" rather than "declares the type", which invents nothing and costs nothing real — or state explicitly what `<updated>` holds with no entries.

## [nonblocking] 21. The one template that teaches feeds ships the date shape §29.3 excludes from a feed; its two A17 advisories are hidden only by the template's own authored `feed.xml`
**where:** src/templates/blog.js:83-84 (`HELLO_DATE = "2026-01-15"`, `SECOND_DATE = "2026-02-03"`)

**evidence:**
```
$ unify init blog && rm src/feed.xml
$ bun /home/user/unify/src/cli.js build --dry-run --strict --base-url https://example.com/
src/posts/hello-world.md: advisory: date is "2026-01-15", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-15T09:00:00Z — a feed entry's timestamp needs a time and a time zone
src/posts/second-post.md: advisory: date is "2026-02-03", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-02-03T09:00:00Z — a feed entry's timestamp needs a time and a time zone
exit=1

The shipped scaffold is unaffected: with the authored `feed.xml` present, all five templates pass both §19.3 guarantees (`build --dry-run --strict` and `audit --strict` exit 0 for default/basic/blog/docs/portfolio, and again with `--base-url https://example.com/ --canonical auto`), because suppression runs before `reportDateOnlyEntries` (src/core/feed.js:419-424). The dry-run row shows the mechanism: `copy dist/feed.xml (/feed.xml) ← feed.xml`.
```

**why:** §19.2 item 6 requires a template declaring `Article`/`BlogPosting` to ship "an authored, well-formed `date`", and §29.3 now imposes a stricter standard — a date with no time is not a feed entry. `blog.js`'s own scaffolded prose offers both `2026-01-15` and `2026-01-15T09:30:00Z` as acceptable, so the template teaches the shape §29.3 rejects, and only its generator's `feed.xml` keeps the scaffold silent. §19.1's framing ("a scaffold is not a demo — it is the reference site") is what makes this worth closing rather than leaving latent.

**fix:** Give `HELLO_DATE`/`SECOND_DATE` a time and a zone (`2026-01-15T09:30:00Z`, `2026-02-03T14:00:00Z`) and update the two prose references that quote them, so the template that teaches feeds teaches a date that is one.

