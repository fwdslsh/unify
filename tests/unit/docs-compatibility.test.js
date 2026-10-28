import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, runCli, writeTree } from "../conformance/support.mjs";

test("the docs preload alone selects the release CLI, without recording checkout coverage", () => {
  const tmp = mkTmp();
  const sentinel = join(tmp, "sentinel.mjs");
  writeTree(tmp, {
    "sentinel.mjs": 'process.stdout.write("docs-runtime-sentinel"); process.exit(17);\n',
    "probe.test.js": `import { test } from "bun:test";
      import { CLI, covers, runCli } from ${JSON.stringify(join(ROOT, "tests/conformance/support.mjs"))};
      test("selected CLI", async () => {
        if (globalThis.__unifyDocsCli) covers("DOCS-PROBE-MUST-NOT-REACH-LEDGER");
        console.log(JSON.stringify({ cli: CLI, result: await runCli(["--version"], ${JSON.stringify(tmp)}) }));
      });\n`,
  });
  const probe = (preload, cli = sentinel) => spawnSync(process.execPath,
    ["test", ...(preload ? ["--preload", join(ROOT, "tests/docs-runtime-preload.mjs")] : []), join(tmp, "probe.test.js")],
    { cwd: ROOT, env: { ...process.env, UNIFY_DOCS_CLI: cli }, encoding: "utf8", timeout: 30_000 });

  const normal = probe(false);
  if (normal.status !== 0) throw new Error(`${normal.stdout}\n${normal.stderr}`);
  expect(normal.status).toBe(0);
  const checkout = JSON.parse(normal.stdout.split("\n").find((line) => line.startsWith('{"cli":')));
  expect(checkout.cli).toBe(join(ROOT, "src/cli.js"));
  expect(checkout.result.exit).toBe(0);
  expect(checkout.result.stdout.trim()).toBe(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);

  const ledger = join(ROOT, ".conformance-ledger.jsonl");
  const before = existsSync(ledger) ? readFileSync(ledger, "utf8") : "";
  const selected = probe(true);
  expect(selected.status).toBe(0);
  const released = JSON.parse(selected.stdout.split("\n").find((line) => line.startsWith('{"cli":')));
  expect(released.cli).toBe(sentinel);
  expect(released.result.exit).toBe(17);
  expect(released.result.stdout).toBe("docs-runtime-sentinel");
  expect(existsSync(ledger) ? readFileSync(ledger, "utf8") : "").toBe(before);

  const absent = probe(true, join(tmp, "missing.mjs"));
  expect(absent.status).not.toBe(0);
  expect(absent.stderr).toContain("installed release's absolute CLI path");
});

test("the docs site distinguishes runtime, revision, development specs and unreleased pages", async () => {
  const tmp = mkTmp();
  for (const path of ["docs", "templates/docs", "examples/unify-docs"]) {
    cpSync(join(ROOT, path), join(tmp, path), { recursive: true, filter: (file) => !file.includes("/dist/") && !file.endsWith("/dist") });
  }
  writeTree(tmp, {
    // No author callout: the site must still label this directory automatically.
    "docs/unreleased/probe.md": "---\ntitle: Pending example\ndescription: An unreleased example.\n---\n# Pending example\n\nPending content.\n",
  });
  const result = await runCli(["build", "--strict"], join(tmp, "examples/unify-docs"));
  if (result.exit !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  const out = join(tmp, "examples/unify-docs/dist");
  const version = readFileSync(join(ROOT, "docs/.runtime-version"), "utf8").trim();
  const files = readdirSync(out, { recursive: true }).filter((file) => file.endsWith(".html"));
  expect(files.length).toBeGreaterThan(20);
  for (const file of files) {
    const html = readFileSync(join(out, file), "utf8");
    expect(html).toContain(`Released guidance: Unify ${version}`);
    expect(html).toContain("Docs revision:");
  }
  expect(readFileSync(join(out, "docs/unreleased/probe/index.html"), "utf8"))
    .toContain(`<strong>Unreleased:</strong> This page describes development behavior, not released Unify ${version}.`);
  expect(readFileSync(join(out, "docs/conformance-spec/index.html"), "utf8")).toContain("<strong>Development reference:</strong>");
  expect(readFileSync(join(out, "docs/product-spec/index.html"), "utf8")).toContain("<strong>Development reference:</strong>");
}, 30_000);
