/**
 * import-docs.mjs — bring a folder of Markdown documentation into a unify
 * build, unchanged where it already follows unify's conventions.
 *
 * The case it exists for: a repository keeps its documentation in `docs/`,
 * written for reading on GitHub, and a site publishes that folder as it is,
 * at every build, so the site cannot drift from the documents. It is a
 * library for a generator (unify's `generate:`): the site's own script calls
 * it with the overlay directory unify hands every generator, and unify builds
 * what it writes as if it were part of the source tree.
 *
 *   // scripts/gen.mjs, named by `generate: scripts/gen.mjs` in unify.yaml
 *   import { importDocs } from "unify-docs-template/scripts/import-docs.mjs";
 *   const [, , , overlay] = process.argv;
 *   importDocs({
 *     from: new URL("../docs/", import.meta.url),
 *     into: overlay,
 *     github: "https://github.com/you/project/blob/main/docs",
 *   });
 *
 * What it does to each document, and nothing else:
 *
 * - **It is copied** to `<base>/<its path>` in the site (`docs/` unless
 *   `base` says otherwise), and every other file in the folder (an image, a
 *   diagram) is copied beside it.
 * - **A missing title or description is filled in** from the document itself
 *   (its first heading; its first paragraph, cut to one sentence) and written
 *   as frontmatter, and a document with no `# heading` gets one from the title.
 *   An authored `title:` or `description:` is never replaced: frontmatter in
 *   the source is the convention, and this is the fallback for documents that
 *   do not carry it yet.
 * - **A link that leaves the folder** (`../src/cli.js`, `../README.md`) is
 *   sent to the same file on GitHub, because the site does not publish it. A
 *   link to another document in the folder is left as written: unify resolves
 *   `guide.md` to the page it publishes (spec §11.1b) and `#setup-1` to the
 *   heading GitHub would (§10.4). A link to a folder becomes a link to its
 *   README.md or index.md, which is what GitHub shows for it. Code is never
 *   touched: a link inside a fence or a code span is an example, not a link.
 * - A link naming a document that does not exist is left as written, so
 *   unify's reference check reports it at build time instead of a reader
 *   finding it later.
 *
 * Two hooks cover what a site decides for itself: `rename(path)` moves a
 * document within the site (links to it follow), and `transform(path, text)`
 * patches a document's text before anything else happens. Both take the
 * document's path inside the folder.
 *
 * Only `node:` built-ins, so it runs under Node and Bun alike, as unify does.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {object} ImportedPage
 * @property {string} source - the document's path inside the folder
 * @property {string} path - its path in the site, e.g. "docs/guide/start.md"
 * @property {string} title
 * @property {string} description
 */

/**
 * @param {object} options
 * @param {string|URL} options.from - the documentation folder
 * @param {string} options.into - the directory to write into: the generator's overlay (argv[3])
 * @param {string} [options.base] - where the folder lands in the site; "docs" unless set, "" for the site root
 * @param {string} options.github - the folder's address on GitHub (https://github.com/owner/repo/blob/main/docs), where a link leaving it is sent
 * @param {(path: string) => string} [options.rename] - a document's path in the site, given its path in the folder
 * @param {(path: string, text: string) => string} [options.transform] - patch a document's text before import
 * @returns {ImportedPage[]} every document imported, in path order
 */
export function importDocs({ from, into, base = "docs", github, rename = (p) => p, transform = (_p, text) => text }) {
  const root = from instanceof URL ? fileURLToPath(from) : from;
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`import-docs: no documentation folder at ${root}`);
  }
  const files = walk(root);
  const known = new Set(files);
  const githubDir = `${github.replace(/\/+$/, "")}/`;
  const sitePath = (rel) => (base ? `${base}/${rename(rel)}` : rename(rel));

  /** The URL a link should carry in the site, or null to leave it as written. */
  function relink(url, docRel) {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) {
      // An absolute link to a document in this folder on GitHub is a link to its page here.
      if (!url.startsWith(githubDir)) return null;
      const [inside, suffix] = splitSuffix(url.slice(githubDir.length));
      const doc = documentAt(decodeURIComponent(inside));
      return doc === null ? null : `/${sitePath(doc)}${suffix}`;
    }
    const [path, suffix] = splitSuffix(url);
    if (path === "") return null;
    const resolved = posix.normalize(posix.join(posix.dirname(docRel), decodeURIComponent(path)));
    if (resolved === ".." || resolved.startsWith("../")) return new URL(`${path}${suffix}`, new URL(posix.dirname(docRel) + "/", githubDir)).href;
    const doc = documentAt(resolved);
    if (doc === null) return null; // unify's reference check reports it
    const target = sitePath(doc);
    // Unchanged unless the target moved or the link named a folder.
    if (doc === resolved && target === (base ? `${base}/${resolved}` : resolved)) return null;
    return `/${target}${suffix}`;
  }

  /** The file a resolved path names: itself, or a folder's README.md / index.md. */
  function documentAt(path) {
    const clean = path.replace(/\/+$/, "");
    if (known.has(clean)) return clean;
    for (const index of ["README.md", "index.md"]) {
      const candidate = clean === "." || clean === "" ? index : `${clean}/${index}`;
      if (known.has(candidate)) return candidate;
    }
    return null;
  }

  const pages = [];
  for (const rel of files) {
    const out = join(into, ...sitePath(rel).split("/"));
    mkdirSync(dirname(out), { recursive: true });
    if (!rel.toLowerCase().endsWith(".md")) {
      cpSync(join(root, ...rel.split("/")), out);
      continue;
    }
    const text = transform(rel, readFileSync(join(root, ...rel.split("/")), "utf8"));
    const { front, body } = splitFrontmatter(text);
    const linked = mapProse(body, (line) => relinkLine(line, (url) => relink(url, rel)));
    const title = scalar(front, "title") ?? firstHeading(linked) ?? posix.basename(rel, ".md").replaceAll("-", " ");
    const description = scalar(front, "description") ?? firstSentence(linked) ?? `${title}.`;
    const added = [
      scalar(front, "title") === null ? `title: ${quote(title)}` : null,
      scalar(front, "description") === null ? `description: ${quote(description)}` : null,
    ].filter(Boolean);
    const frontmatter = front === null && added.length === 0 ? "" : `---\n${[front, ...added].filter((l) => l !== null && l !== "").join("\n")}\n---\n`;
    const heading = hasH1(linked) ? "" : `# ${title}\n\n`;
    writeFileSync(out, `${frontmatter}${heading}${linked.replace(/^\s*\n/, "")}`);
    pages.push({ source: rel, path: sitePath(rel), title, description });
  }
  return pages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ------------------------------------------------------------------ helpers

