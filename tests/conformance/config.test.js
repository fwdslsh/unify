/**
 * §18 unify.yaml — CFG-01, CFG-02, CFG-03 (all "targeted" per rules.tsv).
 * Real CLI spawns only (hygiene H3); no filesystem mocking (H1).
 *
 * These three rules are about the FILE's relationship to the FLAGS, so each
 * test proves that relationship structurally rather than merely checking
 * that a value "took effect" some way or other:
 *   - CFG-01: the file's keys are exactly the long option names, and its
 *     `exclude` list REPLACES the default the way `--exclude` does (proved
 *     by re-running the exact underscore-guard scenario through the file
 *     instead of the flag).
 *   - CFG-02: on a genuine conflict (both set, to DIFFERENT values), the CLI
 *     flag wins — for both a scalar key (output) and a list key (exclude,
 *     where "wins" means "replaces", not "merges with").
 *   - CFG-03: unify.yaml is never emitted, and running the identical
 *     behavior surface once from flags alone and once from the file alone
 *     produces BYTE-IDENTICAL output trees (compareTrees, the one sanctioned
 *     comparator) — the strongest available proof that the file cannot
 *     express anything a flag can't.
 */
import { test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { compareTrees } from "./compare.mjs";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

test("CFG-01: unify.yaml source key redirects the source root", async () => {
  const tmp = mkTmp();
  // No --source flag and no src/ yet: the CWD is where argument resolution
  // first looks for unify.yaml (src/cli.js's resolveSettings, probe pass).
  writeTree(tmp, {
    "unify.yaml": "source: real-src\n",
    "real-src/index.html": "<!doctype html>\n<html><head><title>Home</title></head><body><p>Hi</p></body></html>\n",
  });

  const r = await runCli(["build", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`expected exit 0, got ${r.exit}\nstderr: ${r.stderr}`);
  if (!existsSync(join(tmp, "dist", "index.html"))) {
    throw new Error("unify.yaml's source key did not redirect the source root — dist/index.html was not produced from real-src/");
  }
  covers("CFG-01");
}, TEST_MS);

test("CFG-01: unify.yaml exclude list replaces the default '_*', exactly like the flag", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // No leading "_*" in the file's exclude list below: if the file only
    // APPENDED to the default, this would stay silently excluded. Because it
    // REPLACES the default (§4.1), it becomes an emitted _-prefixed page and
    // the underscore guard (P14) must fire naming it.
    "_shown.html": "<!doctype html>\n<html><head><title>Shown</title></head><body><p>x</p></body></html>\n",
    "drafts/x.html": "<!doctype html>\n<html><head><title>Draft</title></head><body><p>x</p></body></html>\n",
    "index.html": "<!doctype html>\n<html><head><title>Home</title></head><body><p>Hi</p></body></html>\n",
    "unify.yaml": "exclude:\n  - drafts/**\n",
  });

  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 1) throw new Error(`expected exit 1 (the underscore guard must fire), got ${r.exit}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  if (!r.stderr.includes("_shown.html")) {
    throw new Error(`expected the underscore-guard problem naming _shown.html — proving the file's exclude list REPLACED the default '_*' rather than adding to it. stderr:\n${r.stderr}`);
  }
  covers("CFG-01");
}, TEST_MS);

