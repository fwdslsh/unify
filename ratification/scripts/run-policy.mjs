import { spawnSync } from "node:child_process";

export const POLICY = "standard-opencode-v1";
const fail = (message) => { throw new Error(`Ratification policy: ${message}`); };

/** Reject run-specific routing/config injection before invoking OpenCode. */
export function assertStandardEnvironment(env) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (/^(https?|all|socks)_proxy$/i.test(key) ||
        /^OPENCODE_(CONFIG(?:_.*)?|AUTH_CONTENT)$/.test(key) ||
        /(?:^|_)(?:BASE_URL|API_BASE|ENDPOINT)$/.test(key) ||
        ["RATIFY_MASK", "NODE_OPTIONS", "BUN_OPTIONS"].includes(key)) {
      fail(`${key} is not allowed; use the installed provider configuration directly. Do not add a proxy or override.`);
    }
  }
}

/** No container-only patches, uncommitted briefs, engine changes or extra harness modules. */
export function assertCommittedInputs(repo) {
  const paths = ["ratification", "src", "docs/authoring-rules.md", "package.json", "bun.lock", "bun.lockb"];
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...paths], { cwd: repo, encoding: "utf8" });
  if (status.status !== 0 || status.error) fail("cannot verify the checked-in runner.");
  if (status.stdout.trim()) fail("commit and review changes before running; per-run harness, brief and engine patches are forbidden.");
}

/** Reuse the selected installed provider verbatim. Never create an endpoint or adapter. */
export function standardProviderConfig(model, config) {
  const provider = model.split("/")[0];
  const configured = config.provider?.[provider];
  return {
    ...(configured ? { provider: { [provider]: configured } } : {}),
    enabled_providers: [provider],
  };
}
