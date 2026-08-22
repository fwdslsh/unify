/**
 * watchdog.mjs — the first thing `bun test` loads (bunfig.toml preload #1),
 * and deliberately the simplest file in the suite: no imports at all, so there
 * is nothing it can fail to load.
 *
 * It bounds the runner process. Bun's per-test timeout only covers time spent
 * inside a test, and the hang this repository hit (testing-strategy §8) happens
 * *between* test files, where nothing was bounded and the runner spins at 100%
 * CPU forever. The timer still fires during that spin — the runner's event loop
 * goes on servicing timers while it hangs — which is the whole reason a timer
 * is enough here.
 *
 * It is loaded before preflight.mjs on purpose. Preflight is what makes the
 * known hang fast, but preflight has imports, and a parse error in preflight
 * itself or in module-graph.mjs reopens the very hang it exists to close. This
 * file is what still bounds that case, and it can only keep that property by
 * importing nothing.
 */

// A budget must be adjustable for a genuinely slower machine, and this is the
// one knob in the suite that an environment variable is allowed to hold: it
// cannot switch the guard off (there is no value meaning "never"), and the
// test that exercises the watchdog has to be able to ask for a budget short
// enough to observe. A malformed or empty value falls back to the default
// rather than becoming Number("") === 0, which would kill every run instantly
// — a guard that fires on a green suite is a guard that gets deleted.
const requested = Number(process.env.UNIFY_TEST_BUDGET_MS);
const BUDGET_MS = Number.isFinite(requested) && requested > 0 ? requested : 600_000;

const watchdog = setTimeout(() => {
  process.stderr.write(
    `watchdog: the suite exceeded its ${BUDGET_MS} ms budget and was killed — a hang is a\n` +
    "failure, never a wait (docs/testing-strategy.md §5). The last file the runner printed is\n" +
    "where to look; re-run it alone. Raise UNIFY_TEST_BUDGET_MS only for a machine that is\n" +
    "genuinely slower, never to make this message go away.\n",
  );
  process.exit(3);
}, BUDGET_MS);
// Defensive: the run must never be lengthened by the thing that bounds it.
watchdog.unref?.();

// Evidence that THIS run is guarded, readable from inside it. A test can copy
// these files into a scratch project and prove they work there while the real
// suite quietly runs unguarded — a deleted `preload` line in bunfig.toml would
// be invisible. tests/unit/preflight.test.js asserts on this marker, so the
// wiring is pinned where it is used rather than where it is declared.
globalThis.__unifyTestWatchdog = { budgetMs: BUDGET_MS };
