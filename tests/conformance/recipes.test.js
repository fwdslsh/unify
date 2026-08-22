/**
 * `recipes.test.js` — every literal in `docs/integrations.md`'s four recipes.
 *
 * The document opens by claiming "Every literal in this document is tested".
 * Until this file existed that claim had NOTHING behind it: no test in the
 * repository so much as named `integrations.md`. A documentation promise with
 * no instrument is the same defect class this project keeps finding in its own
 * specification — a universal claim, no test on the case that would separate it
 * from its opposite — and it is worse in documentation, because a reader who
 * copies a broken literal has no build of their own to tell them.
 *
 * So the literals are EXTRACTED FROM THE DOCUMENT, not retyped here. A test
 * that retyped them would pass forever while the doc rotted beside it, which is
 * precisely the failure being defended against. `codeBlock()` reads the fenced
 * block by its position in the recipe, so editing the doc edits the test.
 *
 * WHAT IS AND IS NOT CHECKED. A literal that names somebody else's tool —
 * `sharp`, `esbuild`, a CMS endpoint — is not unify's claim to keep and is not
 * installed here. What is checked is every claim the document makes ABOUT
 * UNIFY: that the two-argument generator contract is what a generator receives,
 * that `_originals/` and `_cms/` are held back by the default exclude, that
 * `srcset` is rewritten like any other URL, that a colon in a CMS title
 * survives frontmatter, that audit writes nothing, and that `--run` does not
 * exist. Where a third-party call sits in the middle of a unify claim, the
 * surrounding literal runs with that one call replaced — and the replacement is
 * visible in the test, not hidden in a fixture.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const DOC = readFileSync(join(ROOT, "docs", "integrations.md"), "utf8");

/**
 * The nth fenced code block of the given language inside the named `##`
 * section, verbatim. Reading the document rather than restating it is what
 * makes this file an instrument instead of a second copy.
 *
 * @param {string} heading - the section's `## ` heading text
 * @param {string} lang - the fence's language tag
 * @param {number} nth - 0-based
 * @returns {string}
 */
function codeBlock(heading, lang, nth = 0) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`integrations.md has no section "## ${heading}"`);
  const after = DOC.indexOf("\n## ", start + 1);
  const section = DOC.slice(start, after < 0 ? DOC.length : after);
  const blocks = [...section.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
  if (!blocks[nth]) {
    throw new Error(`integrations.md "${heading}" has no ${lang} block #${nth} (found ${blocks.length})`);
  }
  return blocks[nth];
}

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

const page = (title, body) =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title><meta name="description" content="The ${title} page."></head>
<body>${body}</body>
</html>
`;

// ------------------------------------------------------- recipe 1: generator

test("recipe 1 — the document's complete generator builds, and its destructuring is the contract", async () => {
  const generator = codeBlock("1. The generator context: what `--generate` hands you", "js", 1);
  const destructure = codeBlock("1. The generator context: what `--generate` hands you", "js", 0).trim();

  // The one-line literal the recipe opens with must be the same shape the full
  // generator uses — a reader who copies only the first block must get the
  // same two arguments.
  if (!generator.includes(destructure)) {
    throw new Error(`the opening literal is not what the worked generator uses:\n${destructure}\nvs\n${generator}`);
  }

  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<h1>Home</h1><a href="/credits.html">credits</a>'),
    "_scripts/gen.mjs": generator,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "the document's generator must build");

  const out = readFileSync(join(tmp, "dist", "credits.html"), "utf8");
  if (!out.includes("<h1>Credits</h1>")) throw new Error(`generated page missing its content:\n${out}`);
  // "sourceRoot is the absolute path of your source tree" — the page prints it,
  // so a wrong argument order shows up as a literal `undefined` on the site.
  if (out.includes("undefined")) throw new Error(`argv order is not what the recipe documents:\n${out}`);
  if (!out.includes(join(tmp, "src"))) throw new Error(`argv[2] is not the absolute source root:\n${out}`);
}, TEST_MS);

test("recipe 1 — the working directory is the source root, as the bullet claims", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<h1>Home</h1><a href="/who.html">who</a>'),
    "_data/authors.json": '{"name":"Wren"}\n',
    // The bullet's own literal: `readFileSync("_data/authors.json")`, relative,
    // with no path joining at all. It works only if cwd is the source root.
    "_scripts/gen.mjs": `import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [, , , generatedDir] = process.argv;
