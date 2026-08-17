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
import { existsSync, readFileSync } from "node:fs";
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
