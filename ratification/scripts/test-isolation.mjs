#!/usr/bin/env bun
// Integration regression: requires the same Linux mount namespaces as a real round.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// The sentinel must be outside the repository, which isolate.sh always hides.
const root = mkdtempSync(join(dirname(repo), ".ratification-isolation-"));
const round = join(root, "round");
const hidden = join(root, "hidden");
const sample = join(round, "audit-handover", "fixture-1");
const script = join(repo, "ratification/scripts/isolate.sh");
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2));
const run = (args, env = process.env) => {
  const r = spawnSync(args[0], args.slice(1), { cwd: repo, env, encoding: "utf8" });
  assert.ifError(r.error);
  return r;
};

try {
  for (const path of [hidden, join(round, "bin"), join(sample, "site"), join(sample, "scripts"), join(round, "audit-handover/.harness/fixture-1")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(hidden, "sentinel"), "Harmless test fixture");
  const compile = run(["bun", "build", "--compile", join(repo, "src/cli.js"), "--outfile", join(round, "bin/unify")]);
  assert.equal(compile.status, 0, compile.stderr);
  linkSync(join(round, "bin/unify"), join(sample, "unify"));
  writeFileSync(join(sample, "site/index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mask regression</title><meta name="description" content="Tests the isolation of build and audit commands."></head><body><h1>Mask regression</h1></body></html>');
  writeFileSync(join(sample, "unify.yaml"), "source: site\noutput: public site\ngenerate: scripts/check-mask.mjs\n");
  writeFileSync(join(sample, "scripts/check-mask.mjs"), `import { existsSync } from "node:fs";\nif (existsSync(${JSON.stringify(join(hidden, "sentinel"))})) throw new Error("EXTRA_MASK_WAS_LOST");\n`);
  writeFileSync(join(sample, "scripts/prepare.mjs"), `import { existsSync, writeFileSync } from "node:fs";\nif (existsSync(${JSON.stringify(join(hidden, "sentinel"))})) throw new Error("PREPARATION_MASK_WAS_LOST");\nwriteFileSync("prepared.txt", "Prepared in the copied sample");\n`);
  json(join(sample, "package.json"), { private: true, scripts: {
    prepublish: "node scripts/prepare.mjs",
    publish: "./unify build",
    postpublish: "test -f prepared.txt",
  } });
  writeFileSync(join(sample, "REPORT.md"), "Exact publish command:\n```sh\nnpm run publish\n```\n\nVerification:\n```sh\n./unify build --dry-run --strict\n```\n");
  json(join(round, "audit-handover/.harness/fixture-1/exit.json"), { exit: 0 });

  const brief = readFileSync(join(repo, "ratification/briefs/audit-handover/BRIEF.md"), "utf8");
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const manifest = {
    id: "isolation-regression", created: new Date().toISOString(),
    unify: { version: "fixture", commit: "fixture", ref: "fixture" },
    rules: { sha256: sha("") }, prompt: { sha256: sha("") },
    agent: "fixture", models: ["fixture"], samplesPerModel: 1,
    isolation: { mode: "mount namespace", probe: "fixture", masks: [hidden] },
    briefs: [{ name: "audit-handover", sha256: sha(brief), samples: [{ name: "fixture-1", model: "fixture" }] }],
  };
  json(join(round, "round.json"), manifest);

  const control = run([script, sample, repo, join(root, "control"), "./unify", "build", "--strict"], { ...process.env, RATIFY_MASK: "" });
  assert.notEqual(control.status, 0, "control must see the unmasked sentinel");
  assert.match(control.stdout + control.stderr, /EXTRA_MASK_WAS_LOST/);

  // The saved round must override both an absent and a conflicting caller mask.
  for (const callerMask of ["", join(root, "unrelated")]) {
    mkdirSync(join(root, "unrelated"), { recursive: true });
    const judged = run(["bun", join(repo, "ratification/scripts/run-round.mjs"), "--rejudge", round], { ...process.env, RATIFY_MASK: callerMask });
    assert.equal(judged.status, 1, "the fixture deliberately omits posts/share cards");
    const result = JSON.parse(readFileSync(join(round, "results.json"), "utf8")).briefs[0].samples[0];
    for (const id of ["strict-build", "fresh-build", "audit-strict"]) {
      const check = result.checks.find((c) => c.id === id);
      assert.equal(check.pass, true, `${id}: ${check.detail}`);
    }
    assert.equal(result.freshBuild.exit, 0);
    const judgedSample = JSON.parse(readFileSync(join(round, "audit-handover/judge-results.json"), "utf8")).samples[0];
    assert.equal(judgedSample.chosenCommand, "npm run publish");
    assert.equal(judgedSample.preparation.exit, 0);
    assert.equal(judgedSample.outputDir, "public site");
    assert.equal(existsSync(join(round, "audit-handover/.build/fixture-1/public site/index.html")), true);
    assert.equal(existsSync(join(sample, "public site/index.html")), false, "rejudging must preserve the original sample");
    assert.equal(existsSync(join(sample, "prepared.txt")), false, "npm preprocessing must preserve the original sample");
  }
  console.log("PASS: recorded masks reach npm preprocessing, strict judging, fresh builds and audit callbacks; originals are preserved and saved output is used.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