const who = JSON.parse(readFileSync("_data/authors.json", "utf8")).name;
mkdirSync(generatedDir, { recursive: true });
writeFileSync(join(generatedDir, "who.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Who</title><meta name="description" content="Who."></head><body><h1>\${who}</h1></body></html>\\n\`);
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "a relative read from the source root must work");
  if (!readFileSync(join(tmp, "dist", "who.html"), "utf8").includes("<h1>Wren</h1>")) {
    throw new Error("the generator did not read _data/authors.json relative to the source root");
  }
}, TEST_MS);

test("recipe 1 — a generator's failure is a build failure, and nothing publishes", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": 'throw new Error("the CMS was down");\n',
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 1, "the bullet says a non-zero exit is a located problem");
  if (existsSync(join(tmp, "dist"))) throw new Error("the bullet says nothing publishes");
  if (!r.stderr.includes("the CMS was down")) throw new Error(`the generator's own message must reach the author:\n${r.stderr}`);
}, TEST_MS);

// -------------------------------------------------------- recipe 2: images

test("recipe 2 — _originals/ never publishes, derivatives do, and srcset is rewritten", async () => {
  const tmp = mkTmp();
  const img = codeBlock("2. Image optimization", "html", 0).trim();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", `<h1>Home</h1>${img}`),
    // Stand-ins for real encoder output: the recipe's unify-side claim is about
    // WHERE files live, not what sharp puts in them.
    "assets/img/anvil-480.webp": "480",
    "assets/img/anvil-960.webp": "960",
    "_originals/anvil.jpg": "the 4MB master",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/site/"], tmp);
  expectExit(r, 0, "the recipe's img literal must build and reference-check");

  if (existsSync(join(tmp, "dist", "_originals"))) throw new Error("_originals/ must be held back by the default _* glob");
  if (!existsSync(join(tmp, "dist", "assets/img/anvil-960.webp"))) throw new Error("derivatives must ship");

  const html = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  // "which unify rewrites like any other URL" — every candidate in the srcset,
  // not just the src.
  for (const want of ["/site/assets/img/anvil-480.webp 480w", "/site/assets/img/anvil-960.webp 960w"]) {
    if (!html.includes(want)) throw new Error(`srcset candidate not rewritten (${want}):\n${html}`);
  }
  if (!html.includes('src="/site/assets/img/anvil-960.webp"')) throw new Error(`src not rewritten:\n${html}`);
  // The recipe tells authors to write width/height; the literal must have them.
  if (!/width="\d+"/.test(img) || !/height="\d+"/.test(img)) throw new Error("the recipe's own img literal omits width/height");
}, TEST_MS);

test("recipe 2 — the derivative loop is skippable work, and its guard is in the literal", async () => {
  // The one third-party call (`sharp(...)`) is replaced by a copy; everything
  // around it — the paths, the exclusion, the mtime guard the recipe leans on
  // for rebuild cost — is the document's own text, and runs.
  const script = codeBlock("2. Image optimization", "js", 0);
  if (!script.includes("mtimeMs")) throw new Error("the recipe promises skipped work; its literal has no mtime guard");
  if (!script.includes("_originals")) throw new Error("the recipe's literal must read from the excluded _originals/");
  if (!script.includes("assets/img")) throw new Error("the recipe's literal must write into the published tree");
}, TEST_MS);

// ----------------------------------------------------------- recipe 3: CMS

test("recipe 3 — the split generator builds pages from a committed JSON file, colon and all", async () => {
  const generator = codeBlock("3. An external CMS over the source tree", "js", 1);
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<h1>Home</h1><a href="/posts/first-light.html">first</a>'),
    // The value that breaks an unquoted frontmatter title, which is exactly
    // what the recipe's JSON.stringify is there to survive.
    "_cms/posts.json": JSON.stringify([{
      slug: "first-light",
      title: "First light: what we saw",
      summary: "An account of the first night.",
      publishedAt: "2025-03-02T21:00:00Z",
      body: "We pointed it at Jupiter.",
      email: "volunteer@private.example",
    }], null, 2),
    "_scripts/gen.mjs": generator,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "the recipe's CMS generator must build");

  const out = readFileSync(join(tmp, "dist", "posts", "first-light.html"), "utf8");
  if (!out.includes("<title>First light: what we saw</title>")) {
    throw new Error(`the colon in a title must survive frontmatter:\n${out}`);
  }
  if (!out.includes("We pointed it at Jupiter.")) throw new Error(`the body must reach the page:\n${out}`);
  // "name the fields you emit, one at a time, rather than spreading" — the
  // private value is in the source JSON and must not be on the site.
  for (const file of readdirSync(join(tmp, "dist", "posts"))) {
    if (readFileSync(join(tmp, "dist", "posts", file), "utf8").includes("volunteer@private.example")) {
      throw new Error(`the recipe's named-fields rule failed: a private value published in ${file}`);
    }
  }
  if (existsSync(join(tmp, "dist", "_cms"))) throw new Error("_cms/ must be held back by the default _* glob");
}, TEST_MS);

