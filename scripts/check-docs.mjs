#!/usr/bin/env bun
// One release pin, one command for PR verification and Pages publishing.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const build = process.argv.slice(2);
if (build.length > 1 || (build.length === 1 && build[0] !== "--build")) {
  throw new Error("Usage: bun scripts/check-docs.mjs [--build]");
}
const version = readFileSync(join(root, "docs/.runtime-version"), "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("docs/.runtime-version must contain one exact stable version, for example 0.11.16");
}
const baseUrl = process.env.SITE_BASE_URL ?? "https://unify.fwdslsh.dev/";
const env = { ...process.env };
delete env.UNIFY_DOCS_CLI;
const tempRoot = join(root, "tmp");
mkdirSync(tempRoot, { recursive: true });
const temp = mkdtempSync(join(tempRoot, "docs-release-"));

function run(command, args, cwd = root, extra = {}) {
  const result = spawnSync(command, args, {
    cwd, env: { ...env, ...extra }, stdio: "inherit", timeout: 300_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`docs compatibility: ${command} ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}`);
  }
}

try {
  console.log(`Documentation compatibility: published @fwdslsh/unify@${version}`);
  // Never install into this repository's node_modules or change its lockfile.
  run("npm", ["install", "--prefix", temp, "--ignore-scripts", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", `@fwdslsh/unify@${version}`]);
  const cli = join(temp, "node_modules/@fwdslsh/unify/src/cli.js");
  const actual = spawnSync(process.execPath, [cli, "--version"], { cwd: root, env, encoding: "utf8", timeout: 30_000 });
  if (actual.status !== 0 || actual.stdout.trim() !== version) {
    throw new Error(`docs compatibility: installed CLI must report ${version}; got ${actual.stdout?.trim() || actual.stderr || actual.error || actual.status}`);
  }
  console.log(`Verified released CLI: ${cli} (${version})`);
  // These suites read their code examples directly from the stable guides.
  // New unreleased API tests remain in the normal checkout suite until release.
  run(process.execPath, ["test", "--preload", "./tests/docs-runtime-preload.mjs",
    "tests/conformance/getting-started.test.js",
    "tests/conformance/recipes.test.js",
    "tests/conformance/generator-recipes.test.js",
    "tests/conformance/template-versions.test.js",
  ], root, { UNIFY_DOCS_CLI: cli });

  const docs = join(root, "examples/unify-docs");
  const output = build.length ? join(docs, "dist") : join(temp, "site");
  run(process.execPath, [cli, "build", "-o", output, "--base-url", baseUrl, "--dry-run", "--strict"], docs);
  run(process.execPath, [cli, "audit", "--base-url", baseUrl, "--strict"], docs);
  if (build.length) run(process.execPath, [cli, "build", "-o", output, "--base-url", baseUrl, "--clean", "--strict"], docs);
  for (const example of ["seed-library", "seed-library-alt", "seed-library-ondemand", "htmx-fragments", "catalog-search-blog"]) {
    const args = [cli, "build", "-o", join(output, "examples", example), "--base-url", `${baseUrl.replace(/\/+$/, "")}/examples/${example}/`, "--clean", "--strict"];
    run(process.execPath, [...args, "--dry-run"], join(root, "examples", example));
    if (build.length) run(process.execPath, args, join(root, "examples", example));
  }
  console.log(`Documentation examples and site verified against released Unify ${version}${build.length ? `; built ${output}` : ""}.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
