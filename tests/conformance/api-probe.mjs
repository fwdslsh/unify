/**
 * api-probe.mjs — two questions about the package's public entry point, asked
 * from outside, for gate G15 (api-equivalence.test.js).
 *
 *   import-only   import the package by name and do nothing else. It must
 *                 print nothing and must not start the CLI (which, with no
 *                 arguments, would build `src/` and write `dist/`).
 *   keys          print the package namespace's export names, sorted, as JSON.
 *   unknown-options  call each function with an option it does not have and
 *                 print the status each returns, as JSON.
 *   deep <spec>   try to import a subpath such as `@fwdslsh/unify/src/core/compose.js`.
 *                 Prints `blocked` when the `exports` map refuses it,
 *                 `reachable` when it resolves.
 */
const [mode, spec] = process.argv.slice(2);

if (mode === "import-only") {
  const api = await import("@fwdslsh/unify");
  if (typeof api.build !== "function" || typeof api.audit !== "function") throw new Error("build/audit missing from the entry point");
} else if (mode === "keys") {
  process.stdout.write(`${JSON.stringify(Object.keys(await import("@fwdslsh/unify")).sort())}\n`);
} else if (mode === "unknown-options") {
  const { build, audit } = await import("@fwdslsh/unify");
  const calls = {
    "build:audit": () => build({ audit: true }),
    "build:external": () => build({ external: true }), "build:format": () => build({ format: "json" }),
    "build:config": () => build({ config: true }), "audit:config": () => audit({ config: true }), "build:write": () => build({ write: false }),
    "audit:clean": () => audit({ clean: true }), "audit:dryRun": () => audit({ dryRun: true }),
    "audit:audit": () => audit({ audit: true }), "audit:write": () => audit({ write: false }),
    "audit:format": () => audit({ format: "json" }),
  };
  const out = {};
  for (const [name, call] of Object.entries(calls)) out[name] = (await call()).status;
  process.stdout.write(`${JSON.stringify(out)}\n`);
} else if (mode === "deep") {
  try {
    await import(spec);
    process.stdout.write("reachable\n");
  } catch {
    process.stdout.write("blocked\n");
  }
} else {
  throw new Error(`unknown mode: ${mode}`);
}
