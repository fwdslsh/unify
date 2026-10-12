/**
 * The docs template's navigation helper (templates/docs/scripts/docs-nav.mjs):
 * one ordered list of groups becomes the sidebar, the section index and
 * previous/next links on every page. Tier 3, scaffolding — no conformance
 * authority; what it promises is in its own header comment, and each promise
 * is a test here. The last tests run it the way a site does, as a generator
 * under the real CLI, and build unify's own documentation site, whose
 * generator is its first user.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { docsNav } from "../../templates/docs/scripts/docs-nav.mjs";
import { importDocs } from "../../templates/docs/scripts/import-docs.mjs";
import { runCli } from "../conformance/support.mjs";

const SCRIPTS = join(import.meta.dir, "..", "..", "templates", "docs", "scripts");
const GITHUB = "https://github.com/acme/tool/blob/main/docs";

const made = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "unify-docs-nav-"));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
/** Import a folder, then lay the navigation over it. */
function run(files, groups, options = {}) {
  const from = tree(files);
  const into = tree({});
  const pages = importDocs({ from, into, github: GITHUB, base: options.base });
  const resolved = docsNav({ pages, groups, into, ...options });
  const read = (rel) => readFileSync(join(into, rel), "utf8");
  return { resolved, read, into };
}
const doc = (title, description) => `---\ntitle: ${title}\ndescription: ${description}\n---\n# ${title}\n\nBody of ${title}.\n`;

/** The previous/next links at the foot of a page: {prev, next} as [href, text], or null when it has none. */
function pagerOf(text) {
  const nav = text.match(/<nav class="pager" aria-label="Previous and next pages">([\s\S]*?)<\/nav>/);
  if (!nav) return null;
  const links = Object.fromEntries(
    [...nav[1].matchAll(/<a href="([^"]*)" class="pager-(prev|next)" rel="(?:prev|next)"><span>(?:Previous|Next)<\/span> ([^<]*)<\/a>/g)].map(([, href, rel, label]) => [rel, [href, label]]),
  );
  return links;
}

const DOCS = {
  "start.md": doc("Start", "Begin here."),
  "install.md": doc("Install", "Put it on a machine."),
  "guides/deploy.md": doc("Deploy", "Publish it."),
  "guides/themes.md": doc("Themes", "Change the look."),
  "reference/cli.md": doc("CLI reference", "Every command."),
  "changelog.md": doc("Changelog", "What changed."),
  "about.md": doc("About", "Who and why."),
};
// Two documents (about, changelog) are left unlisted; "Look" is a group of one.
const GROUPS = [
  { label: "Guides", docs: [["start.md", "Getting started"], ["install.md", "Installing"], ["guides/deploy.md", "Deploying"]] },
  { label: "Look", docs: [["guides/themes.md", "Theming"]] },
  { label: "Reference", docs: [["reference/cli.md"]] },
];