test("CFG-01: output/clean/pretty-urls/base-url/strict/port are all recognized keys with real effect (or, for port, no parse error)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "unify.yaml": [
      "output: built",
      "clean: true",
      "exclude:",
      "  - drafts/**",
      "pretty-urls: true",
      "base-url: https://demo.example/demo/",
      "strict: true",
      "port: 4321",
      "",
    ].join("\n"),
    "index.html": '<!doctype html>\n<html><head><title>Home</title></head><body><p><a href="/about.html">About</a></p></body></html>\n',
    "about.html": "<!doctype html>\n<html><head><title>About</title></head><body><p>About</p></body></html>\n",
    "drafts/x.html": "<!doctype html>\n<html><head><title>Draft</title></head><body><p>x</p></body></html>\n",
    // A working-format asset (A09) so --strict has something to flip the
    // exit code on WITHOUT blocking publish (advisories never block it).
    "logo.psd": "not a real psd\n",
  });
  writeTree(join(tmp, "built"), { "junk.txt": "should be removed by clean: true\n" });

  const r = await runCli(["build", "-s", "src"], tmp); // -o deliberately omitted: "output: built" must supply it
  if (r.stderr.includes("unknown key")) throw new Error(`unify.yaml: a recognized §18 key was rejected as unknown:\n${r.stderr}`);
  // strict:true + the A09 advisory flips the exit code; advisories never
  // block publish (product-spec §4 / conformance §14.1), so this is exit 1
  // with a full, successful publish underneath it.
  if (r.exit !== 1) throw new Error(`expected exit 1 (strict: true + the .psd advisory), got ${r.exit}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

  const builtDir = join(tmp, "built");
  if (!existsSync(builtDir)) throw new Error("the 'output: built' key did not redirect the output directory");
  if (existsSync(join(builtDir, "junk.txt"))) throw new Error("the 'clean: true' key did not empty the output directory first");
  if (existsSync(join(builtDir, "drafts", "x.html"))) throw new Error("the 'exclude' key's drafts/** did not apply");

  const indexHtml = readFileSync(join(builtDir, "index.html"), "utf8");
  // pretty-urls (about.html -> about/) composed with base-url (/demo/ prefix),
  // in the §11 order the spec fixes (§11.1 -> §11.2 -> §11.3).
  if (!indexHtml.includes('href="/demo/about/"')) {
    throw new Error(`expected the link rewritten by BOTH pretty-urls and base-url to /demo/about/, got:\n${indexHtml}`);
  }
  covers("CFG-01");
}, TEST_MS);

test("CFG-02: a CLI flag wins over a conflicting unify.yaml value (scalar key: output)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "unify.yaml": "output: from-config\n",
    "index.html": "<!doctype html>\n<html><head><title>Home</title></head><body><p>Hi</p></body></html>\n",
  });

  const r = await runCli(["build", "-s", "src", "-o", "from-cli"], tmp);
  if (r.exit !== 0) throw new Error(`expected exit 0, got ${r.exit}\nstderr: ${r.stderr}`);
  if (!existsSync(join(tmp, "from-cli", "index.html"))) throw new Error("the CLI -o flag did not win over unify.yaml's output key");
  if (existsSync(join(tmp, "from-config"))) throw new Error("unify.yaml's output key took effect despite a conflicting CLI flag");
  covers("CFG-02");
}, TEST_MS);

test("CFG-02: a CLI flag wins over a conflicting unify.yaml value (list key: exclude REPLACES, not merges)", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "unify.yaml": "exclude:\n  - drafts/**\n",
    "_shown.html": "<!doctype html>\n<html><head><title>Shown</title></head><body><p>x</p></body></html>\n",
    "drafts/x.html": "<!doctype html>\n<html><head><title>Draft</title></head><body><p>x</p></body></html>\n",
    "index.html": "<!doctype html>\n<html><head><title>Home</title></head><body><p>Hi</p></body></html>\n",
  });

  // The CLI's --exclude '_*' must fully REPLACE the file's ["drafts/**"], not
  // merge with it: _shown.html goes back to being excluded, and drafts/x.html
  // (no longer covered by anything) is emitted.
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--exclude", "_*"], tmp);
  if (r.exit !== 0) throw new Error(`expected exit 0, got ${r.exit}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  if (existsSync(join(tmp, "dist", "_shown.html"))) throw new Error("the CLI --exclude did not win over unify.yaml's exclude list (_shown.html should be excluded again)");
  if (!existsSync(join(tmp, "dist", "drafts", "x.html"))) throw new Error("the CLI --exclude did not fully REPLACE unify.yaml's list (drafts/x.html should no longer be excluded)");
  covers("CFG-02");
}, TEST_MS);

