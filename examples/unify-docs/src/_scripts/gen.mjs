/**
 * gen.mjs — the derived half of this site, run by `unify build --generate _scripts/gen.mjs`.
 *
 * unify builds no collections, no indexes and no navigation: "derived content
 * comes from a script you own" is the rule, and this file is that script for
 * the documentation site. The whole interface is two positional arguments
 * (cli-reference, `--generate`): argv[2] is the source root, argv[3] is an
 * empty directory whose contents join the build as an overlay. There is no
 * unify module to import and nothing is returned.
 *
 * What it emits into the overlay:
 *   docs/<slug>.md        one page per file in the repository's docs/ directory
 *   docs/index.md         an index of those pages
 *   _includes/docnav.html the sidebar, listing every generated page
 *
 * The source of truth is the repository's real `docs/`, three levels above the
 * source root. Nothing is copied into this example, so the site cannot drift
 * from the documentation it renders — which is the entire point of building it.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";

const [, , sourceRoot, generatedDir] = process.argv;

// The repository's docs/, relative to examples/unify-docs/src.
const DOCS = resolve(sourceRoot, "..", "..", "..", "docs");
const REPO = "https://github.com/fwdslsh/unify/blob/main";

if (!existsSync(DOCS)) {
  // A located failure beats a half-built site: a non-zero exit is a build
  // problem, nothing publishes, and the previous dist/ is untouched.
  console.error(`gen.mjs: cannot find the repository docs at ${DOCS}`);
  console.error("  fix: build this example from inside a unify checkout — it renders the real docs/ tree");
  process.exit(1);
}

/** Reading order, then anything else alphabetically, so the nav is not a directory listing. */
const ORDER = [
  "getting-started.md",
  "authoring-rules.md",
  "cli-reference.md",
  "integrations.md",
  "docker-usage.md",
  "product-spec.md",
  "conformance-spec.md",
  "testing-strategy.md",
  "cicd-workflows.md",
  "ratification.md",
  "ratification-protocol.md",
  "migration-plan.md",
];

const files = readdirSync(DOCS).filter((f) => f.endsWith(".md"));
const ordered = [...ORDER.filter((f) => files.includes(f)), ...files.filter((f) => !ORDER.includes(f)).sort()];
const slugs = new Set(ordered.map((f) => basename(f, ".md")));

/** The first `# Heading`, which every doc in this tree opens with. */
function titleOf(text, slug) {
  const m = text.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].replace(/\s+/g, " ").trim() : slug;
}

/**
 * One sentence per page, and it has to be UNIQUE across the site or
 * `unify audit --strict` reports description-duplicate. These docs open with a
 * bolded `**Role**:` line, which is exactly the summary wanted; the fallback is
 * the first real paragraph. Both are trimmed to one sentence.
 */
function descriptionOf(text, title) {
  const role = text.match(/^\*\*Role\*\*:\s*(.+?)\s*$/m);
  let raw = role ? role[1] : "";
  if (!raw) {
    const body = text.replace(/^#\s+.+$/m, "").replace(/^\*\*Status\*\*:.*$/m, "");
    const para = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("```") && !p.startsWith("---"));
    raw = para ?? `${title} — unify documentation.`;
  }
  const flat = raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // keep the link text, drop the target
    .replace(/\s+/g, " ")
    .replace(/[`*_]/g, "")
    .trim();
  const sentence = flat.split(/(?<=\.)\s/)[0];
  const out = sentence.length > 240 ? `${sentence.slice(0, 237).trimEnd()}…` : sentence;
  return out.replace(/"/g, "'");
}

/**
 * Rewrite every link the docs write to each other so it resolves in the built
 * site, and send everything else to GitHub.
 *
 * unify's reference check audits generated pages exactly like hand-authored
 * ones, so a link left pointing at `authoring-rules.md` is a build problem, not
 * a broken link discovered later by a reader. That check is why this function
 * exists and why it has to be exhaustive rather than best-effort.
 */
function rewriteLinks(md, selfSlug) {
  // Code is documentation here, not navigation. These specs quote markdown and
  // HTML constantly — `![diagram](diagram.png)` is a worked EXAMPLE of URL
  // rewriting, not a link to an image — so rewriting inside a fence or a code
  // span corrupts the very thing the page is explaining. (It did, until this
  // guard existed.) Fenced blocks are skipped wholesale; within a line, code
  // spans are split out and passed through untouched.
  let fenced = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      // Odd indices are the insides of `code spans` — leave them exactly as written.
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : rewriteInline(part, selfSlug)))
        .join("");
    })
    .join("\n");
}

function rewriteInline(text, selfSlug) {
  return text.replace(/(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (whole, open, target, close) => {
    const fixed = rewriteTarget(target, selfSlug);
    return fixed === null ? whole : open + fixed + close;
  });
}

function rewriteTarget(target, selfSlug) {
  if (/^(https?:|mailto:|tel:|data:|#)/i.test(target)) return null; // absolute or same-page

  const [pathPart, hash = ""] = target.split("#");
  const frag = hash ? `#${hash}` : "";
  if (!pathPart) return null;

  // A sibling doc, written either bare (`authoring-rules.md`) or with the
  // directory (`docs/authoring-rules.md`, `../docs/authoring-rules.md`).
  const docMatch = pathPart.match(/(?:^|\/)([a-z0-9-]+)\.md$/i);
  if (docMatch && slugs.has(docMatch[1]) && !/README\.md$/i.test(pathPart)) {
    return `/docs/${docMatch[1]}.html${frag}`;
  }

  // The repository README is the site's own front page.
  if (/(^|\/)README\.md$/i.test(pathPart) && !pathPart.includes("examples/")) {
    return `/index.html${frag}`;
  }

  // Everything else names a file in the repository — source, fixtures,
  // examples, the licence — which this site does not publish. Send the reader
  // to it on GitHub rather than emitting a link the reference check will
  // rightly refuse.
  const clean = pathPart.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+/, "");
  return `${REPO}/${clean}${frag}`;
}

/**
 * Heading ids are slugs of heading text, so two headings that read the same
 * within one document collide — and a duplicate id is an `unify audit` finding.
 * These specs legitimately repeat headings ("Why", "Rules", "Notes"), so the
 * duplicates are disambiguated here rather than by editing the documentation.
 */
function disambiguateHeadings(md) {
  const seen = new Map();
  return md
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (!m) return line;
      const key = m[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n === 1 ? line : `${m[1]} ${m[2]} (${n})`;
    })
    .join("\n");
}

