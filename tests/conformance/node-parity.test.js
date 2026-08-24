/**
 * `node-parity.test.js` — G12, the runtime parity gate (issue #49).
 *
 * unify supports two runtimes, and exactly one of them runs the test suite.
 * That asymmetry is the whole reason this file exists: `bun test` spawns
 * `bun src/cli.js` everywhere, so every other test in this repository could be
 * green while `node src/cli.js` was broken — and it WAS broken, silently, in
 * the worst possible way. The entrypoint guard was `import.meta.main`, which
 * bun has always had and node only grew in v22.18.0; on anything older the
 * whole CLI was skipped and the process exited 0 having done nothing. A build
 * that publishes nothing and reports success is the exact failure the
 * content-loss law exists to forbid, and no test in the suite could see it.
 *
 * So this is the node analogue of G11's binary parity, and it is built the
 * same way: run the shipped artifact the checkout's tests do not run, over
 * the Tier-0 golden path, and compare against the run everything else does.
 *
 *   For each of the five `init` templates, twice — once under bun, once under
 *   node — `unify init <t>` → `unify build --dry-run --strict` → `unify
 *   build`. Every exit code must be 0 (the reference check is inside that last
 *   build, so "reference-clean output" is what exit 0 means there), the
 *   scaffolded source tree and the published `dist/` must be byte-identical
 *   between the two runs, and so must stdout and stderr.
 *
 * BYTE-IDENTICAL IS THE POINT, not "equivalent". The comparator in
 * `compare.mjs` waives inter-block whitespace because the SPEC waives it for
 * an implementation; two runtimes running the same implementation have no such
 * licence. A byte here that depends on which runtime wrote it is a bug in this
 * port, so the comparison is `Buffer.equals` and nothing else.
 *
 * WHY IT FAILS RATHER THAN SKIPS when node is missing or too old. A parity
 * gate that quietly excuses itself on the machine that lacks the second
 * runtime is a gate that will be green precisely where it is needed (hygiene
 * H4). The messages below name the remedy instead.
 *
 * Real spawns only (H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI, ROOT } from "./support.mjs";

const TEST_MS = 120_000;
const TEMPLATES = ["default", "basic", "blog", "docs", "portfolio"];

const work = mkdtempSync(join(tmpdir(), "unify-node-parity-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));

const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** The declared floor, as three numbers: `">=22.12.0"` → `[22, 12, 0]`. */
function declaredFloor() {
  const range = PKG.engines?.node;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(range ?? "");
  if (!m) throw new Error(`package.json engines.node must pin an exact floor, got ${JSON.stringify(range)}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** @returns {number} negative, zero, or positive — the usual comparator sign. */
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The `node` this gate runs against, verified to exist and to clear the floor
 * `package.json` advertises. Both failures are the environment's, so both say
 * what to do about it rather than merely what is wrong.
 * @returns {string} absolute path to the node binary
 */
function requireNode() {
  const node = Bun.which("node");
  if (!node) {
    throw new Error(
      "no `node` on PATH, so the runtime parity gate (G12) cannot run.\n" +
      "  This gate is not optional: it is the only test in the suite that runs the CLI under node.\n" +
      "  In CI, add to the job that runs `bun test`, alongside the bun setup step:\n" +
      "      - uses: actions/setup-node@v4\n" +
      "        with:\n" +
      "          node-version: '22'",
    );
  }
  const raw = Bun.spawnSync({ cmd: [node, "--version"], stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
  const m = /v(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!m) throw new Error(`could not read a version out of \`node --version\`: ${JSON.stringify(raw)}`);
  const found = [Number(m[1]), Number(m[2]), Number(m[3])];
  const floor = declaredFloor();
  if (compareVersions(found, floor) < 0) {
    throw new Error(
      `\`node\` on PATH is ${raw}, below the ${floor.join(".")} floor package.json declares in engines.node.\n` +
      "  Below that floor node prints an ExperimentalWarning for the JSON import in src/cli.js,\n" +
      "  which lands on stderr and makes unify's output non-deterministic.\n" +
      "  In CI, pin the runtime: `- uses: actions/setup-node@v4` with `node-version: '22'`.",
    );
  }
  return node;
}

/** The same clean environment `support.mjs` gives every spawned CLI. */
function cleanEnv() {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;
  return env;
}

