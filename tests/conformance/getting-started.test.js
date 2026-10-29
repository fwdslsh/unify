/**
 * `getting-started.test.js` — the worked examples in `docs/getting-started.md`
 * that state what a build produces: the links table, the section of Markdown
 * pages, the slotted include, and the merged `<head>`.
 *
 * As in recipes.test.js, the literals are EXTRACTED FROM THE DOCUMENT
 * (`codeBlock()` reads a fenced block by its position in its section, and the
 * links table is parsed row by row), not retyped: a test that retyped them
 * would pass forever while the tutorial rotted beside it. Where a claim sits in
 * prose — the title and heading a page "ships" — the prose is matched and the
 * quoted markup is what the build must emit.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4); HTML is
 * compared through the one comparator (H5).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { compareHtml, diffSnapshots, snapshotTree } from "./compare.mjs";
import { ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const DOC = readFileSync(join(ROOT, "docs", "getting-started.md"), "utf8");

/** The named `## ` section's text, up to the next `## `. */
function section(heading) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`getting-started.md has no section "## ${heading}"`);
  const after = DOC.indexOf("\n## ", start + 1);
  return DOC.slice(start, after < 0 ? DOC.length : after);
}

/** The nth fenced block of the given language inside the named `## ` section, verbatim. */
function codeBlock(heading, lang, nth = 0) {
  const blocks = [...section(heading).matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
  if (!blocks[nth]) throw new Error(`getting-started.md "${heading}" has no ${lang} block #${nth} (found ${blocks.length})`);
  return blocks[nth];
}

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectSameHtml(expected, actual, what) {
  const diffs = compareHtml(expected, actual, what);
  if (diffs.length) throw new Error(`${diffs.join("\n")}\nexpected:\n${expected}\nactual:\n${actual}`);
}

const page = (title, body) =>
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>\n`;

/** A block whose first line is `<!-- site/<path> -->`: the path it names, and the file without that line. */
function namedFile(block) {
  const m = /^<!-- site\/(\S+) -->\n/.exec(block);
  if (!m) throw new Error(`expected the block to open with <!-- site/<path> -->:\n${block}`);
  return { path: m[1], text: block.slice(m[0].length) };
}

// ------------------------------------------------------------ links table

const LINKS = "Links and assets";
const MODES = [
  { label: "plain", args: [] },
  { label: "--pretty-urls", args: ["--pretty-urls"] },
  { label: "--pretty-urls --base-url", args: ["--pretty-urls", "--base-url", "https://example.com/sub/"] },
];

/** The table's rows, each `{source, written: string[], expect: (string|null)[]}` — null where it says the build fails. */
function linkRows() {
  const lines = section(LINKS).split("\n").filter((l) => l.startsWith("| `"));
  if (lines.length === 0) throw new Error("the links table is gone — update this test to what the section now shows");
  return lines.map((line) => {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5) throw new Error(`a links-table row must have five cells: ${line}`);
    const code = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const outcome = (cell) => {
      if (/^a broken link/.test(cell)) return null;
      const [href] = code(cell);
      if (!href) throw new Error(`a links-table cell names no href: ${cell}`);
      return href;
    };
    return { source: code(cells[0])[0], written: code(cells[1]), expect: cells.slice(2).map(outcome) };
  });
}

/** The source page a row names, as a file the build treats as a page. */
function sourceFile(source) {
  return source.endsWith(".md") ? "---\ndescription: A page.\n---\n# A page\n" : page("A page", "<h1>A page</h1>");
}

for (const row of linkRows()) {
  for (const written of row.written) {
    test(`links table — ${row.source}, written ${written}, in all three builds`, async () => {
      for (const [i, mode] of MODES.entries()) {
        const tmp = mkTmp();
        writeTree(join(tmp, "site"), {
          [row.source]: sourceFile(row.source),
          "index.html": page("Home", `<p><a href="${written}">link</a></p>`),
        });
        const r = await runCli(["build", "-o", "dist", ...mode.args], tmp);
        const want = row.expect[i];
        if (want === null) {
          expectExit(r, 1, `[${mode.label}] the table says ${written} is a broken link`);
          if (!r.stderr.includes(`${written} does not resolve`)) {
            throw new Error(`[${mode.label}] the error must name the link:\n${r.stderr}`);
          }
          continue;
        }
        expectExit(r, 0, `[${mode.label}] ${written} must build`);
        const out = readFileSync(join(tmp, "dist", "index.html"), "utf8");
        const href = /<a href="([^"]*)">link<\/a>/.exec(out)?.[1];
        if (href !== want) throw new Error(`[${mode.label}] ${written} → expected ${want}, got ${href}:\n${out}`);
      }
    }, TEST_MS);
  }
}