/** Every file under `dir`, `/`-separated and relative to it, skipping dot-files and dot-folders. */
function walk(dir, top = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, top));
    else if (entry.isFile()) out.push(relative(top, abs).split(sep).join("/"));
  }
  return out.sort();
}

/** "a/b.md#x" → ["a/b.md", "#x"]; the query or fragment, if any, kept whole. */
function splitSuffix(url) {
  const at = url.search(/[?#]/);
  return at === -1 ? [url, ""] : [url.slice(0, at), url.slice(at)];
}

/** Leading YAML frontmatter, as its lines' text (null when there is none), and the rest. */
function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? { front: m[1], body: text.slice(m[0].length) } : { front: null, body: text };
}

/** A top-level `key: value` from frontmatter text, unquoted; null when absent or empty. */
function scalar(front, key) {
  if (front === null) return null;
  const m = front.match(new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, "m"));
  if (!m || m[1] === "") return null;
  const q = m[1].match(/^(["'])(.*)\1$/);
  return q ? q[2] : m[1];
}

/** A YAML double-quoted scalar. */
function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Apply `fn` to every line of prose: lines inside a fenced code block pass
 * through untouched, and so do code spans within a line.
 */
function mapProse(text, fn) {
  let fence = null;
  return text.split("\n").map((line) => {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence !== null) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return line;
    }
    if (open) {
      fence = open[1];
      return line;
    }
    return line.split(/(`+[^`]*`+)/).map((part, i) => (i % 2 === 1 ? part : fn(part))).join("");
  }).join("\n");
}

/** Rewrite the URL of every inline link `](url "title")` and reference definition `[x]: url` on a line. */
function relinkLine(line, relink) {
  return line
    .replace(/(\]\()(<?)([^)\s>]+)(>?)((?:\s+"[^"]*")?\))/g, (whole, open, lt, url, gt, close) => {
      const next = relink(url);
      return next === null ? whole : `${open}${lt}${next}${gt}${close}`;
    })
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/, (whole, lead, url) => {
      const next = relink(url);
      return next === null ? whole : `${lead}${next}`;
    });
}

/** Prose lines only: what is left once fenced code blocks are removed. */
function proseLines(text) {
  const lines = [];
  let fence = null;
  for (const line of text.split("\n")) {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence !== null) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function hasH1(text) {
  return proseLines(text).some((line) => /^#\s+\S/.test(line));
}

/** The first `# heading` (else the first heading of any level), as plain text. */
function firstHeading(text) {
  const lines = proseLines(text);
  const h = lines.find((l) => /^#\s+\S/.test(l)) ?? lines.find((l) => /^#{2,6}\s+\S/.test(l));
  return h ? plain(h.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")) : null;
}

/** The first sentence of the first paragraph of prose, at most 240 characters. */
function firstSentence(text) {
  const paragraphs = proseLines(text).join("\n").split(/\n\s*\n/).map((p) => p.trim());
  const para = paragraphs.find((p) => p && !/^(#|\||<|>|[-*+]\s|\d+\.\s|!\[|---|===)/.test(p));
  if (!para) return null;
  const flat = plain(para);
  const sentence = flat.split(/(?<=[.!?])\s/)[0];
  return sentence.length > 240 ? `${sentence.slice(0, 237).trimEnd()}…` : sentence;
}

/** Markdown inline syntax reduced to its text. */
function plain(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
