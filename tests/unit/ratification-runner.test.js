import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCommittedInputs, standardProviderConfig, sampleEnvironment } from "../../ratification/scripts/run-policy.mjs";
import { executionFailure, runSerial, scoreVerdict } from "../../ratification/scripts/run-state.mjs";
import { privateSeedValues } from "../../ratification/scripts/seed-values.mjs";
import { CHECKS } from "../../ratification/scripts/checks.mjs";

const root = mkdtempSync(join(tmpdir(), "ratify-runner-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("installed providers work without endpoint, adapter or model-limit rewrites", () => {
  const provider = { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://existing.example/v1", apiKey: "fixture" },
    models: { fast: { limit: { context: 102400, output: 4096 } } } };
  const setup = { provider: { existing: provider }, plugin: ["provider-auth-plugin"],
    enabled_providers: ["existing", "anthropic"], disabled_providers: ["disabled"], enterprise: { url: "https://enterprise.example" } };
  const result = standardProviderConfig({ ...setup, instructions: ["private.md"], agent: { private: {} }, mcp: { private: {} } });
  expect(result).toEqual(setup);
  expect(standardProviderConfig({})).toEqual({});
});

test("ordinary provider environments are inherited without name-based bans or rewrites", () => {
  const env = { LAB_AI_BASE_URL: "https://lab.example", OPENAI_BASE_URL: "https://openai.example",
    HTTPS_PROXY: "http://corporate.example", AWS_PROFILE: "test", GOOGLE_APPLICATION_CREDENTIALS: "/credentials.json",
    OPENCODE_API_KEY: "fixture", OPENCODE_AUTH_CONTENT: '{"test":{"type":"api","key":"fixture"}}',
    NODE_EXTRA_CA_CERTS: "/corporate-ca.pem", PATH: "/bin" };
  expect(sampleEnvironment({ ...env, OPENCODE_CONFIG: "/existing.json", OPENCODE_CONFIG_DIR: "/existing",
    OPENCODE_CONFIG_CONTENT: '{"instructions":["private.md"]}' })).toEqual(env);
  expect(sampleEnvironment(env)).toEqual(env);
});

test("committed input check catches container-only edits and extra harness files", () => {
  const repo = join(root, "repo"); mkdirSync(join(repo, "ratification/scripts"), { recursive: true });
  const git = (...args) => {
    const r = Bun.spawnSync({ cmd: ["git", ...args], cwd: repo });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
  };
  git("init", "-q");
  writeFileSync(join(repo, "ratification/scripts/runner.mjs"), "original\n");
  git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  expect(() => assertCommittedInputs(repo)).not.toThrow();
  writeFileSync(join(repo, "ratification/scripts/runner.mjs"), "patched\n");
  expect(() => assertCommittedInputs(repo)).toThrow("per-run");
  git("restore", ".");
  writeFileSync(join(repo, "ratification/scripts/custom.mjs"), "extra\n");
  expect(() => assertCommittedInputs(repo)).toThrow("per-run");
});

test("serial runner checkpoints work and halts after an infrastructure failure", async () => {
  let active = 0, peak = 0;
  const launched = [], checkpoints = [];
  const complete = await runSerial([1, 2, 3].map(n => ({ label: String(n) })), {
    launch: async job => { launched.push(job.label); peak = Math.max(peak, ++active); await Promise.resolve(); active--; return { exit: job.label === "2" ? 1 : 0 }; },
    inspect: job => ({ error: job.label === "2" ? "Cannot connect to API" : null }),
    checkpoint: state => checkpoints.push(state),
  });
  expect(complete).toBe(false); expect(peak).toBe(1); expect(launched).toEqual(["1", "2"]);
  expect(checkpoints.at(-1)).toMatchObject({ status: "interrupted", active: null, lastCompleted: "2" });
});

test("model timeouts and context failures are retained without replacing samples", async () => {
  expect(executionFailure({ exit: 124, timedOut: true }, {})).toBe("timeout");
  expect(executionFailure({ exit: 1 }, { error: "request exceeds the available context size" })).toBe("context-limit");
  const launched = [];
  expect(await runSerial([{ label: "1" }, { label: "2" }], {
    launch: async job => { launched.push(job.label); return { exit: 124, timedOut: true }; },
    inspect: () => ({}), checkpoint: () => {},
  })).toBe(true);
  expect(launched).toEqual(["1", "2"]);
});

test("verdict uses the per-brief bar and never counts pending samples as failures", () => {
  const brief = passed => ({ samples: Array.from({ length: 5 }, (_, i) => ({ model: "test/model", pass: i < passed })) });
  expect(scoreVerdict([brief(4), brief(5)], ["test/model"], 10)).toMatchObject({ barMet: true, exitCode: 0, passed: 9 });
  expect(scoreVerdict([brief(3), brief(5)], ["test/model"], 10)).toMatchObject({ barMet: false, exitCode: 1 });
  expect(scoreVerdict([brief(5)], ["test/model"], 10)).toMatchObject({ complete: false, barMet: null, completed: 5, exitCode: 2 });
});

test("privacy reads immutable expectations against fresh output, not judge's stale output", () => {
  const out = join(root, "privacy"); mkdirSync(out);
  const expected = privateSeedValues({ varieties: [{ keeper_contact: "fixture-private" }, { keeper_contact: "fixture-private" }] });
  expect(expected).toEqual(["fixture-private"]);
  writeFileSync(join(out, "index.html"), "fixture-private");
  expect(CHECKS.privacy({ out, privateValues: expected, judge: { privacy: { valuesChecked: 1, distinctLeaked: 0 } } }).pass).toBe(false);
  writeFileSync(join(out, "index.html"), "public content");
  expect(CHECKS.privacy({ out, privateValues: expected }).pass).toBe(true);
  expect(CHECKS.privacy({ out: null, privateValues: expected }).pass).toBe(false);
});

test("strict audit preserves quoted option values", () => {
  let command;
  CHECKS.auditStrict({ command: './unify build --output "public site" --exclude "a b" --clean', exec: c => { command = c; return { exit: 0, stdout: "", stderr: "" }; } });
  expect(command).toBe('./unify audit --output "public site" --exclude "a b" --strict');
});

test("CLI rejects replacement agents and overrides before inference", () => {
  for (const flag of ["--agent", "--timeout", "--stagger", "--mask", "--base-url"]) {
    const r = Bun.spawnSync({ cmd: ["bun", "ratification/scripts/run-round.mjs", flag, "fixture"] });
    expect(r.exitCode).toBe(2); expect(r.stderr.toString()).toContain("Unknown option");
  }
});
