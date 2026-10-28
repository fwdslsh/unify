/** The guide's literal files, composed by the real CLI; no copied examples. */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const DOC = readFileSync(join(ROOT, "docs/guides/social-metadata.md"), "utf8");
const DEFAULTS = "Shared defaults";
const OVERRIDES = "Per-page overrides";
const GENERATED = "Reuse an HTML page's title and description (optional)";
const TEST_MS = 30_000;

function block(heading, language, nth = 0) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`missing guide section: ${heading}`);
  const end = DOC.indexOf("\n## ", start + 1);
  const section = DOC.slice(start, end < 0 ? DOC.length : end);
  const blocks = [...section.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))];
  if (!blocks[nth]) throw new Error(`missing ${language} block ${nth} in ${heading}`);
  return blocks[nth][1];
}

function command(heading) {
  const text = block(heading, "sh").trim();
  expect(text.startsWith("unify build ")).toBe(true);
  return text.slice("unify ".length).split(" ");
}

function project(files) {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": block(DEFAULTS, "html", 1),
    "_includes/social.html": block(DEFAULTS, "html"),
    // The CLI checks the reference, not image decoding.
    "assets/social.png": Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=", "base64"),
    ...files,
  });
  return tmp;
}

async function build(tmp, args) {
  const result = await runCli(args, tmp);
  if (result.exit !== 0) throw new Error(`recipe build exited ${result.exit}\n${result.stdout}\n${result.stderr}`);
}

function meta(html, attribute, key, value) {
  // Duplicates within a page survive head merge. Check both the value and
  // cardinality, so this recipe cannot silently depend on crawler first-wins.
  expect(html.match(new RegExp(`<meta ${attribute}="${key}"[^>]*>`, "gi"))).toHaveLength(1);
  expect(html).toContain(`<meta ${attribute}="${key}" content="${value}">`);
}

const read = (tmp, path) => readFileSync(join(tmp, "dist", path), "utf8");

test("social recipe — layout defaults and HTML/Markdown overrides need no generator", async () => {
  const tmp = project({
    "about.html": block(OVERRIDES, "html"),
    "start.md": block(OVERRIDES, "md"),
    "defaults.html": '<!doctype html><html><head><title>Defaults</title></head><body><h1>Defaults</h1></body></html>',
  });
  await build(tmp, command(OVERRIDES));
  const about = read(tmp, "about/index.html");
  expect(about).toContain("<title>About — Field Notes</title>");
  meta(about, "name", "description", "Meet the people behind the notes.");
  meta(about, "property", "og:title", "Meet the workshop");
  meta(about, "property", "og:description", "The people and ideas behind Field Notes.");
  meta(about, "name", "twitter:title", "Meet the workshop");
  meta(about, "name", "twitter:description", "The people and ideas behind Field Notes.");
  expect(about).toContain('href="https://example.com/notes/about/"');

  const markdown = read(tmp, "start/index.html");
  expect(markdown).toContain("<title>Start here — Field Notes</title>");
  meta(markdown, "name", "description", "Find your first workshop project.");
  meta(markdown, "property", "og:title", "Your next project starts here");
  meta(markdown, "property", "og:description", "Pick a project and follow along.");
  meta(markdown, "name", "twitter:title", "Your next project starts here");
  meta(markdown, "name", "twitter:description", "Pick a project and follow along.");

  const defaults = read(tmp, "defaults/index.html");
  meta(defaults, "property", "og:title", "Field Notes");
  meta(defaults, "property", "og:description", "Notes from the workshop.");
  for (const html of [about, markdown, defaults]) {
    meta(html, "property", "og:image", "https://example.com/notes/assets/social.png");
    meta(html, "name", "twitter:image", "https://example.com/notes/assets/social.png");
    meta(html, "name", "twitter:card", "summary_large_image");
    meta(html, "property", "og:site_name", "Field Notes");
  }
  expect(existsSync(join(tmp, "dist/_includes"))).toBe(false);
}, TEST_MS);

test("social recipe — optional generator reuses source values, escapes text, and preserves overrides in one build", async () => {
  const variants = [
    { args: ["build", "--generate", "../scripts/social.mjs", "--source-inventory"], file: "about.html", url: "/about.html" },
    { args: ["build", "--generate", "../scripts/social.mjs", "--source-inventory", "--pretty-urls"], file: "about/index.html", url: "/about/" },
    { args: command(GENERATED), file: "about/index.html", url: "https://example.com/notes/about/" },
  ];
  for (const variant of variants) {
    const tmp = project({ "about.html": block(GENERATED, "html") });
    writeTree(join(tmp, "scripts"), { "social.mjs": block(GENERATED, "js") });
    await build(tmp, variant.args);
    const html = read(tmp, variant.file);
    expect(html).toContain("<title>Café &amp; code — Field Notes</title>");
    meta(html, "property", "og:title", "A different title for sharing");
    meta(html, "name", "twitter:title", "Café &amp; code");
    for (const [attribute, key] of [["property", "og:description"], ["name", "twitter:description"]]) {
      meta(html, attribute, key, "A &quot;small&quot; guide to &lt;good&gt; coffee &amp; code.");
    }
    meta(html, "property", "og:url", variant.url);
    expect(html).not.toContain("<include");
    expect(existsSync(join(tmp, "dist/_social"))).toBe(false);
    expect(existsSync(join(tmp, "dist/scripts"))).toBe(false);
  }
}, TEST_MS);

test("social recipe — nested pages, direct case-insensitive overrides, and missing source fields keep their documented precedence", async () => {
  const tmp = project({
    "guides/coffee.html": block(GENERATED, "html")
      .replace("/_social/about.html", "/_social/guides/coffee.html")
      .replace('<include src=', '<meta property="OG:DESCRIPTION" content="Written for sharing.">\n  <meta name="twitter:title" content="A Twitter title.">\n  <meta name="twitter:description" content="A Twitter description.">\n  <include src='),
    "missing.html": '<!doctype html><html><head><include src="/_social/missing.html"></include></head><body><h1>Missing fields</h1></body></html>',
    "start.md": block(OVERRIDES, "md"),
  });
  writeTree(join(tmp, "scripts"), { "social.mjs": block(GENERATED, "js") });
  await build(tmp, command(GENERATED));
  const nested = read(tmp, "guides/coffee/index.html");
  meta(nested, "property", "og:title", "A different title for sharing");
  meta(nested, "property", "OG:DESCRIPTION", "Written for sharing.");
  meta(nested, "name", "twitter:title", "A Twitter title.");
  meta(nested, "name", "twitter:description", "A Twitter description.");
  meta(nested, "property", "og:url", "https://example.com/notes/guides/coffee/");
  const missing = read(tmp, "missing/index.html");
  meta(missing, "property", "og:title", "Field Notes");
  meta(missing, "property", "og:description", "Notes from the workshop.");
  meta(missing, "name", "twitter:title", "Field Notes");
  meta(missing, "name", "twitter:description", "Notes from the workshop.");
  meta(read(tmp, "start/index.html"), "property", "og:title", "Your next project starts here");
}, TEST_MS);
