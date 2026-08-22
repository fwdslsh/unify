/**
 * `compiled-binary.test.js` — the shipped artifact, not the checkout.
 *
 * The single-file executable is the headline install for an audience that has
 * never heard of Bun, and it is the one build of unify that no other test in
 * this repository runs. Everything else spawns `src/cli.js` under a `bun` that
 * is already on PATH, which is exactly the environment the binary exists to
 * make unnecessary.
 *
 * That gap has already cost this project a shipped defect: `--version` read
 * `package.json` relative to `import.meta.url`, worked in every test, and died
 * with `ENOENT: /$bunfs/package.json` in the binary — on the install path the
 * product leads with. `bun build --compile` bundles by TRACING IMPORTS, so
 * anything reached through the filesystem at runtime is simply absent, and the
 * whole class is invisible to a checkout-only suite.
 *
 * Two live promises are checked here and nowhere else:
 *
 *   §19.5 — `init` scaffolds from bytes compiled into the executable, with no
 *   sibling directory to read. The existing check for this greps `src/templates`
 *   for `readFileSync`, which is a proxy; this runs the real thing.
 *
 *   §33.2 — "the runtime is unify's own", so `--generate` works for an author
 *   with `unify` on their PATH and NO NODE INSTALLED. That is asserted here by
 *   running the binary with a PATH containing neither `bun` nor `node`: the
 *   generator subprocess is spawned from `process.execPath`, the binary's own
 *   absolute path, which is what makes the promise true rather than lucky.
 *
 * Real spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { afterAll, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./support.mjs";

const TEST_MS = 180_000;

/** A PATH with no `bun` and no `node` on it — the author the binary is for. */
const BARE_PATH = "/nonexistent-for-this-test";

const work = mkdtempSync(join(tmpdir(), "unify-binary-"));
const BIN = join(work, "unify");

afterAll(() => {
  // ~100 MB. Writable disk is a fixed allowance here, so this is not optional.
  rmSync(work, { recursive: true, force: true });
});

/** Compile the shipped artifact once, from the tree as it stands. */
function compile() {
  if (existsSync(BIN)) return;
  const r = Bun.spawnSync({
    cmd: ["bun", "build", "--compile", join(ROOT, "src", "cli.js"), "--outfile", BIN],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) {
    throw new Error(`bun build --compile failed:\n${r.stderr.toString()}\n${r.stdout.toString()}`);
  }
}

/**
 * Run the compiled binary with a PATH that has no runtime on it.
 * @returns {{exit: number, stdout: string, stderr: string}}
 */
function runBin(args, cwd) {
  const r = Bun.spawnSync({
    cmd: [BIN, ...args],
    cwd,
    env: { PATH: BARE_PATH, HOME: cwd },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function sandbox() {
  const dir = mkdtempSync(join(work, "case-"));
  return dir;
}

test("the compiled binary reports its version — the bug that shipped, pinned", () => {
  compile();
  const dir = sandbox();
  const r = runBin(["--version"], dir);
  if (r.exit !== 0) throw new Error(`--version failed in the binary:\n${r.stderr}`);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  if (r.stdout.trim() !== pkg.version) {
    throw new Error(`binary reported ${JSON.stringify(r.stdout.trim())}, package.json says ${pkg.version}`);
  }
  if (r.stderr.includes("bunfs")) throw new Error(`a bundled read escaped into the artifact:\n${r.stderr}`);
}, TEST_MS);

test("§19.5 — the binary scaffolds and builds a site with no runtime on PATH", () => {
  compile();
  const dir = sandbox();

  const init = runBin(["init"], dir);
  if (init.exit !== 0) throw new Error(`init failed in the binary:\n${init.stderr}`);
  // §19.2's share image is the byte-for-byte case: an SVG would keep the
  // templates textual and would not do the job, so a real raster file has to
  // survive compilation as a literal.
  const raster = join(dir, "src", "assets", "share-placeholder.png");
  if (!existsSync(raster)) throw new Error(`the scaffolded raster share image is missing from ${dir}`);
  const bytes = readFileSync(raster);
  if (bytes.length < 100) throw new Error("the share image compiled to a stub, not real bytes");
  // A PNG, byte-for-byte — the point of §19.5 is that a base64 literal survives
  // compilation intact, so the signature is the assertion that matters.
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`the share image is not a PNG after compilation: ${bytes.subarray(0, 8).toString("hex")}`);
  }

  // The product's own guarantee, run against the artifact rather than the checkout.
  const build = runBin(["build", "--dry-run", "--strict"], dir);
  if (build.exit !== 0) throw new Error(`init && build --dry-run --strict must exit 0:\n${build.stdout}\n${build.stderr}`);
}, TEST_MS);

test("§33.2 — the binary runs a generator with neither bun nor node on PATH", () => {
  compile();
  const dir = sandbox();
  mkdirSync(join(dir, "src", "_scripts"), { recursive: true });
  writeFileSync(join(dir, "src", "index.html"),
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home page."></head>
<body><h1>Home</h1><a href="/made.html">made</a></body>
</html>
`);
  writeFileSync(join(dir, "src", "_scripts", "gen.mjs"),
    `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [, , sourceRoot, generatedDir] = process.argv;
mkdirSync(generatedDir, { recursive: true });
writeFileSync(join(generatedDir, "made.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Made</title><meta name="description" content="Made by a generator."></head><body><h1>Made</h1><p>root=\${sourceRoot}</p></body></html>\\n\`);
`);

  const r = runBin(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], dir);
  if (r.exit !== 0) {
    throw new Error(`--generate must work from the binary with no runtime installed:\n${r.stdout}\n${r.stderr}`);
  }
  const made = readFileSync(join(dir, "dist", "made.html"), "utf8");
  if (!made.includes("<h1>Made</h1>")) throw new Error(`the generated page is wrong:\n${made}`);
  if (!made.includes(join(dir, "src"))) throw new Error(`argv[2] must be the absolute source root:\n${made}`);
}, TEST_MS);

test("§33.2 — a generator's failure is still a located problem in the binary", () => {
  compile();
  const dir = sandbox();
  mkdirSync(join(dir, "src", "_scripts"), { recursive: true });
  writeFileSync(join(dir, "src", "index.html"),
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home page."></head>
<body><h1>Home</h1></body>
</html>
`);
  writeFileSync(join(dir, "src", "_scripts", "gen.mjs"), 'throw new Error("boom from the binary");\n');

  const r = runBin(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], dir);
  if (r.exit !== 1) throw new Error(`expected exit 1, got ${r.exit}:\n${r.stdout}\n${r.stderr}`);
  if (existsSync(join(dir, "dist"))) throw new Error("nothing may publish when the generator failed");
  if (!r.stderr.includes("boom from the binary")) {
    throw new Error(`the generator's own message must survive into the binary's report:\n${r.stderr}`);
  }
}, TEST_MS);