test("CFG-03: unify.yaml is never emitted into the output", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "unify.yaml": "output: dist\n",
    "index.html": "<!doctype html>\n<html><head><title>Home</title></head><body><p>Hi</p></body></html>\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`expected exit 0, got ${r.exit}\nstderr: ${r.stderr}`);
  if (existsSync(join(tmp, "dist", "unify.yaml"))) throw new Error("unify.yaml was emitted into the output directory");
  covers("CFG-03");
}, TEST_MS);

test("CFG-03: no behavior exists that only the file can express — flags-only and file-only builds of the same settings produce byte-identical trees", async () => {
  const tmp = mkTmp();
  const site = {
    "index.html": '<!doctype html>\n<html><head><title>Home</title></head><body><p><a href="/about.html">About</a></p></body></html>\n',
    "about.html": "<!doctype html>\n<html><head><title>About</title></head><body><p>About</p></body></html>\n",
    "drafts/x.html": "<!doctype html>\n<html><head><title>Draft</title></head><body><p>x</p></body></html>\n",
    "logo.psd": "not a real psd\n",
  };
  writeTree(join(tmp, "flags-site"), site);
  writeTree(join(tmp, "file-site"), site);
  writeTree(join(tmp, "file-site"), { "unify.yaml": "pretty-urls: true\nbase-url: https://demo.example/demo/\nexclude:\n  - drafts/**\nstrict: true\n" });

  const rFlags = await runCli(
    ["build", "-s", "flags-site", "-o", "dist-flags", "--pretty-urls", "--base-url", "https://demo.example/demo/", "--exclude", "drafts/**", "--strict"],
    tmp,
  );
  const rFile = await runCli(["build", "-s", "file-site", "-o", "dist-file"], tmp);

  if (rFlags.exit !== rFile.exit) {
    throw new Error(`exit codes differ: flags-only ${rFlags.exit}, file-only ${rFile.exit}\nflags stderr: ${rFlags.stderr}\nfile stderr: ${rFile.stderr}`);
  }
  const diffs = compareTrees(join(tmp, "dist-flags"), join(tmp, "dist-file"));
  if (diffs.length) {
    throw new Error(`flags-only and file-only builds of the same settings produced DIFFERENT output — unify.yaml expressed something a flag could not:\n  ${diffs.join("\n  ")}`);
  }
  covers("CFG-03");
}, TEST_MS);

test("CFG-01: canonical, feed-full, catalog, search-corpus, and generate are saved flags with real effect", async () => {
  // The release review found §18's key list contradicting itself: §22.1
  // and §33.1 each said their flag is saved in unify.yaml while §18's list
  // omitted both, and the two site-level booleans were saveable nowhere.
  // One tree, one flagless build, all five keys observed by their effects —
  // each assertion names the section whose promise it keeps.
  const tmp = mkTmp();
  writeTree(tmp, {
    // §18: the file lives AT THE SOURCE ROOT — with src/ present that is
    // src/unify.yaml, not the project root. (This test's first draft put it
    // one level up and concluded `generate:` was broken; it was unread.)
    "src/unify.yaml": [
      "base-url: https://example.com/site/",
      "canonical: auto",
      "feed-full: true",
      "catalog: true",
      "search-corpus: true",
      "generate: _scripts/gen.mjs",
    ].join("\n") + "\n",
    "src/index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home page."></head>
<body><h1>Home</h1><a href="/post.html">post</a><a href="/made.html">made</a></body>
</html>
`,
    "src/post.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Post</title><meta name="description" content="A post.">
<meta name="schema" content="BlogPosting"><meta name="date" content="2026-08-02T21:30:00Z"></head>
<body><main><h1>Post</h1><p>Body text.</p></main></body>
</html>
`,
    "src/_scripts/gen.mjs": `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [, , , outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "made.html"),
  '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Made</title><meta name="description" content="Generated."></head><body><h1>Made</h1></body></html>\\n');
`,
  });

  const r = await runCli(["build"], tmp);
  if (r.exit !== 0) throw new Error(`a build configured entirely by unify.yaml must succeed:\n${r.stdout}\n${r.stderr}`);

  // §22.1 — `canonical: auto` in the file is `--canonical auto`.
  const post = readFileSync(join(tmp, "dist", "post.html"), "utf8");
  if (!post.includes('rel="canonical" href="https://example.com/site/post.html"')) {
    throw new Error(`canonical: auto in unify.yaml must complete a canonical:\n${post}`);
  }
  // §29.6 — `feed-full: true` puts the rendered body in <content>.
  const feed = readFileSync(join(tmp, "dist", "feed.xml"), "utf8");
  if (!/<content type="html">/.test(feed)) {
    throw new Error(`feed-full: true in unify.yaml must produce <content type="html">:\n${feed}`);
  }
  // §30.1 — `catalog: true` / `search-corpus: true` write the two artifacts.
  if (!existsSync(join(tmp, "dist", "assets", "unify", "catalog.json"))) {
    throw new Error("catalog: true in unify.yaml must write assets/unify/catalog.json");
  }
  if (!existsSync(join(tmp, "dist", "assets", "unify", "search-corpus.json"))) {
    throw new Error("search-corpus: true in unify.yaml must write assets/unify/search-corpus.json");
  }
  // §33.1 — `generate:` runs the generator before the scan.
  if (!existsSync(join(tmp, "dist", "made.html"))) {
    throw new Error("generate: in unify.yaml must run the generator");
  }
  covers("CFG-01");
}, 30_000);

