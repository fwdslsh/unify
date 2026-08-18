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
import { classify, failingTests, parseMutations, unescapeCell } from "../conformance/run-mutations.mjs";

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

  test("an environment-flaky test alone never counts as a kill", () => {
    const v = classify(red("§16 dev server > WCH-06 — the reload script is served"));
    expect(v.outcome).not.toBe("KILLED");
    expect(v.note).toContain("flaky");
  });

  test("a flaky failure alongside a real one still credits only the real one", () => {
    const v = classify(red("§16 dev server > WCH-06 — the reload script is served", "REF-08: real"));
    expect(v.outcome).toBe("KILLED");
    expect(v.killedBy).toEqual(["REF-08: real"]);
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