test("links table — where the pages land, and the root 404.html that never moves", async () => {
  // The paragraph under the table: dist/about.html and dist/guide.html plain,
  // dist/about/index.html and dist/guide/index.html pretty, 404.html in place.
  const prose = section(LINKS);
  for (const claim of ["`dist/about.html` and `dist/guide.html`", "`dist/about/index.html` and `dist/guide/index.html`", "`404.html`, which never moves"]) {
    if (!prose.includes(claim)) throw new Error(`the section no longer says ${claim} — update this test to what it says`);
  }
  const tree = {
    "about.html": sourceFile("about.html"),
    "guide.md": sourceFile("guide.md"),
    "404.html": sourceFile("404.html"),
    "index.html": page("Home", '<p><a href="about.html">a</a> <a href="guide.md">g</a></p>'),
  };
  const expected = {
    plain: ["about.html", "guide.html", "404.html"],
    "--pretty-urls": ["about/index.html", "guide/index.html", "404.html"],
  };
  for (const mode of MODES.slice(0, 2)) {
    const tmp = mkTmp();
    writeTree(join(tmp, "site"), tree);
    expectExit(await runCli(["build", "-o", "dist", ...mode.args], tmp), 0, mode.label);
    for (const file of expected[mode.label]) {
      if (!existsSync(join(tmp, "dist", file))) throw new Error(`[${mode.label}] expected dist/${file}`);
    }
  }
}, TEST_MS);

// ------------------------------------------------- a section of Markdown pages

const SECTION = "A section of Markdown pages";

test("a section of Markdown pages — the folder's layout wraps both pages, and the first heading is the title", async () => {
  const layout = codeBlock(SECTION, "html", 0);
  const first = codeBlock(SECTION, "markdown", 0);
  const shipped = /ships `(<title>[^`]+<\/title>)` with `(<h1[^`]+<\/h1>)`/.exec(section(SECTION));
  if (!shipped) throw new Error("the section no longer says what first.md ships — update this test to what it says");
  const [, title, h1] = shipped;

  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": page("— My Site", '<include src="/_includes/nav.html"></include>\n<main><slot></slot></main>'),
    "_includes/nav.html": '<nav><a href="/index.html">Home</a> <a href="/notes/first.md">Notes</a></nav>\n',
    "assets/style.css": "body { margin: 0; }\n",
    "index.html": page("Home", "<h1>Home</h1>"),
    "notes/_layout.html": layout,
    "notes/first.md": first,
    "notes/second.md": "---\ntitle: Second\n---\n# Second\n",
  });
  writeTree(join(tmp, "scripts"), {
    // Test scaffolding, not the guide's: hands the inventory back for the
    // `title: null` claim the section's last bullet makes.
    "keep.mjs": 'import { copyFileSync, readFileSync } from "node:fs";\n' +
      'const context = JSON.parse(readFileSync(process.argv[4], "utf8"));\n' +
      'copyFileSync(context.inputs.sourcePages, process.env.INVENTORY_OUT);\n',
  });
  const inventoryOut = join(tmp, "inventory.json");
  const r = await runCli(["build", "-o", "dist", "--generate", "../scripts/keep.mjs", "--dry-run"], tmp, { INVENTORY_OUT: inventoryOut });
  expectExit(r, 0, "the section's dry run");
  // "Neither Markdown file names a layout: the nearest _layout.html wraps both."
  for (const name of ["first", "second"]) {
    if (!r.stdout.includes(`write dist/notes/${name}.html (/notes/${name}.html) ← notes/${name}.md + notes/_layout.html`)) {
      throw new Error(`notes/${name}.md must compose with notes/_layout.html:\n${r.stdout}`);
    }
  }

  expectExit(await runCli(["build", "-o", "dist"], tmp), 0, "the section's build");
  const out = readFileSync(join(tmp, "dist", "notes", "first.html"), "utf8");
  if (!out.includes(title)) throw new Error(`first.md must ship ${title}:\n${out}`);
  const article = out.slice(out.indexOf("<article>"), out.indexOf("</article>"));
  if (!article.includes(h1)) throw new Error(`first.md's ${h1} must land inside the layout's <article>:\n${out}`);
  // "Frontmatter describes the page; it never writes its content."
  const body = out.slice(out.indexOf("<body"));
  if (body.includes("The first note.")) throw new Error(`the description must stay in the head:\n${out}`);
  if (!out.slice(0, out.indexOf("</head>")).includes('<meta name="description" content="The first note.">')) {
    throw new Error(`the description must become a <meta>:\n${out}`);
  }

  const record = JSON.parse(readFileSync(inventoryOut, "utf8")).pages.find((p) => p.source === "notes/first.md");
  if (!record || record.title !== null) throw new Error(`the inventory must report title: null for first.md: ${JSON.stringify(record)}`);
}, TEST_MS);

