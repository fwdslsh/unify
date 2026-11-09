import { spawnSync } from "node:child_process";

export const POLICY = "standard-opencode-v3";
const fail = (message) => { throw new Error(`Ratification policy: ${message}`); };

/** No container-only patches, uncommitted briefs, engine changes or extra harness modules. */
export function assertCommittedInputs(repo) {
  const paths = ["ratification", "src", "docs/authoring-rules.md", "package.json", "bun.lock", "bun.lockb"];
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: repo, encoding: "utf8" });
  if (status.status !== 0 || status.error) fail("cannot verify the checked-in runner.");
  if (status.stdout.trim()) fail("commit and review changes before running; per-run harness, brief and engine patches are forbidden.");
}

/** Keep provider definitions, not plugins that can modify prompts, tools or compaction. */
export function standardProviderConfig(config) {
  return Object.fromEntries(["provider", "enterprise", "enabled_providers", "disabled_providers"]
    .filter(key => config[key] !== undefined).map(key => [key, config[key]]));
}

export function parseModels(text) {
  return [...text.matchAll(/^(\S+\/\S+)\r?\n(\{[\s\S]*?\r?\n\})\r?$/gm)]
    .map(m => ({ ...JSON.parse(m[2]), id: m[1] }));
}

/** Save only nonsecret limits, never provider options or resolved credentials. */
export function modelSettings(models, id, expectedContext) {
  const model = models.find(m => m.id === id);
  if (!model) fail(`OpenCode cannot load ${id} without external plugins. Configure a native OpenCode provider before running.`);
  const { context, input, output } = model.limit ?? {};
  if (!Number.isInteger(context) || context <= 0 || !Number.isInteger(output) || output <= 0) {
    fail(`${id} must declare positive context and output limits in its OpenCode model configuration.`);
  }
  if (expectedContext !== undefined && context !== expectedContext) {
    fail(`${id} has context ${context}; expected ${expectedContext}. Correct the normal OpenCode model configuration before running. No inference was started.`);
  }
  return { context, ...(input !== undefined ? { input } : {}), output };
}

/** An absolute instructions path is reloaded by OpenCode even after compaction. */
export const SAMPLE_INSTRUCTIONS = "/tmp/sandbox/AGENTS.md";

export function sampleConfig(user, model) {
  return {
    $schema: "https://opencode.ai/config.json",
    ...standardProviderConfig(user),
    model,
    small_model: model,
    instructions: [SAMPLE_INSTRUCTIONS],
    permission: {
      read: "allow", edit: "allow", glob: "allow", grep: "allow", list: "allow", bash: "allow", todowrite: "allow", lsp: "allow",
      task: "deny", skill: "deny", webfetch: "deny", websearch: "deny", question: "deny", doom_loop: "deny", external_directory: "deny",
    },
    autoupdate: false,
    share: "disabled",
    snapshot: false,
    formatter: false,
    lsp: false,
  };
}

/** Config selectors were already resolved by OpenCode; don't reload agent instructions in samples. */
export function sampleEnvironment(env) {
  const { OPENCODE_CONFIG, OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_CONTENT, ...inherited } = env;
  return inherited;
}