test("CFG-04 — a repeated single-value option is a usage error; flags and --exclude are not", async () => {
  // The silent version of this published to a directory the author did not
  // name: `-o dist -o other` kept `other` and said nothing, at exit 0. Three
  // sides, because the repair must not catch the two repetitions that are
  // legitimate — `--exclude` accumulates by design, and asking for `--strict`
  // twice asks for the same thing.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html":
      '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>H</title>' +
      '<meta name="description" content="A page."></head><body><main><h1>H</h1></main></body></html>\n',
  });

  const twice = await runCli(["build", "-s", "src", "-o", "dist", "-o", "other", "--dry-run"], tmp);
  if (twice.exit !== 2) {
    throw new Error(`§18: a repeated -o is a usage error, got exit ${twice.exit}\n${twice.stderr}`);
  }
  if (!twice.stderr.includes("--output given more than once")) {
    throw new Error(`§18: the error names the long option:\n${twice.stderr}`);
  }
  if (existsSync(join(tmp, "other")) || existsSync(join(tmp, "dist"))) {
    throw new Error("§18: a usage error writes nothing");
  }

  // Legitimate repetitions still build.
  const list = await runCli(
    ["build", "-s", "src", "-o", "dist", "--exclude", "*.tmp", "--exclude", "*.bak", "--dry-run"],
    tmp,
  );
  if (list.exit !== 0) throw new Error(`§18: --exclude accumulates:\n${list.stderr}`);

  const flag = await runCli(["build", "-s", "src", "-o", "dist", "--strict", "--strict", "--dry-run"], tmp);
  if (flag.exit !== 0) throw new Error(`§18: a repeated boolean flag is not an error:\n${flag.stderr}`);
  covers("CFG-04");
}, 30_000);


// ---- CFG-05: `unify build --save-config` -------------------------------------

const PAGE =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>H</title>' +
  '<meta name="description" content="A page."></head><body><main><h1>H</h1></main></body></html>\n';

test("CFG-05 — --save-config creates unify.yaml from the flags given, and the loader reads it back", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": PAGE });

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--pretty-urls", "--base-url=https://x.example/", "--exclude", "_drafts/**", "--save-config"], tmp);
  if (r.exit !== 0) throw new Error(`exit ${r.exit}\n${r.stderr}`);
  // A new file lands at the project root, and the explicit --source is saved
  // there (CFG-08): it is what a bare `unify build` needs next time.
  const text = readFileSync(join(tmp, "unify.yaml"), "utf8");
  if (text !== 'output: dist\nexclude:\n  - _drafts/**\npretty-urls: true\nbase-url: https://x.example/\nsource: src\n') {
    throw new Error(`unexpected file:\n${text}`);
  }
  if (/save-config|dry-run/.test(text)) throw new Error("must not write save-config or dry-run");
  if (existsSync(join(tmp, "dist", "unify.yaml"))) throw new Error("unify.yaml shipped");

  // Round trip: a build from the file alone matches a build from the flags.
  rmSync(join(tmp, "dist"), { recursive: true });
  const again = await runCli(["build", "-s", "src"], tmp);
  if (again.exit !== 0) throw new Error(again.stderr);
  const flags = await runCli(["build", "-s", "src", "-o", "dist2", "--pretty-urls", "--base-url", "https://x.example/", "--exclude", "_drafts/**"], tmp);
  if (flags.exit !== 0) throw new Error(flags.stderr);
  const cmp = compareTrees(join(tmp, "dist"), join(tmp, "dist2"));
  if (cmp && cmp.length) throw new Error(`file-only build differs: ${JSON.stringify(cmp)}`);
  covers("CFG-05");
}, 30_000);