test("maintaining the tutorial site — add, rename, edit shared nav, diagnose and repair links without losing content", async () => {
  const tmp = mkTmp();
  const site = join(tmp, "site");
  const dist = join(tmp, "dist");
  const flags = ["--pretty-urls", "--base-url", "https://example.com/handbook/"];
  let nav = '<nav><a href="/index.html">Home</a> <a href="/notes/first.md">Notes</a></nav>\n';
  let second = '---\ndescription: The second note.\n---\n# Second steps\n\nKeep this second-note sentence.\n\n[First steps](/notes/first.md#first-steps)\n';
  writeTree(site, {
    "_layout.html": codeBlock("The layout", "html"),
    "_includes/nav.html": nav,
    "assets/style.css": "body { margin: 0; }\n",
    "index.html": page("Home", "<h1>Home</h1><p>Keep this home sentence.</p>"),
    "notes/_layout.html": codeBlock(SECTION, "html"),
    "notes/first.md": codeBlock(SECTION, "markdown"),
  });
  expectExit(await runCli(["build", "--strict", ...flags], tmp), 0, "the conventions-only seed");
  if (existsSync(join(tmp, "unify.yaml"))) throw new Error("the seed needed no configuration file");

  // Add a flat Markdown source; the section layout and pretty address follow
  // without a layout field, a nested index.md, or generated page wrappers.
  writeTree(site, { "notes/second.md": second });
  nav = nav.replace("</nav>", ' <a href="/notes/second.md">Latest note</a></nav>');
  writeTree(site, { "_includes/nav.html": nav });
  expectExit(await runCli(["build", "--strict", ...flags], tmp), 0, "add an article and edit one shared nav");
  const assertContent = (firstPath) => {
    const markers = {
      "index.html": "Keep this home sentence.",
      [firstPath]: "The lead paragraph, written here like the heading above it.",
      "notes/second/index.html": "Keep this second-note sentence.",
    };
    for (const [path, marker] of Object.entries(markers)) {
      const html = readFileSync(join(dist, path), "utf8");
      if (!html.includes(marker)) throw new Error(`${path} lost its content: ${marker}`);
      if (!html.includes('<a href="/handbook/notes/second/">Latest note</a>')) {
        throw new Error(`${path} did not receive the shared navigation edit:\n${html}`);
      }
    }
  };
  assertContent("notes/first/index.html");
  const added = readFileSync(join(dist, "notes/second/index.html"), "utf8");
  if (!added.includes("<title>Second steps — Notes — My Site</title>") || !added.includes('<body class="notes">')) {
    throw new Error(`the added article must use the section's title and chrome:\n${added}`);
  }
  expectSameHtml(
    '<main><article><h1 id="second-steps">Second steps</h1><p>Keep this second-note sentence.</p><p><a href="/handbook/notes/first/#first-steps">First steps</a></p></article></main>',
    /<main>[\s\S]*?<\/main>/.exec(added)?.[0] ?? "",
    "the added article's section wrapper and visible content",
  );
  const previous = snapshotTree(dist);

  renameSync(join(site, "notes/first.md"), join(site, "notes/welcome.md"));
  const broken = await runCli(["build", "--strict", ...flags], tmp);
  expectExit(broken, 1, "renaming a source does not repair authored references");
  if (!broken.stderr.includes("site/_includes/nav.html:1: problem:") || !broken.stderr.includes("/notes/first.md does not resolve")) {
    throw new Error(`the missing-file diagnostic must locate the stale reference:\n${broken.stderr}`);
  }
  const changes = diffSnapshots(previous, snapshotTree(dist));
  if (changes.length) throw new Error(`the failed rename published changes:\n${changes.join("\n")}`);
  nav = nav.replace("first.md", "welcome.md");
  second = second.replace("first.md", "welcome.md");
  writeTree(site, { "_includes/nav.html": nav, "notes/second.md": second });
  expectExit(await runCli(["build", "--strict", ...flags], tmp), 0, "repair the source references");
  assertContent("notes/welcome/index.html");
  if (existsSync(join(dist, "notes/first/index.html"))) throw new Error("the old route must leave the output after the rename");

  // A missing heading is a different check: the page exists, so build succeeds;
  // audit diagnoses the fragment. Keep the link and article when repairing it.
  writeTree(site, { "notes/second.md": second.replace("#first-steps)", "#missing-heading)") });
  expectExit(await runCli(["build", "--strict", ...flags], tmp), 0, "an existing page with a missing anchor builds");
  const audit = await runCli(["audit", ...flags], tmp);
  expectExit(audit, 1, "audit detects the missing anchor");
  if (!audit.stdout.includes("[fragment-missing]") || !audit.stdout.includes("missing-heading")) {
    throw new Error(`audit must name the missing anchor:\n${audit.stdout}`);
  }
  writeTree(site, { "notes/second.md": second });
  expectExit(await runCli(["audit", ...flags], tmp), 0, "the repaired link has no broken findings");
  expectExit(await runCli(["build", "--strict", ...flags], tmp), 0, "publish the repair");
  assertContent("notes/welcome/index.html");
  const repaired = readFileSync(join(dist, "notes/second/index.html"), "utf8");
  if (!repaired.includes('href="/handbook/notes/welcome/#first-steps"')) throw new Error("repair removed or changed the intended link");

  // Saving the working CLI options is a convenience, not another authoring
  // model. Compare every emitted byte, not merely the command's exit status.
  const cliOutput = snapshotTree(dist);
  expectExit(await runCli(["build", ...flags, "--save-config"], tmp), 0, "save the working settings");
  if (!existsSync(join(tmp, "unify.yaml"))) throw new Error("--save-config must persist the settings");
  expectExit(await runCli(["build", "--strict"], tmp), 0, "build with saved settings");
  const configChanges = diffSnapshots(cliOutput, snapshotTree(dist));
  if (configChanges.length) throw new Error(`saved settings changed the output:\n${configChanges.join("\n")}`);
  if (existsSync(join(dist, "unify.yaml"))) throw new Error("configuration must not publish");
}, TEST_MS);