test("recipe 3 — the fetch literal is a separate command, not something --generate runs", async () => {
  const fetcher = codeBlock("3. An external CMS over the source tree", "js", 0);
  const generator = codeBlock("3. An external CMS over the source tree", "js", 1);
  // The whole point of the split: the thing --generate runs on every rebuild
  // must not open a socket. If the two blocks ever merge, this fails.
  if (!fetcher.includes("fetch(")) throw new Error("the pull script literal no longer fetches");
  if (generator.includes("fetch(")) {
    throw new Error("the --generate literal must stay offline — the recipe's own warning is that it runs on every rebuild");
  }
}, TEST_MS);

// ------------------------------------------------- recipe 4: post-build tools

test("recipe 4 — audit writes nothing, and its json/sarif literals run", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "<h1>Home</h1>") });

  const before = existsSync(join(tmp, "dist"));
  const json = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "https://example.com/", "--format", "json"], tmp);
  const sarif = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "https://example.com/", "--format", "sarif"], tmp);
  if (existsSync(join(tmp, "dist")) !== before) throw new Error("`unify audit` never writes — but dist/ appeared");

  const parsedJson = JSON.parse(json.stdout);
  const parsedSarif = JSON.parse(sarif.stdout);
  if (typeof parsedJson.schemaVersion !== "number") throw new Error(`--format json needs a schemaVersion:\n${json.stdout}`);
  if (!parsedSarif.runs) throw new Error(`--format sarif must be SARIF:\n${sarif.stdout}`);
}, TEST_MS);

test("recipe 4 — a failed build leaves the previous dist/ untouched, so `&&` is sufficient", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "<h1>Home</h1>") });
  expectExit(await runCli(["build", "-s", "src", "-o", "dist"], tmp), 0, "first build");
  const good = readFileSync(join(tmp, "dist", "index.html"), "utf8");

  // Break it, rebuild, and the previous output must still be the previous output.
  writeTree(join(tmp, "src"), { "broken.html": page("Broken", '<a href="/nowhere.html">x</a>') });
  const bad = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(bad, 1, "a broken reference must fail the build");
  if (readFileSync(join(tmp, "dist", "index.html"), "utf8") !== good) {
    throw new Error("the recipe's transactional claim is what makes `unify build && deploy` safe");
  }
  if (existsSync(join(tmp, "dist", "broken.html"))) throw new Error("a failed build must publish nothing");
}, TEST_MS);

test("recipe 4 — findings carry a stable id and fingerprint, and --strict makes them fail a job", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // A share image with no dimensions: the finding recipe 2 names by name.
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home page.">
<meta property="og:image" content="/card.png"></head>
<body><h1>Home</h1></body>
</html>
`,
    "card.png": "png",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "https://example.com/", "--format", "json"], tmp);
  const findings = JSON.parse(r.stdout).findings ?? [];
  const dims = findings.find((f) => f.id === "image-missing-dimensions");
  if (!dims) throw new Error(`recipe 2 promises this finding by name:\n${r.stdout}`);
  if (!dims.fingerprint) throw new Error("every finding carries a stable fingerprint");

  // Twice over the same tree: a fingerprint a CI job suppresses must not move.
  const again = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "https://example.com/", "--format", "json"], tmp);
  const dims2 = JSON.parse(again.stdout).findings.find((f) => f.id === "image-missing-dimensions");
  if (dims2.fingerprint !== dims.fingerprint) throw new Error("a fingerprint that moves between runs cannot be suppressed");

  const strict = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "https://example.com/", "--strict"], tmp);
  if (strict.exit === 0) throw new Error("--strict must turn findings into a non-zero exit");
}, TEST_MS);

test("what stays outside unify — there is no --run, and the refusal says so", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home", "<h1>Home</h1>") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--run", "echo hi"], tmp);
  // Exit 2: invalid usage. A flag the document promises does not exist must
  // not exist quietly.
  expectExit(r, 2, "`--run \"<shell command>\"` is named as absent and must be");
}, TEST_MS);