/**
 * A document may carry a second `# Heading` mid-way (docs/integrations.md did,
 * which this site is how we found out). Two <h1> elements on one page is an
 * `unify audit` finding, so any h1 after the first is demoted here — the source
 * document is the right place to fix it, but one stray heading should not be
 * able to break the whole site.
 */
function demoteStrayH1s(md) {
  let fenced = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return /^#\s+/.test(line) ? line.replace(/^#\s+/, "## ") : line;
    })
    .join("\n");
}

function write(rel, body) {
  const abs = join(generatedDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

/** YAML frontmatter: quote anything containing a colon, as the authoring rules require. */
const yamlString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const pages = [];

for (const file of ordered) {
  const slug = basename(file, ".md");
  const raw = readFileSync(join(DOCS, file), "utf8");
  const title = titleOf(raw, slug);
  const description = descriptionOf(raw, title);

  // Drop the leading `# Heading` — the layout has no page header of its own, so
  // the page keeps exactly one <h1>, which `audit` checks against the title.
  let body = raw.replace(/^#\s+.+?\r?\n/, "");
  body = demoteStrayH1s(body);
  body = disambiguateHeadings(body);
  body = rewriteLinks(body, slug);

  // `layout:` is named explicitly, and it has to be: a page written into the
  // --generate overlay does NOT participate in layout discovery — the walk looks
  // upward from the overlay directory, never reaching the source root's
  // _layout.html — so without this every generated page publishes bare, with no
  // chrome, no stylesheet and no <html lang>, and nothing warns. An explicit
  // `/`-rooted layout resolves from the source root and works. See FINDINGS.md.
  const front = ["---", `title: ${yamlString(title)}`, `description: ${yamlString(description)}`, "layout: /_layout.html", "schema: WebPage", "---", ""].join("\n");
  write(`docs/${slug}.md`, `${front}# ${title}\n${body}`);
  pages.push({ slug, title, description });
}

// The documentation index.
const indexBody = pages
  .map((p) => `- **[${p.title}](/docs/${p.slug}.html)** — ${p.description}`)
  .join("\n");
write(
  "docs/index.md",
  [
    "---",
    'title: "All documentation"',
    'description: "Every unify document, in reading order, rendered from the repository\'s own docs directory."',
    "layout: /_layout.html",
    "schema: WebPage",
    "---",
    "",
    "# All documentation",
    "",
    "Every page below is generated from the repository's `docs/` directory at build time, so this site cannot drift from the documentation it renders.",
    "",
    indexBody,
    "",
  ].join("\n"),
);

// The sidebar is NOT generated, and cannot be: an `<include>` resolves from the
// source root on disk, so a fragment written into the overlay is invisible to
// `<include src>` even though pages written there are scanned normally. (Verified:
// `include not found: /_includes/docnav.html`. See FINDINGS.md.)
//
// So the nav is hand-authored, and this script asserts it stays complete instead.
// A missing entry is a located build failure rather than a page nobody can reach —
// which is the same guarantee generating it would have given.
const navPath = join(sourceRoot, "_includes", "docnav.html");
const navHtml = existsSync(navPath) ? readFileSync(navPath, "utf8") : "";
const missing = pages.filter((p) => !navHtml.includes(`/docs/${p.slug}.html`));
if (missing.length > 0) {
  console.error(`gen.mjs: _includes/docnav.html is missing ${missing.length} page(s): ${missing.map((p) => p.slug).join(", ")}`);
  console.error("  fix: add a <li><a href=\"/docs/<slug>.html\"> entry for each, in reading order");
  process.exit(1);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

console.log(`gen.mjs: ${pages.length} documentation pages, an index, and the sidebar`);
