#!/usr/bin/env bun
// Integration regression for the installed OpenCode CLI; requires Linux mount namespaces.
// A local HTTP test stub forces compaction. No real model, credentials, or ratification results.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Database } from "bun:sqlite";
import { sampleConfig, sampleEnvironment } from "./run-policy.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(dirname(repo), ".ratification-opencode-test-"));
const sample = join(root, "sample");
const state = join(root, "state");
const marker = join(root, "plugin-loaded");
const instructions = readFileSync(join(repo, "ratification/briefs/PROMPT.md"), "utf8")
  + "\n---\n\nBRIEF_SENTINEL: build the fixture website.\n";
let builds = 0, compactions = 0;
const seen = [];
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const body = await request.json();
    const building = Boolean(body.tools?.length);
    seen.push({ building, messages: body.messages });
    if (building) builds++; else compactions++;
    const first = building && builds === 1;
    const delta = first
      ? { tool_calls: [{ index: 0, id: "call_fixture", type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "printf fixture", description: "Regression fixture" }) } }] }
      : { content: building ? "Fixture finished." : "The website needs more work." }; // Deliberately loses REPORT.md.
    const chunk = { id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture",
      choices: [{ index: 0, delta, finish_reason: null }] };
    const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: first ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: first ? 31000 : 100, completion_tokens: 20, total_tokens: first ? 31020 : 120 } };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } });
  },
});
try {
  mkdirSync(sample); mkdirSync(state);
  writeFileSync(join(sample, "AGENTS.md"), instructions);
  const plugin = join(root, "forbidden-plugin.mjs");
  writeFileSync(plugin, `import { writeFileSync } from "node:fs"; export const plugin = async () => { writeFileSync(${JSON.stringify(marker)}, "loaded"); return {}; };\n`);
  const config = sampleConfig({ provider: { fixture: {
    npm: "@ai-sdk/openai-compatible", name: "Regression fixture",
    options: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "nonsecret-test-fixture" },
    models: { fixture: { name: "Fixture", limit: { context: 32768, output: 8192 } } },
  } } }, "fixture/fixture");
  // Even if an external plugin reaches merged configuration, --pure must prevent execution.
  config.plugin = [pathToFileURL(plugin).href];
  const env = { ...sampleEnvironment(process.env), OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_AUTH_CONTENT: "{}", OPENCODE_DISABLE_PROJECT_CONFIG: "1", OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_AUTOUPDATE: "1", RATIFY_MASK: "" };
  const child = spawn(join(repo, "ratification/scripts/isolate.sh"), [sample, repo, state,
    "timeout", "90", "opencode", "run", "--pure", "--format", "json", "--model", "fixture/fixture", "--title", "Regression fixture"],
    { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  child.stdin.end("Build the fixture website."); // Report requirement is only in persistent instructions.
  const exit = await new Promise((done, reject) => { child.on("error", reject); child.on("close", done); });
  assert.equal(exit, 0, stderr + stdout.slice(-2000));
  assert.equal(existsSync(marker), false, "external plugin must not execute");
  assert.ok(compactions >= 1, "fixture must actually trigger compaction");
  const db = new Database(join(state, "opencode.db"), { readonly: true });
  try {
    assert.ok(db.query("SELECT data FROM part").all().some(row => JSON.parse(row.data).type === "compaction"),
      "OpenCode must record actual compaction, not just a background title request");
  } finally { db.close(); }
  assert.equal(builds, 2, "agent must resume after compaction");
  for (const request of seen.filter(r => r.building)) {
    const system = request.messages.filter(m => m.role === "system").map(m => m.content).join("\n");
    assert.ok(system.includes(instructions), "original instructions must survive verbatim before AND after compaction");
  }
  assert.equal(existsSync(join(sample, "REPORT.md")), false, "harness must never fabricate the report");
  console.log("PASS: real OpenCode retained the original contract and brief after forced compaction; --pure blocked the external plugin. No model inference used.");
} finally {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
}
