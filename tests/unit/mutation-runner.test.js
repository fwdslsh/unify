/**
 * Unit tests for tests/conformance/run-mutations.mjs (Tier 3).
 *
 * This is test infrastructure that review reports now cite as evidence, and its
 * first version was worse than useless: it treated any non-zero exit as a kill,
 * so on a RED tree every mutation reported KILLED and the sweep exited 0 — the
 * answer inverting exactly when it mattered. An independent reviewer found that
 * by running a comment-only mutation against a deliberately red tree.
 *
 * The decision is exported as `classify` precisely so that scenario is a fast
 * assertion rather than a thirteen-minute experiment. The orchestration around
 * it (copy the tree, apply, run, revert) stays thin enough to read.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classify, compareBaselines, failingTests, parseMutations, runtimeErrorIn, unescapeCell } from "../conformance/run-mutations.mjs";

/** A suite run that failed with these test names. */
const red = (...names) => ({
  exitCode: 1,
  output: `bun test v1.3.11\n${names.map((n) => `(fail) ${n} [1.00ms]`).join("\n")}\n 800 pass\n ${names.length} fail\n`,
  timedOut: false,
});
const green = { exitCode: 0, output: "bun test v1.3.11\n 816 pass\n 0 fail\n", timedOut: false };

describe("classify — the logic that inverted", () => {
  test("a mutation nothing notices is SURVIVED, not killed", () => {
    expect(classify(green).outcome).toBe("SURVIVED");
  });

  test("a mutation a real test catches is KILLED, naming the test", () => {
    const v = classify(red("REF-08: %2F names one segment"));
    expect(v.outcome).toBe("KILLED");
    expect(v.killedBy).toEqual(["REF-08: %2F names one segment"]);
  });

  test("THE REGRESSION: on a red tree, a mutation nothing notices is NOT killed", () => {
    // The reviewer's exact scenario: one unrelated pre-existing failure, and a
    // mutation that edits only a comment. The first version reported KILLED and
    // exited 0 for every row.
    const baselineFailures = ["an unrelated pre-existing failure"];
    const v = classify({ ...red("an unrelated pre-existing failure"), baselineFailures });
    expect(v.outcome).not.toBe("KILLED");
    expect(v.outcome).toBe("CRASHED");
    expect(v.killedBy).toEqual([]);
  });

  test("a kill must name a test that was passing before", () => {
    const baselineFailures = ["already broken"];
    expect(classify({ ...red("already broken"), baselineFailures }).outcome).not.toBe("KILLED");
    expect(classify({ ...red("already broken", "newly broken"), baselineFailures }).killedBy).toEqual(["newly broken"]);
  });

  test("an OBSERVED-flaky test alone never counts as a kill", () => {
    const flakyTests = ["§16 dev server > WCH-05 — a taken port is a fatal environment fault"];
    const v = classify({ ...red(flakyTests[0]), flakyTests });
    expect(v.outcome).not.toBe("KILLED");
    expect(v.note).toContain("flaky");
  });

  test("a flaky failure alongside a real one still credits only the real one", () => {
    const flakyTests = ["§16 dev server > WCH-05 — a taken port is a fatal environment fault"];
    const v = classify({ ...red(flakyTests[0], "REF-08: real"), flakyTests });
    expect(v.outcome).toBe("KILLED");
    expect(v.killedBy).toEqual(["REF-08: real"]);
  });

  test("a deterministic §16 behaviour test is NOT excluded — flakiness is measured, not named", () => {
    // The regression this replaced: a name-matched list excluded every test in
    // watch-dev.test.js, so WCH-02 and WCH-03 — deterministic filesystem
    // assertions — could never credit a kill, and the Tier-3 unit test got the
    // credit instead. That inverts testing-strategy §2's authority order.
    const v = classify(red("§16 watch > WCH-02 — watch output equals a fresh build"));
    expect(v.outcome).toBe("KILLED");
    expect(v.killedBy).toEqual(["§16 watch > WCH-02 — watch output equals a fresh build"]);
  });

  test("a non-zero exit with no failing test is CRASHED — a bad replacement is not evidence", () => {
    const v = classify({ exitCode: 1, output: "SyntaxError: Unexpected token\n", timedOut: false });
    expect(v.outcome).toBe("CRASHED");
    expect(v.note).toContain("does not parse");
  });

  test("a timeout is its own outcome, never a kill", () => {
    const v = classify({ exitCode: null, output: "", timedOut: true });
    expect(v.outcome).toBe("TIMEOUT");
    expect(v.note).toContain("hang");
  });
});