describe("docsNav", () => {
  test("previous/next follow the reading order across groups: one link at the first and last page, two between, a one-page group and nested paths included", () => {
    const { read } = run(DOCS, GROUPS);
    const at = (path) => pagerOf(read(path));
    expect(at("docs/start.md")).toEqual({ next: ["/docs/install.md", "Installing"] });
    expect(at("docs/install.md")).toEqual({ prev: ["/docs/start.md", "Getting started"], next: ["/docs/guides/deploy.md", "Deploying"] });
    // The group boundary: Deploying is the last of Guides, Theming the only one of Look.
    expect(at("docs/guides/deploy.md")).toEqual({ prev: ["/docs/install.md", "Installing"], next: ["/docs/guides/themes.md", "Theming"] });
    expect(at("docs/guides/themes.md")).toEqual({ prev: ["/docs/guides/deploy.md", "Deploying"], next: ["/docs/reference/cli.md", "CLI reference"] });
    // No label given: the title is the link text; the unlisted pages follow, in path order, by title.
    expect(at("docs/reference/cli.md")).toEqual({ prev: ["/docs/guides/themes.md", "Theming"], next: ["/docs/about.md", "About"] });
    expect(at("docs/about.md")).toEqual({ prev: ["/docs/reference/cli.md", "CLI reference"], next: ["/docs/changelog.md", "Changelog"] });
    expect(at("docs/changelog.md")).toEqual({ prev: ["/docs/about.md", "About"] });
  });

  test("the pager ends the page's Markdown as an HTML block after the document's own text, and the document is otherwise unchanged", () => {
    const { read } = run({ "a.md": "# A\n\nFirst.\n\n\n", "b.md": "# B\n\nSecond.\n" }, [{ label: "G", docs: [["a.md"], ["b.md"]] }]);
    expect(read("docs/a.md")).toBe(
      '---\ntitle: "A"\ndescription: "First."\n---\n# A\n\nFirst.\n\n' +
      '<nav class="pager" aria-label="Previous and next pages">\n  <a href="/docs/b.md" class="pager-next" rel="next"><span>Next</span> B</a>\n</nav>\n',
    );
  });

  test("the sidebar is one list per group in order, the unlisted documents under More, then a link to the index", () => {
    const { read } = run(DOCS, GROUPS);
    const item = (path, label) => `      <li><a href="/docs/${path}">${label}</a></li>`;
    expect(read("_includes/docnav.html")).toBe([
      '<nav class="docnav" id="docnav" aria-label="Documentation">',
      '  <div>', '    <p class="docnav-label">Guides</p>', '    <ul>',
      item("start.md", "Getting started"), item("install.md", "Installing"), item("guides/deploy.md", "Deploying"),
      '    </ul>', '  </div>',
      '  <div>', '    <p class="docnav-label">Look</p>', '    <ul>', item("guides/themes.md", "Theming"), '    </ul>', '  </div>',
      '  <div>', '    <p class="docnav-label">Reference</p>', '    <ul>', item("reference/cli.md", "CLI reference"), '    </ul>', '  </div>',
      '  <div>', '    <p class="docnav-label">More</p>', '    <ul>', item("about.md", "About"), item("changelog.md", "Changelog"), '    </ul>', '  </div>',
      '  <p class="docnav-all"><a href="/docs/index.md">All documentation →</a></p>',
      '</nav>',
      '',
    ].join("\n"));
  });

  test("the index lists every document grouped, with its full title and description; index sets its text and base moves it", () => {
    const { read, resolved } = run(DOCS, GROUPS);
    expect(resolved.map((g) => g.label)).toEqual(["Guides", "Look", "Reference", "More"]);
    expect(read("docs/index.md")).toBe([
      '---', 'title: "All documentation"', 'description: "Every document, in reading order."', '---', '',
      '# All documentation', '',
      '## Guides', '',
      '- **[Start](/docs/start.md)**: Begin here.',
      '- **[Install](/docs/install.md)**: Put it on a machine.',
      '- **[Deploy](/docs/guides/deploy.md)**: Publish it.', '',
      '## Look', '', '- **[Themes](/docs/guides/themes.md)**: Change the look.', '',
      '## Reference', '', '- **[CLI reference](/docs/reference/cli.md)**: Every command.', '',
      '## More', '', '- **[About](/docs/about.md)**: Who and why.', '- **[Changelog](/docs/changelog.md)**: What changed.', '',
    ].join("\n"));

    const moved = run({ "a.md": doc("A", "First.") }, [{ label: "G", docs: [["a.md"]] }], {
      base: "manual",
      index: { title: "The manual", description: "All of it.", intro: "Read `a` first." },
    });
    expect(moved.read("manual/index.md")).toBe(
      '---\ntitle: "The manual"\ndescription: "All of it."\n---\n\n# The manual\n\nRead `a` first.\n\n## G\n\n- **[A](/manual/a.md)**: First.\n',
    );
    expect(moved.read("_includes/docnav.html")).toContain('<a href="/manual/index.md">The manual →</a>');
  });

  test("unlisted documents go last, after the listed ones, in a trailing More group labelled by their titles", () => {
    const { resolved, read } = run(DOCS, [{ label: "Guides", docs: [["start.md"]] }]);
    expect(resolved.map((g) => g.label)).toEqual(["Guides", "More"]);
    expect(resolved[1].entries.map((e) => [e.source, e.label])).toEqual([
      ["about.md", "About"], ["changelog.md", "Changelog"], ["guides/deploy.md", "Deploy"],
      ["guides/themes.md", "Themes"], ["install.md", "Install"], ["reference/cli.md", "CLI reference"],
    ]);
    expect(pagerOf(read("docs/start.md"))).toEqual({ next: ["/docs/about.md", "About"] });
  });

  test("with every document listed there is no More group", () => {
    const { resolved } = run({ "a.md": doc("A", "x"), "b.md": doc("B", "y") }, [{ label: "G", docs: [["b.md"], ["a.md"]] }]);
    expect(resolved.map((g) => g.label)).toEqual(["G"]);
    expect(resolved[0].entries.map((e) => e.source)).toEqual(["b.md", "a.md"]);
  });

  test("a lone document gets no previous/next, and the sidebar and index are still written", () => {
    const { read } = run({ "only.md": doc("Only", "The one.") }, [{ label: "G", docs: [["only.md"]] }]);
    expect(pagerOf(read("docs/only.md"))).toBeNull();
    expect(read("docs/only.md")).not.toContain("<nav");
    expect(read("_includes/docnav.html")).toContain('<a href="/docs/only.md">Only</a>');
    expect(read("docs/index.md")).toContain("- **[Only](/docs/only.md)**: The one.");
  });

  test("a listed source the importer did not produce throws, naming it and its group", () => {
    expect(() => run(DOCS, [{ label: "Guides", docs: [["start.md"], ["guides/deplyo.md", "Deploying"]] }])).toThrow(
      'docs-nav: "guides/deplyo.md" in group "Guides" is not a document the importer produced',
    );
    // The importer's own source is the folder's path: a renamed document is still listed by where it came from.
    const from = tree({ "a.md": doc("A", "x") });
    const into = tree({});
    const pages = importDocs({ from, into, github: GITHUB, rename: (p) => `moved/${p}` });
    docsNav({ pages, groups: [{ label: "G", docs: [["a.md"]] }], into });
    expect(() => docsNav({ pages, groups: [{ label: "G", docs: [["moved/a.md"]] }], into })).toThrow(/"moved\/a\.md" in group "G"/);
  });

  test("a source listed twice throws, naming it and both groups", () => {
    expect(() => run(DOCS, [{ label: "Guides", docs: [["start.md"], ["install.md"]] }, { label: "Again", docs: [["install.md"]] }])).toThrow(
      'docs-nav: "install.md" is listed twice, in group "Guides" and in group "Again"',
    );
    expect(() => run(DOCS, [{ label: "Guides", docs: [["start.md"], ["start.md"]] }])).toThrow(/"start\.md" is listed twice/);
  });

  test("a document that already publishes to the index's path throws instead of being overwritten", () => {
    expect(() => run({ "index.md": doc("Home", "x") }, [])).toThrow("docs-nav: a document already publishes to docs/index.md");
  });

  test("labels and titles are escaped: HTML in the sidebar and the links, Markdown in the index", () => {
    const { read } = run(
      {
        "qa.md": '---\ntitle: "Tools [beta] *new*"\ndescription: "Use <b> & `code`."\n---\n# Tools\n\nx\n',
        "next.md": doc("Next", "y"),
      },
      [{ label: "Q&A <live>", docs: [["qa.md", 'Q&A "quoted" <b>'], ["next.md"]] }],
    );
    expect(read("_includes/docnav.html")).toContain('<p class="docnav-label">Q&amp;A &lt;live&gt;</p>');
    expect(read("_includes/docnav.html")).toContain('<a href="/docs/qa.md">Q&amp;A &quot;quoted&quot; &lt;b&gt;</a>');
    expect(pagerOf(read("docs/next.md"))).toEqual({ prev: ["/docs/qa.md", 'Q&amp;A &quot;quoted&quot; &lt;b&gt;'] });
    expect(read("docs/index.md")).toContain("## Q\\&A \\<live\\>");
    expect(read("docs/index.md")).toContain("- **[Tools \\[beta\\] \\*new\\*](/docs/qa.md)**: Use \\<b\\> \\& \\`code\\`.");
  });

  test("a file name with a space or a parenthesis still makes a working link in the index", () => {
    const { read } = run({ "my guide (v2).md": doc("Guide", "x") }, [{ label: "G", docs: [["my guide (v2).md"]] }]);
    expect(read("docs/index.md")).toContain("- **[Guide](</docs/my guide (v2).md>)**: x");
  });
});