test("CFG-05 — upsert keeps comments and untouched keys byte-for-byte and replaces an exclude list", async () => {
  const tmp = mkTmp();
  const before =
    "# my settings\nstrict: true\nbase-url: https://old.example/\n# the globs\nexclude:\n  - old-a\n  - old-b\ncatalog: true # keep\n";
  writeTree(join(tmp, "src"), { "index.html": PAGE, "unify.yaml": before });

  const r = await runCli(["build", "-s", "src", "--base-url", "https://new.example/", "--exclude=_x", "--exclude", "_y", "--save-config"], tmp);
  if (r.exit !== 0) throw new Error(`exit ${r.exit}\n${r.stderr}`);
  const want =
    "# my settings\nstrict: true\nbase-url: https://new.example/\n# the globs\nexclude:\n  - _x\n  - _y\ncatalog: true # keep\n";
  const got = readFileSync(join(tmp, "src", "unify.yaml"), "utf8");
  if (got !== want) throw new Error(`got:\n${got}\nwant:\n${want}`);

  // Passing nothing saveable changes nothing.
  const noop = await runCli(["build", "-s", "src", "--save-config"], tmp);
  if (noop.exit !== 0) throw new Error(noop.stderr);
  if (readFileSync(join(tmp, "src", "unify.yaml"), "utf8") !== want) throw new Error("a no-op save changed the file");
  covers("CFG-05");
}, 30_000);

test("CFG-05 — nothing saveable creates no file; an exclude list's indented comments go with it", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": PAGE });
  // No --source either: with src/ found by the legacy default there is nothing to save.
  const bare = await runCli(["build", "--save-config"], tmp);
  if (bare.exit !== 0) throw new Error(bare.stderr);
  if (existsSync(join(tmp, "src", "unify.yaml")) || existsSync(join(tmp, "unify.yaml"))) throw new Error("an empty save created unify.yaml");

  writeTree(join(tmp, "src"), { "unify.yaml": "exclude:\n  - old-a\n  # old note\n  - old-b\n# next\nstrict: true\n" });
  const r = await runCli(["build", "-s", "src", "--exclude", "_x", "--save-config"], tmp);
  if (r.exit !== 0) throw new Error(r.stderr);
  const got = readFileSync(join(tmp, "src", "unify.yaml"), "utf8");
  if (got !== "exclude:\n  - _x\n# next\nstrict: true\n") throw new Error(`got:\n${got}`);
  covers("CFG-05");
}, 30_000);

test("CFG-05 — usage errors write nothing: a non-build command, an unwritable value", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": PAGE });
  for (const args of [
    ["audit", "-s", "src", "--pretty-urls", "--save-config"],
    ["build", "-s", "src", "--exclude", "a #b", "--save-config"],
  ]) {
    const r = await runCli(args, tmp);
    if (r.exit !== 2) throw new Error(`${args.join(" ")}: expected exit 2, got ${r.exit}\n${r.stderr}`);
    if (existsSync(join(tmp, "src", "unify.yaml")) || existsSync(join(tmp, "dist"))) {
      throw new Error(`${args.join(" ")}: a usage error writes nothing`);
    }
  }
  covers("CFG-05");
}, 30_000);