// ------------------------------------------------------------ slotted include

const SNIPPET = "A snippet that ships as written";

test("a snippet that ships as written — the slotted include builds to the markup the guide prints", async () => {
  const fragment = namedFile(codeBlock(SNIPPET, "html", 2));
  const usage = codeBlock(SNIPPET, "html", 3).trim();
  const shown = codeBlock(SNIPPET, "html", 4).trim();
  if (!usage.startsWith(`<include src="/${fragment.path}">`)) {
    throw new Error(`the usage block must include the fragment the guide defines (${fragment.path}):\n${usage}`);
  }

  const tmp = mkTmp();
  writeTree(join(tmp, "site"), { [fragment.path]: fragment.text, "index.html": page("Home", usage) });
  expectExit(await runCli(["build", "-o", "dist"], tmp), 0, "the slotted include");
  expectSameHtml(page("Home", shown), readFileSync(join(tmp, "dist", "index.html"), "utf8"), "slotted include");
}, TEST_MS);

test("slotted includes in Markdown — authored markup fills slots; same-named frontmatter does not", async () => {
  const fragment = namedFile(codeBlock(SNIPPET, "html", 2));
  const usage = codeBlock(SNIPPET, "html", 3).trim();
  const shown = codeBlock(SNIPPET, "html", 4).trim();
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    [fragment.path]: fragment.text,
    "index.md": `---\ntitle: Metadata title\ndescription: Metadata description\n---\n\n${usage}\n\n<include src="/${fragment.path}"><p>Keep the default title.</p></include>\n`,
  });
  expectExit(await runCli(["build", "--strict"], tmp), 0, "Markdown with the guide's slotted include");
  const html = readFileSync(join(tmp, "dist/index.html"), "utf8");
  if (!html.includes("<title>Metadata title</title>") || !html.includes('<meta name="description" content="Metadata description">')) {
    throw new Error(`frontmatter must still supply the document head:\n${html}`);
  }
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1];
  expectSameHtml(`${shown}\n<aside class="callout"><h3>Note</h3><p>Keep the default title.</p></aside>`, body ?? "", "explicit fill and untouched fallback");
}, TEST_MS);

