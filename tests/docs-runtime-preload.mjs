// Explicitly loaded only by scripts/check-docs.mjs. Normal bun test always
// exercises the checkout, even if UNIFY_DOCS_CLI is present in its environment.
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";

const cli = process.env.UNIFY_DOCS_CLI;
if (!cli || !isAbsolute(cli) || !existsSync(cli)) {
  throw new Error("docs compatibility: UNIFY_DOCS_CLI must name the installed release's absolute CLI path");
}
globalThis.__unifyDocsCli = cli;