/**
 * @param {string} runtime - absolute path to `bun` or `node`
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{exit: number, stdout: string, stderr: string}}
 */
function run(runtime, args, cwd) {
  const r = Bun.spawnSync({
    cmd: [runtime, CLI, ...args],
    cwd,
    env: cleanEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/**
 * Every file under `dir`, as `relative path → bytes`. Absent directory → empty,
 * so "one runtime published and the other did not" reads as a tree difference
 * rather than a crash.
 * @param {string} dir
 * @returns {Map<string, Buffer>}
 */
function snapshot(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbs = join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childAbs, childRel);
      else files.set(childRel, readFileSync(childAbs));
    }
  };
  walk(dir, "");
  return files;
}

/**
 * @param {Map<string, Buffer>} bun
 * @param {Map<string, Buffer>} node
 * @param {string} what
 */
function expectIdenticalTrees(bun, node, what) {
  const onlyBun = [...bun.keys()].filter((p) => !node.has(p));
  const onlyNode = [...node.keys()].filter((p) => !bun.has(p));
  if (onlyBun.length || onlyNode.length) {
    throw new Error(
      `${what}: the two runtimes emitted different files.\n` +
      `  only under bun:  ${onlyBun.join(", ") || "(none)"}\n` +
      `  only under node: ${onlyNode.join(", ") || "(none)"}`,
    );
  }
  for (const [path, bunBytes] of bun) {
    const nodeBytes = node.get(path);
    if (!bunBytes.equals(nodeBytes)) {
      // Quote from the FIRST DIFFERING BYTE, not from the start of the file.
      // A divergence is usually a suffix — a trailing newline, one appended
      // element — and a window anchored at byte 0 shows two identical
      // prefixes and leaves the reader to go find it.
      let at = 0;
      while (at < bunBytes.length && at < nodeBytes.length && bunBytes[at] === nodeBytes[at]) at++;
      const window = (buf) => JSON.stringify(buf.toString("utf8").slice(Math.max(0, at - 40), at + 120));
      throw new Error(
        `${what}: ${path} differs between the runtimes (${bunBytes.length} vs ${nodeBytes.length} bytes, first at byte ${at}).\n` +
        `  bun:  ${window(bunBytes)}\n` +
        `  node: ${window(nodeBytes)}`,
      );
    }
  }
}

/**
 * The one thing about the two runs that is legitimately allowed to differ:
 * they happen in different directories. Everything else in the output is
 * compared as written.
 */
function scrub(text, dir) {
  return text.split(dir).join("<workdir>");
}

test("node runs the CLI at all — the entrypoint that used to be a silent no-op", () => {
  const node = requireNode();
  const dir = mkdtempSync(join(work, "version-"));
  const r = run(node, ["--version"], dir);
  if (r.exit !== 0) throw new Error(`node src/cli.js --version exited ${r.exit}:\n${r.stderr}`);
  if (r.stdout.trim() !== PKG.version) {
    throw new Error(
      `node src/cli.js --version printed ${JSON.stringify(r.stdout)}, package.json says ${PKG.version}.\n` +
      "  Empty output here is the import.meta.main regression: the CLI never ran and still exited 0.",
    );
  }
  if (r.stderr !== "") throw new Error(`node must write nothing to stderr for --version, got:\n${r.stderr}`);
}, TEST_MS);

