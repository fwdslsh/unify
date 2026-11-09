import { spawnSync } from "node:child_process";

export const POLICY = "standard-opencode-v2";
const fail = (message) => { throw new Error(`Ratification policy: ${message}`); };

/** No container-only patches, uncommitted briefs, engine changes or extra harness modules. */
export function assertCommittedInputs(repo) {
  const paths = ["ratification", "src", "docs/authoring-rules.md", "package.json", "bun.lock", "bun.lockb"];
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: repo, encoding: "utf8" });
  if (status.status !== 0 || status.error) fail("cannot verify the checked-in runner.");
  if (status.stdout.trim()) fail("commit and review changes before running; per-run harness, brief and engine patches are forbidden.");
}

/** OpenCode resolves providers, authentication plugins and operator allow/deny lists. */
export function standardProviderConfig(config) {
  return Object.fromEntries(["provider", "plugin", "enterprise", "enabled_providers", "disabled_providers"]
    .filter(key => config[key] !== undefined).map(key => [key, config[key]]));
}

/** Config selectors were already resolved by OpenCode; don't reload agent instructions in samples. */
export function sampleEnvironment(env) {
  const { OPENCODE_CONFIG, OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_CONTENT, ...inherited } = env;
  return inherited;
}