test("CFG-05 — a failed build does not save", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": PAGE.replace("<main>", '<main><a href="/missing.html">x</a>'),
    "unify.yaml": "# keep\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--pretty-urls", "--save-config"], tmp);
  if (r.exit !== 1) throw new Error(`expected exit 1, got ${r.exit}\n${r.stdout}\n${r.stderr}`);
  if (readFileSync(join(tmp, "src", "unify.yaml"), "utf8") !== "# keep\n") throw new Error("failed build changed unify.yaml");
  covers("CFG-05");
}, 30_000);

// ------------------------------------------------------------------- CFG-06

test("CFG-06 — unify.yaml at the project root is read when the source root has none, and may name the source directory", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), { "index.html": PAGE });
  writeTree(tmp, { "unify.yaml": "source: site\npretty-urls: true\n" });
  const r = await runCli(["build", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`a project-root unify.yaml naming source: site\n${r.stderr}`);
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("source: site from the project root chose the source root");
  // pretty-urls from the same file took effect: a second page moves to a directory.
  writeTree(join(tmp, "site"), { "about.html": PAGE.replace("Home", "About") });
  const r2 = await runCli(["build", "-o", "dist"], tmp);
  if (r2.exit !== 0) throw new Error(r2.stderr);
  if (!existsSync(join(tmp, "dist", "about", "index.html"))) throw new Error("pretty-urls: true from the project-root file must apply");
  // Never emitted, from either location.
  if (existsSync(join(tmp, "dist", "unify.yaml"))) throw new Error("unify.yaml never ships");
  covers("CFG-06");
}, TEST_MS);

test("CFG-06 — the source root's unify.yaml wins when both exist; --save-config upserts the file that was read", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": PAGE, "unify.yaml": "output: from-source\n" });
  writeTree(tmp, { "unify.yaml": "output: from-project\n" });
  const r = await runCli(["build", "-s", "src"], tmp);
  if (r.exit !== 0) throw new Error(r.stderr);
  if (!existsSync(join(tmp, "from-source"))) throw new Error("the source root's file must win");
  if (existsSync(join(tmp, "from-project"))) throw new Error("the project root's file must not be read when the source root has one");

  // With only the project-root file, --save-config writes THERE, not a new src/unify.yaml.
  rmSync(join(tmp, "src", "unify.yaml"));
  rmSync(join(tmp, "from-source"), { recursive: true });
  const saved = await runCli(["build", "-s", "src", "--pretty-urls", "--save-config"], tmp);
  if (saved.exit !== 0) throw new Error(saved.stderr);
  const project = readFileSync(join(tmp, "unify.yaml"), "utf8");
  // The explicit -s src is saved too, since the file sits outside the source root (CFG-08).
  if (project !== "output: from-project\npretty-urls: true\nsource: src\n") throw new Error(`the project-root file was upserted:\n${project}`);
  if (existsSync(join(tmp, "src", "unify.yaml"))) throw new Error("no second file in the source root");
  covers("CFG-06");
}, TEST_MS);

// ------------------------------------------------------------------- CFG-07