for (const template of TEMPLATES) {
  test(`G12 parity/${template} — init → build --dry-run --strict → build is byte-identical under node and bun`, () => {
    const node = requireNode();
    const bun = process.execPath;

    /** @returns {{dir: string, phases: Record<string, {exit: number, stdout: string, stderr: string}>}} */
    const goldenPath = (runtime, label) => {
      const dir = mkdtempSync(join(work, `${template}-${label}-`));
      const phases = {
        init: run(runtime, ["init", template], dir),
        dry: run(runtime, ["build", "--dry-run", "--strict"], dir),
        build: run(runtime, ["build"], dir),
      };
      for (const [phase, r] of Object.entries(phases)) {
        if (r.exit !== 0) {
          throw new Error(
            `${label}: \`unify ${phase}\` on the ${template} template exited ${r.exit}, expected 0.\n` +
            `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
          );
        }
      }
      return { dir, phases };
    };

    const b = goldenPath(bun, "bun");
    const n = goldenPath(node, "node");

    for (const phase of ["init", "dry", "build"]) {
      for (const stream of ["stdout", "stderr"]) {
        const fromBun = scrub(b.phases[phase][stream], b.dir);
        const fromNode = scrub(n.phases[phase][stream], n.dir);
        if (fromBun !== fromNode) {
          throw new Error(
            `${template}: \`unify ${phase}\` wrote different ${stream} under the two runtimes.\n` +
            `bun:\n${fromBun}\nnode:\n${fromNode}`,
          );
        }
      }
    }

    // The scaffold first: `init` writing different bytes would make every
    // later comparison a comparison of two different sites.
    expectIdenticalTrees(snapshot(join(b.dir, "src")), snapshot(join(n.dir, "src")), `${template} scaffold (src/)`);
    const published = snapshot(join(b.dir, "dist"));
    if (published.size === 0) throw new Error(`${template}: bun published nothing, so there is no parity to check`);
    expectIdenticalTrees(published, snapshot(join(n.dir, "dist")), `${template} published output (dist/)`);
  }, TEST_MS);
}

test("§33.2 under node — the generator runs on node's own execPath, and P29 carries the author's message", () => {
  const node = requireNode();
  const dir = mkdtempSync(join(work, "generate-"));
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
process.stdout.write("generator ran\\n");
writeFileSync(join(generatedDir, "made.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Made</title><meta name="description" content="Made by a generator."></head><body><h1>Made</h1><p>root=\${sourceRoot}</p></body></html>\\n\`);
`);

  const ok = run(node, ["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], dir);
  if (ok.exit !== 0) throw new Error(`--generate must work under node:\n${ok.stdout}\n${ok.stderr}`);
  const made = readFileSync(join(dir, "dist", "made.html"), "utf8");
  if (!made.includes("<h1>Made</h1>")) throw new Error(`the generated page is wrong:\n${made}`);
  if (!made.includes(join(dir, "src"))) throw new Error(`argv[2] must be the absolute source root:\n${made}`);
  // §33.6 — a generator's own stdout is its business and is passed through.
  if (!ok.stdout.includes("generator ran")) throw new Error(`the generator's stdout must pass through:\n${ok.stdout}`);

  // The failure path. Node wraps a thrown error in a location header and an
  // echo of the offending source line that bun does not print; both are
  // dropped so a P29 reads as one message under either runtime.
  writeFileSync(join(dir, "src", "_scripts", "bad.mjs"), 'throw new Error("boom from the generator");\n');
  const bad = run(node, ["build", "-s", "src", "-o", "dist2", "--generate", "_scripts/bad.mjs"], dir);
  if (bad.exit !== 1) throw new Error(`expected exit 1, got ${bad.exit}:\n${bad.stdout}\n${bad.stderr}`);
  if (existsSync(join(dir, "dist2"))) throw new Error("nothing may publish when the generator failed");
  const line = bad.stderr.split("\n").find((l) => l.includes("problem:")) ?? "";
  if (!line.endsWith("Error: boom from the generator")) {
    throw new Error(
      "P29's detail must END with the generator's own message under node — a location header or an\n" +
      `echoed source line before it means the frame filter missed node's shape:\n${line}`,
    );
  }
}, TEST_MS);

test("the dev server's reload script still never reaches the output directory under node", () => {
  const node = requireNode();
  const dir = mkdtempSync(join(work, "wch06-"));
  const init = run(node, ["init"], dir);
  if (init.exit !== 0) throw new Error(`init failed under node:\n${init.stderr}`);
  const built = run(node, ["build"], dir);
  if (built.exit !== 0) throw new Error(`build failed under node:\n${built.stderr}`);
  // WCH-06 is a property of `build`'s output, and the port rewrote the server
  // that injects the script — so it is worth re-asserting on the runtime whose
  // server is new, over the whole tree rather than one file (§5: unify ships
  // no JavaScript, ever).
  for (const [rel, bytes] of snapshot(join(dir, "dist"))) {
    const text = bytes.toString("utf8");
    if (text.includes("EventSource") || text.includes("__unify_reload__")) {
      throw new Error(`${rel} carries the reload script into published output`);
    }
  }
  if (!statSync(join(dir, "dist", "index.html")).isFile()) throw new Error("node published no index.html");
}, TEST_MS);
