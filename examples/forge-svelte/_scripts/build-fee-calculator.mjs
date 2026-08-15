// Compiles components/FeeCalculator.svelte (the volunteer developer's source of
// truth) into a plain browser bundle that unify ships byte-for-byte.
// Re-run this whenever FeeCalculator.svelte changes, then run `./unify build`.
import { build } from "esbuild";
import esbuildSvelte from "esbuild-svelte";

await build({
  entryPoints: ["_scripts/fee-calculator-entry.js"],
  bundle: true,
  format: "iife",
  target: "es2018",
  outfile: "src/assets/js/fee-calculator.js",
  plugins: [esbuildSvelte()],
  logLevel: "info",
});