test("CFG-07 — --save-config with --dry-run saves after a dry run that exits 0, and dist/ stays untouched", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": PAGE });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run", "--pretty-urls", "--save-config"], tmp);
  if (r.exit !== 0) throw new Error(`a dry run with --save-config\n${r.stderr}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("a dry run never writes dist/");
  const text = readFileSync(join(tmp, "unify.yaml"), "utf8");
  if (text !== "output: dist\npretty-urls: true\nsource: src\n") throw new Error(`the flags were saved:\n${text}`);
  if (!r.stdout.includes("saved output, pretty-urls, source to")) throw new Error(`the save is reported:\n${r.stdout}`);

  // A dry run that fails saves nothing.
  writeTree(join(tmp, "src"), { "broken.html": PAGE.replace("Home", "Broken").replace("</body>", '<a href="/nope.html">x</a></body>') });
  const bad = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run", "--base-url", "https://x.example/", "--save-config"], tmp);
  if (bad.exit !== 1) throw new Error(`a broken link fails the dry run: got ${bad.exit}\n${bad.stderr}`);
  if (readFileSync(join(tmp, "unify.yaml"), "utf8").includes("base-url")) throw new Error("a failed dry run must not save");
  covers("CFG-07");
}, TEST_MS);

// ------------------------------------------------------------------- CFG-08

test("CFG-08 — a relative path in unify.yaml resolves against the file's own directory; CLI flags keep their rules", async () => {
  const tmp = mkTmp();
  const gen = 'import { writeFileSync } from "node:fs"; import { join } from "node:path";\nwriteFileSync(join(process.argv[3], "g.html"), \'<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>G</title><meta name="description" content="g"></head><body><h1>G</h1></body></html>\\n\');\n';
  // The default layout: content in site/, the generator in scripts/, the config beside them.
  writeTree(tmp, { "site/index.html": PAGE, "scripts/gen.mjs": gen, "unify.yaml": "source: site\ngenerate: scripts/gen.mjs\n" });
  const r = await runCli(["build", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`a project-root unify.yaml naming scripts/gen.mjs beside it\n${r.stderr}`);
  if (!existsSync(join(tmp, "dist", "g.html"))) throw new Error("generate: scripts/gen.mjs must resolve beside the file, not from the source root");

  // The same file inside the source root reads the same paths from there, as before 0.10.
  rmSync(join(tmp, "unify.yaml"));
  rmSync(join(tmp, "dist"), { recursive: true });
  writeTree(join(tmp, "site"), { "_scripts/gen.mjs": gen, "unify.yaml": "generate: _scripts/gen.mjs\n" });
  const inside = await runCli(["build", "-o", "dist"], tmp);
  if (inside.exit !== 0) throw new Error(`an in-source unify.yaml\n${inside.stderr}`);
  if (!existsSync(join(tmp, "dist", "g.html"))) throw new Error("an in-source generate: still resolves from the source root");

  // The CLI flag is still source-root-relative: ../scripts/gen.mjs from site/.
  rmSync(join(tmp, "site", "unify.yaml"));
  rmSync(join(tmp, "dist"), { recursive: true });
  const cli = await runCli(["build", "-o", "dist", "--generate", "../scripts/gen.mjs"], tmp);
  if (cli.exit !== 0) throw new Error(`--generate relative to the source root\n${cli.stderr}`);
  if (!existsSync(join(tmp, "dist", "g.html"))) throw new Error("--generate on the command line resolves from the source root");

  // --save-config writes the CLI's source-root-relative value relative to the file.
  const saved = await runCli(["build", "-o", "dist", "--generate", "../scripts/gen.mjs", "--save-config"], tmp);
  if (saved.exit !== 0) throw new Error(saved.stderr);
  const text = readFileSync(join(tmp, "unify.yaml"), "utf8");
  if (text !== "output: dist\ngenerate: scripts/gen.mjs\n") throw new Error(`generate is saved relative to the file:\n${text}`);
  covers("CFG-08");
}, TEST_MS);

// ------------------------------------------------------------------- EXC-13

test("EXC-13 — the default source root is site/, then src/, then the working directory", async () => {
  const tmp = mkTmp();
  writeTree(tmp, { "site/index.html": PAGE.replace("<h1>H</h1>", "<h1>From site</h1>"), "src/index.html": PAGE.replace("<h1>H</h1>", "<h1>From src</h1>") });
  const both = await runCli(["build", "-o", "dist"], tmp);
  if (both.exit !== 0) throw new Error(both.stderr);
  if (!readFileSync(join(tmp, "dist", "index.html"), "utf8").includes("From site")) throw new Error("site/ wins over src/");

  rmSync(join(tmp, "site"), { recursive: true });
  const legacy = await runCli(["build", "-o", "dist"], tmp);
  if (legacy.exit !== 0) throw new Error(legacy.stderr);
  if (!readFileSync(join(tmp, "dist", "index.html"), "utf8").includes("From src")) throw new Error("src/ is still found when site/ is absent");
  if (legacy.stdout.includes("building from the working directory")) throw new Error("src/ is a default, not the defaulted-source case");

  rmSync(join(tmp, "src"), { recursive: true });
  rmSync(join(tmp, "dist"), { recursive: true });
  writeTree(tmp, { "index.html": PAGE.replace("<h1>H</h1>", "<h1>From cwd</h1>") });
  const cwd = await runCli(["build", "-o", "dist"], tmp);
  if (cwd.exit !== 0) throw new Error(cwd.stderr);
  if (!cwd.stdout.includes("no site/ or src/ here")) throw new Error(`the defaulted-source notice names both directories:\n${cwd.stdout}`);
  covers("EXC-13");
}, TEST_MS);

test("CFG-09 — only a value that differs from the default needs writing: every default stated, or init's all-commented file, builds byte-identically to no file", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "site"), { "index.html": PAGE, "_draft.html": PAGE, "about.html": PAGE.replace("<h1>H</h1>", "<h1>A</h1>") });

  const bare = await runCli(["build", "-o", "dist"], tmp);
  if (bare.exit !== 0) throw new Error(`no file: exit ${bare.exit}\n${bare.stderr}`);

  // Every option that has a default, written out as that default.
  writeTree(tmp, {
    "unify.yaml":
      "source: site\noutput: dist\nclean: false\nexclude:\n  - _*\npretty-urls: false\nfeed-full: false\ncatalog: false\n" +
      "search-corpus: false\ninclude-noindex: false\nstrict: false\naudit: false\nport: 3000\nsource-inventory: false\n",
  });
  const stated = await runCli(["build", "-o", "dist2"], tmp);
  if (stated.exit !== 0) throw new Error(`defaults stated: exit ${stated.exit}\n${stated.stderr}`);
  let cmp = compareTrees(join(tmp, "dist"), join(tmp, "dist2"));
  if (cmp && cmp.length) throw new Error(`stating the defaults changed the build: ${JSON.stringify(cmp)}`);

  // The file `unify init` writes: every option present, every one commented out.
  const scaffold = mkTmp();
  const init = await runCli(["init"], scaffold);
  if (init.exit !== 0) throw new Error(init.stderr);
  const template = readFileSync(join(scaffold, "unify.yaml"), "utf8");
  if (!/^# source: site$/m.test(template) || !/^# generate: scripts\/gen\.mjs$/m.test(template)) throw new Error(`init's unify.yaml does not list the options commented out:\n${template}`);
  // §19.10 — the one live key is template:, a block with the record and the keep list under it, and no build reads it.
  if (!/^template:\n  source: default\n  keep:\n    - unify\.yaml\n    - site\/assets\/theme\.css$/m.test(template)) throw new Error(`init's unify.yaml must record the template and keep itself and the theme under template::\n${template}`);
  if (/^(?!template:)[a-z]/m.test(template)) throw new Error(`the default template must have no live line but template::\n${template}`);
  writeTree(tmp, { "unify.yaml": template });
  const commented = await runCli(["build", "-o", "dist3"], tmp);
  if (commented.exit !== 0) throw new Error(`all-commented file: exit ${commented.exit}\n${commented.stderr}`);
  cmp = compareTrees(join(tmp, "dist"), join(tmp, "dist3"));
  if (cmp && cmp.length) throw new Error(`the all-commented file changed the build: ${JSON.stringify(cmp)}`);

  // --save-config uncomments the key's own line instead of appending a second copy.
  const save = await runCli(["build", "-o", "dist", "--pretty-urls", "--save-config"], tmp);
  if (save.exit !== 0) throw new Error(save.stderr);
  const after = readFileSync(join(tmp, "unify.yaml"), "utf8");
  if (after.split("\n").filter((l) => /pretty-urls:/.test(l)).join("|") !== "pretty-urls: true") throw new Error(`expected the commented pretty-urls line replaced in place:\n${after}`);
  const lineOf = (text, re) => text.split("\n").findIndex((l) => re.test(l));
  if (lineOf(after, /^pretty-urls: true$/) !== lineOf(template, /^# pretty-urls: true$/)) throw new Error("the saved key did not take its commented line's place");
  covers("CFG-09");
}, TEST_MS);