/** A project in the shape a site has: a docs folder, a layout that includes the sidebar, and a generator. */
function project({ groups = GROUPS, files = DOCS } = {}) {
  return tree({
    ...Object.fromEntries(Object.entries(files).map(([rel, text]) => [`docs/${rel}`, text])),
    "site/_layout.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· Tool</title></head><body><include src="/_includes/docnav.html"></include><main><slot></slot></main></body></html>\n',
    "site/index.html": '<!doctype html>\n<html><head><title>Home</title><meta name="description" content="The home page."></head><body><h1>Home</h1><a href="/docs/index.md">Docs</a></body></html>\n',
    "scripts/gen.mjs": [
      `import { importDocs } from ${JSON.stringify(join(SCRIPTS, "import-docs.mjs"))};`,
      `import { docsNav } from ${JSON.stringify(join(SCRIPTS, "docs-nav.mjs"))};`,
      `const pages = importDocs({ from: new URL("../docs/", import.meta.url), into: process.argv[3], github: ${JSON.stringify(GITHUB)} });`,
      `docsNav({ pages, into: process.argv[3], groups: ${JSON.stringify(groups)} });`,
      "",
    ].join("\n"),
    "unify.yaml": "generate: scripts/gen.mjs\n",
  });
}

describe("as a site's generator, under the real CLI", () => {
  test("under --pretty-urls --base-url the sidebar, the index and every previous/next link pass the reference check, strict, and build and audit clean", async () => {
    const dir = project({
      groups: [{ label: "Q&A <live>", docs: [["start.md", 'Q&A "quoted"'], ["install.md"], ["guides/deploy.md"]] }],
      files: { ...DOCS, "start.md": '---\ntitle: "Tools [beta] *new*"\ndescription: "Begin."\n---\n# Start\n\nBegin here.\n' },
    });
    const flags = ["--strict", "--pretty-urls", "--base-url", "https://example.com/sub/"];
    for (const args of [["build", ...flags], ["audit", ...flags]]) {
      const r = await runCli(args, dir);
      expect(r.exit, `${args.join(" ")}:\n${r.stdout}${r.stderr}`).toBe(0);
    }
    const page = (rel) => readFileSync(join(dir, "dist", ...rel.split("/"), "index.html"), "utf8");
    // The sidebar is in the layout, the pager in <main>, both rewritten to the site's directory-style, base-prefixed URLs.
    expect(page("docs/install")).toContain('<a href="/sub/docs/guides/deploy/">Deploy</a>');
    expect(pagerOf(page("docs/install"))).toEqual({ prev: ["/sub/docs/start/", "Q&amp;A &quot;quoted&quot;"], next: ["/sub/docs/guides/deploy/", "Deploy"] });
    expect(pagerOf(page("docs/start"))).toEqual({ next: ["/sub/docs/install/", "Install"] });
    expect(pagerOf(page("docs/guides/deploy"))).toEqual({ prev: ["/sub/docs/install/", "Install"], next: ["/sub/docs/about/", "About"] });
    expect(page("docs/install")).toMatch(/<main>[\s\S]*<nav class="pager"[\s\S]*<\/main>/);
    // The index renders titles and descriptions as the text they are, not as Markdown.
    const index = page("docs");
    expect(index).toContain("Tools [beta] *new*");
    expect(index).toContain("Q&amp;A &lt;live&gt;");
    expect(index).toContain('<a href="/sub/docs/start/">');
  });

  test("a listed document the folder does not have fails the build, naming it, and publishes nothing", async () => {
    const dir = project({ groups: [{ label: "Guides", docs: [["start.md"], ["guides/missing.md"]] }] });
    const r = await runCli(["build", "--pretty-urls"], dir);
    expect(r.exit).toBe(1);
    expect(r.stdout + r.stderr).toContain('"guides/missing.md" in group "Guides" is not a document the importer produced');
    expect(existsSync(join(dir, "dist"))).toBe(false);
  });

  test("unify's own documentation site builds with it: every page ends in previous/next links that follow the sidebar", async () => {
    const site = join(import.meta.dir, "..", "..", "examples", "unify-docs");
    const out = tree({});
    const r = await runCli(["build", "--strict", "-o", out], site);
    expect(r.exit, `${r.stdout}${r.stderr}`).toBe(0);
    const page = (rel) => readFileSync(join(out, ...rel.split("/"), "index.html"), "utf8");
    expect(pagerOf(page("docs/getting-started"))).toEqual({ next: ["/docs/templates/", "Templates"] });
    expect(pagerOf(page("docs/templates"))).toEqual({ prev: ["/docs/getting-started/", "Getting started"], next: ["/docs/authoring-rules/", "Authoring rules"] });
    expect(page("docs")).toContain("All documentation");
  });
});