test("a snippet that ships as written — content in an include of a file that is not a fragment is a build error naming the fix", async () => {
  // "any other non-empty include is a build error naming the fix"
  const usage = codeBlock(SNIPPET, "html", 3).trim().replace(/src="[^"]+"/, 'src="/_includes/callout.html"');
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_includes/callout.html": namedFile(codeBlock(SNIPPET, "html", 2)).text,
    "index.html": page("Home", usage),
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 1, "a non-empty include of a non-fragment");
  if (!r.stderr.includes("fix: rename it _includes/callout.fragment.html, or empty the include")) {
    throw new Error(`the error must name the fix:\n${r.stderr}`);
  }
}, TEST_MS);

// ------------------------------------------------------------- the merged head

const HEAD = "What ends up in `<head>`";

function headProject(layoutHead) {
  const pageHead = codeBlock(HEAD, "html", 1).trim();
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), {
    "_layout.html": `<!doctype html>\n<html lang="en">\n${layoutHead}\n<body><main><slot></slot></main></body>\n</html>\n`,
    "about.html": `<!doctype html>\n<html lang="en">\n${pageHead}\n<body><h1>About</h1></body>\n</html>\n`,
    "assets/analytics.js": "// analytics\n",
    "assets/about.css": "h1 { color: teal; }\n",
  });
  return tmp;
}

const headOf = (html) => html.slice(html.indexOf("<head>"), html.indexOf("</head>") + "</head>".length);

test("what ends up in <head> — the layout and page heads merge to the head the guide prints", async () => {
  const tmp = headProject(codeBlock(HEAD, "html", 0).trim());
  expectExit(await runCli(["build", "-o", "dist"], tmp), 0, "the head example");
  const built = readFileSync(join(tmp, "dist", "about.html"), "utf8");
  expectSameHtml(codeBlock(HEAD, "html", 2).trim(), headOf(built), "merged head");
}, TEST_MS);

test("what ends up in <head> — with no layout <title>, the page's arrives after the layout's script", async () => {
  const layoutHead = codeBlock(HEAD, "html", 0).trim().split("\n").filter((l) => !l.includes("<title>")).join("\n");
  const tmp = headProject(layoutHead);
  expectExit(await runCli(["build", "-o", "dist"], tmp), 0, "the head example without a layout title");
  const head = headOf(readFileSync(join(tmp, "dist", "about.html"), "utf8"));
  const script = head.indexOf('<script src="/assets/analytics.js">');
  const title = head.indexOf("<title>About</title>");
  if (script < 0 || title < 0 || title < script) throw new Error(`the page's title must follow the layout's script:\n${head}`);
}, TEST_MS);

test("what ends up in <head> — under --base-url unify adds a canonical and never writes og:title, og:description or twitter:*", async () => {
  const tmp = headProject(codeBlock(HEAD, "html", 0).trim());
  expectExit(await runCli(["build", "-o", "dist", "--base-url", "https://example.com/"], tmp), 0, "the head example under --base-url");
  const head = headOf(readFileSync(join(tmp, "dist", "about.html"), "utf8"));
  if (!head.includes('<link rel="canonical" href="https://example.com/about.html">')) throw new Error(`expected a completed canonical:\n${head}`);
  if (head.includes('property="og:description"') || head.includes('name="twitter:')) throw new Error(`unify must not write social metadata:\n${head}`);
  if ((head.match(/property="og:title"/g) ?? []).length !== 1) throw new Error(`the page's own og:title, and only it:\n${head}`);
}, TEST_MS);
