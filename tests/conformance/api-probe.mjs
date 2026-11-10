/**
 * api-probe.mjs — questions about the package's public entry point, asked from
 * outside, for gate G15 (api-equivalence.test.js).
 *
 *   import-only   import the package by name and do nothing else. It must
 *                 print nothing and must not start the CLI (which, with no
 *                 arguments, would build `src/` and write `dist/`).
 *   keys          print the namespace's export names, sorted, as JSON.
 *   deep <spec>   try to import a subpath such as `@fwdslsh/unify/src/core/compose.js`.
 *                 Prints `blocked` when the `exports` map refuses it,
 *                 `reachable` when it resolves.
 */
const [mode, spec] = process.argv.slice(2);

if (mode === "import-only") {
  await import("@fwdslsh/unify");
} else if (mode === "keys") {
  process.stdout.write(`${JSON.stringify(Object.keys(await import("@fwdslsh/unify")).sort())}\n`);
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