describe("classify — a crash is not a kill", () => {
  // The second way this file's answer could invert, found by a reviewer twice.
  // Both times a row mutated a `message:` interpolation whose variable the
  // replacement left unbound, so the CLI died with "raw is not defined" and
  // the tests "failed" at a corpse. The runner called that KILLED, and the
  // rule the row named was tested by nothing — for two review rounds.
  const crashOutput = [
    "unify: raw is not defined",
    "(fail) SIT-06: a namespace-prefixed loc is a loc [12ms]",
    "(fail) SIT-01: without --base-url an authored sitemap is an asset [9ms]",
    " 907 pass",
    " 2 fail",
  ].join("\n");

  test("a mutant that dies of a ReferenceError is CRASHED, not KILLED", () => {
    const r = classify({ exitCode: 1, output: crashOutput, timedOut: false });
    expect(r.outcome).toBe("CRASHED");
    expect(r.killedBy).toEqual([]);
    // The note has to name the error, or a reader cannot tell this apart from
    // the older "does not parse" case it shares an outcome with.
    expect(r.note).toContain("raw is not defined");
  });

  test("a real detection is still KILLED, with the tests that caught it", () => {
    const output = [
      "(fail) ROB-02: the diagnostic quotes the author's own line [14ms]",
      " 909 pass",
      " 1 fail",
    ].join("\n");
    const r = classify({ exitCode: 1, output, timedOut: false });
    expect(r.outcome).toBe("KILLED");
    expect(r.killedBy).toEqual(["ROB-02: the diagnostic quotes the author's own line"]);
  });

  test("a survivor is untouched by the check", () => {
    expect(classify({ exitCode: 0, output: " 910 pass\n 0 fail", timedOut: false }).outcome).toBe("SURVIVED");
  });

  test("the signatures are the ones this class produces, and prose is not one", () => {
    for (const line of [
      "unify: raw is not defined",
      "unify: isElement is not defined",
      "TypeError: parse is not a function",
      "Cannot read properties of undefined (reading 'value')",
      "null is not an object (evaluating 'm[1]')",
    ]) {
      expect(runtimeErrorIn(line)).not.toBeNull();
    }
    // A diagnostic that merely talks about absence must not read as a crash —
    // §14.1's own wording is full of "does not resolve" and "not found".
    for (const line of [
      "src/index.html:3: problem: /gone.html does not resolve to any emitted file",
      "  fix: check the path spelling and casing",
      "(fail) AUD-07: no evidence value can break the two-line report [11ms]",
      "src/a.html:1: problem: include not found: /_includes/nav.html",
    ]) {
      expect(runtimeErrorIn(line)).toBeNull();
    }
  });
});

describe("failingTests", () => {
  test("names every failure, with or without a duration suffix", () => {
    expect(failingTests("(fail) one [1.00ms]\n(fail) two\nnoise\n")).toEqual(["one", "two"]);
  });
  test("finds none in green output", () => {
    expect(failingTests(green.output)).toEqual([]);
  });
});

describe("unescapeCell", () => {
  test("decodes the escapes a TSV cell needs", () => {
    expect(unescapeCell("a\\nb")).toBe("a\nb");
    expect(unescapeCell("a\\tb")).toBe("a\tb");
    expect(unescapeCell("a\\|b")).toBe("a|b");
  });

  test("an escaped backslash survives — a chained replace mis-decodes this", () => {
    // `\\` then `n` means backslash + n, not backslash + newline. The earlier
    // chained implementation applied the backslash rule last and got it wrong.
    expect(unescapeCell("a\\\\nb")).toBe("a\\nb");
    expect(unescapeCell("decoded.includes(\"\\\\\\\\\")")).toBe('decoded.includes("\\\\")');
  });
});

describe("parseMutations", () => {
  test("reads rows and skips the header", () => {
    const rows = parseMutations("file\tid\told\tnew\twhy\nsrc/a.js\tx-1\tfoo\tbar\tbecause\n");
    expect(rows).toEqual([{ file: "src/a.js", id: "x-1", old: "foo", next: "bar", why: "because" }]);
  });

  test("every committed row names a src file, an id, and the rule it defends", () => {
    const rows = parseMutations(readFileSync(new URL("../conformance/mutations.tsv", import.meta.url), "utf8"));
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      expect(r.file).toStartWith("src/");
      expect(r.id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
      expect(r.why.length).toBeGreaterThan(20); // a row without a rule is a mutation nobody can act on
      expect(r.old).not.toBe(r.next);
    }
  });
});

describe("compareBaselines — flakiness by observation", () => {
  test("a stable green pair yields no flaky and no hard failures", () => {
    expect(compareBaselines([], [])).toEqual({ flaky: [], hard: [] });
  });

  test("a test failing in BOTH runs is genuinely red, not flaky", () => {
    expect(compareBaselines(["a"], ["a"])).toEqual({ flaky: [], hard: ["a"] });
  });

  test("a test differing between two identical runs is flaky by observation", () => {
    expect(compareBaselines(["port"], [])).toEqual({ flaky: ["port"], hard: [] });
    expect(compareBaselines([], ["port"])).toEqual({ flaky: ["port"], hard: [] });
  });

  test("a mixed pair separates the two, deterministically ordered", () => {
    const r = compareBaselines(["real", "port"], ["real"]);
    expect(r.hard).toEqual(["real"]);
    expect(r.flaky).toEqual(["port"]);
  });

  test("one environmental flake does not abort the sweep — only a hard failure does", () => {
    // The habit this prevents: a fifteen-minute check that aborts on a known
    // flake is one people re-run until it passes, which is M2 by another route.
    expect(compareBaselines(["§16 dev server > WCH-05"], []).hard).toEqual([]);
  });
});
