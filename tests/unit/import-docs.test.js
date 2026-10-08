/**
 * The docs template's importer (templates/docs/scripts/import-docs.mjs): a
 * library a site's generator calls to publish a folder of Markdown. Tier 3,
 * scaffolding — no conformance authority; what it promises is in its own
 * header comment, and each promise is a test here. The last test runs it the
 * way a site does, as a generator under the real CLI.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { importDocs } from "../../templates/docs/scripts/import-docs.mjs";
import { runCli } from "../conformance/support.mjs";

const IMPORTER = join(import.meta.dir, "..", "..", "templates", "docs", "scripts", "import-docs.mjs");
const GITHUB = "https://github.com/acme/tool/blob/main/docs";

const made = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "unify-import-docs-"));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
function run(files, options = {}) {
  const from = tree(files);
  const into = tree({});
  const pages = importDocs({ from, into, github: GITHUB, ...options });
  const read = (rel) => readFileSync(join(into, rel), "utf8");
  return { pages, read, into };
}

describe("importDocs", () => {
  test("copies every document under docs/ and every other file beside it, and lists the documents", () => {
    const { pages, read, into } = run({
      "README.md": "# Tool\n\nThe tool.\n",
      "guides/start.md": "# Start\n\nFirst steps.\n",
      "guides/diagram.png": "PNG",
      ".hidden.md": "# no\n",
    });
    expect(pages.map((p) => p.path)).toEqual(["docs/README.md", "docs/guides/start.md"]);
    expect(read("docs/guides/diagram.png")).toBe("PNG");
    expect(existsSync(join(into, "docs", ".hidden.md"))).toBe(false);
  });

  test("fills a missing title and description from the document, never replaces authored ones, and adds an h1 only when there is none", () => {
    const { pages, read } = run({
      "plain.md": "# Plain heading\n\nThe first sentence. The second one.\n",
      "authored.md": "---\ntitle: Authored\ndescription: \"Written: by hand.\"\n---\n# Another heading\n\nBody text.\n",
      "headless.md": "Release notes for 1.0.\n\n- a change\n",
    });
    expect(read("docs/plain.md")).toBe('---\ntitle: "Plain heading"\ndescription: "The first sentence."\n---\n# Plain heading\n\nThe first sentence. The second one.\n');
    expect(read("docs/authored.md")).toBe('---\ntitle: Authored\ndescription: "Written: by hand."\n---\n# Another heading\n\nBody text.\n');
    expect(read("docs/headless.md")).toBe('---\ntitle: "headless"\ndescription: "Release notes for 1.0."\n---\n# headless\n\nRelease notes for 1.0.\n\n- a change\n');
    expect(pages.find((p) => p.source === "authored.md")).toMatchObject({ title: "Authored", description: "Written: by hand." });
  });

  test("sends a link leaving the folder to GitHub, leaves links inside it as written, and points a folder link at its README", () => {
    const { read } = run({
      "guides/start.md": [
        "# Start",
        "",
        "[source](../../src/cli.js) [readme](../../README.md#install) [sibling](other.md#setup-1)",
        "[home](../README.md) [guides](./) [gone](missing.md) [web](https://example.com/x) [top](#start)",
        "",
        "[ref]: ../../LICENSE",
        "",
        "```md",
        "[example](../../src/not-a-link.js)",
        "```",
        "",
        "Inline `[code](../../src/code.js)` stays.",
      ].join("\n"),
      "guides/other.md": "# Other\n\nx\n",
      "guides/README.md": "# Guides\n\nx\n",
      "README.md": "# Tool\n\nx\n",
    });
    const text = read("docs/guides/start.md");
    expect(text).toContain("[source](https://github.com/acme/tool/blob/main/src/cli.js)");
    expect(text).toContain("[readme](https://github.com/acme/tool/blob/main/README.md#install)");
    expect(text).toContain("[sibling](other.md#setup-1)");
    expect(text).toContain("[home](../README.md)");
    expect(text).toContain("[guides](/docs/guides/README.md)");
    expect(text).toContain("[gone](missing.md)");
    expect(text).toContain("[web](https://example.com/x)");
    expect(text).toContain("[top](#start)");
    expect(text).toContain("[ref]: https://github.com/acme/tool/blob/main/LICENSE");
    expect(text).toContain("[example](../../src/not-a-link.js)");
    expect(text).toContain("`[code](../../src/code.js)`");
  });

  test("a GitHub link to a document in the folder becomes a link to its page here", () => {
    const { read } = run({
      "a.md": `# A\n\nSee [b](${GITHUB}/guides/b.md#why) and [c](${GITHUB}/guides/c.md).\n`,
      "guides/b.md": "# B\n\nx\n",
    });
    expect(read("docs/a.md")).toContain("[b](/docs/guides/b.md#why) and [c](https://github.com/acme/tool/blob/main/docs/guides/c.md)");
  });

  test("rename moves a document and links to it follow; transform patches the text first", () => {
    const { pages, read, into } = run(
      {
        "architecture/design.md": "# Design\n\nInternals.\n",
        "guide.md": "# Guide\n\nRead [the design](architecture/design.md).\n",
      },
      {
        rename: (p) => (p.startsWith("architecture/") ? `maintainers/${p}` : p),
        transform: (p, text) => (p === "guide.md" ? text.replace("Read", "Then read") : text),
      },
    );
    expect(existsSync(join(into, "docs", "maintainers", "architecture", "design.md"))).toBe(true);
    expect(read("docs/guide.md")).toContain("Then read [the design](/docs/maintainers/architecture/design.md).");
    expect(pages.map((p) => p.path)).toContain("docs/maintainers/architecture/design.md");
  });

  test("a folder that does not exist is an error naming it", () => {
    expect(() => importDocs({ from: join(tmpdir(), "no-such-docs-folder"), into: tree({}), github: GITHUB })).toThrow(/no documentation folder at/);
  });
});

test("as a site's generator, under the real CLI: the imported docs build and audit clean, .md links and GitHub anchors included", async () => {
  const project = tree({
    "docs/README.md": "# Tool\n\nThe tool, documented. Start with [the guide](guides/start.md#setup-1).\n",
    "docs/guides/start.md": "# Start\n\nFirst steps, then the [readme](../README.md).\n\n## Setup\n\nOnce.\n\n## Setup\n\nTwice.\n",
    "site/_layout.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· Tool</title></head><body><main><slot></slot></main></body></html>\n',
    "site/index.html": '<!doctype html>\n<html><head><title>Home</title><meta name="description" content="The home page."></head><body><h1>Home</h1><a href="/docs/README.md">Docs</a></body></html>\n',
    "scripts/gen.mjs": `import { importDocs } from ${JSON.stringify(IMPORTER)};\nimportDocs({ from: new URL("../docs/", import.meta.url), into: process.argv[3], github: ${JSON.stringify(GITHUB)} });\n`,
    "unify.yaml": "generate: scripts/gen.mjs\n",
  });
  for (const args of [["build", "--strict", "--pretty-urls"], ["audit", "--strict", "--pretty-urls"]]) {
    const r = await runCli(args, project);
    expect(r.exit, `${args.join(" ")}:\n${r.stdout}${r.stderr}`).toBe(0);
  }
  const home = readFileSync(join(project, "dist", "docs", "README", "index.html"), "utf8");
  expect(home).toContain('href="/docs/guides/start/#setup-1"');
  const start = readFileSync(join(project, "dist", "docs", "guides", "start", "index.html"), "utf8");
  expect(start).toContain('id="setup-1"');
});
