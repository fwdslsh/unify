/**
 * Unit tests for src/core/diagnostics.js (Tier 3 — no conformance authority;
 * testing-strategy §2). The subject here is the reporting CHANNEL's own
 * contract from conformance-spec §14.1: the `FILE:LINE: SEVERITY: ` prefix,
 * the deterministic path-then-line order, and — the reason this file exists —
 * deduplication: two diagnostics that would print the same bytes are one
 * diagnostic, however many times the pipeline walked into it.
 */
import { describe, expect, test } from "bun:test";
import { Reporter } from "../../../src/core/diagnostics.js";

function captureReporter({ strict = false } = {}) {
  const err = [];
  const out = [];
  const reporter = new Reporter({
    strict,
    stderr: { write: (s) => err.push(s) },
    stdout: { write: (s) => out.push(s) },
  });
  return { reporter, err, out };
}

describe("Reporter deduplication (§14.1)", () => {
  test("byte-identical located diagnostics collapse to one line", () => {
    // The measured shape: one broken href in a nav fragment included into
    // many pages, checked once per emitted OUTPUT file but attributed to the
    // fragment (§14.1 R3) — so the same line, over and over.
    const { reporter, err } = captureReporter();
    for (let i = 0; i < 40; i++) {
      reporter.problem({
        file: "_includes/nav.html",
        line: 2,
        message: "/gone.html does not resolve to any emitted file",
        context: "/gone.html",
        fixes: ["check the path spelling and casing"],
      });
    }
    reporter.flush();
    expect(reporter.diagnostics.length).toBe(1);
    expect(err.length).toBe(1);
    expect(err[0]).toContain("_includes/nav.html:2: problem:");
  });

  test("counts and the exit code reflect the deduplicated set", () => {
    const { reporter } = captureReporter();
    for (let i = 0; i < 5; i++) reporter.problem({ file: "a.html", line: 1, message: "same" });
    for (let i = 0; i < 3; i++) reporter.advisory({ file: "b.html", line: 1, message: "same advisory" });
    expect(reporter.problemCount).toBe(1);
    expect(reporter.advisoryCount).toBe(1);
    expect(reporter.canPublish).toBe(false);
    expect(reporter.exitCode).toBe(1);
  });

  test("dedup never turns a problem into a clean build", () => {
    const { reporter } = captureReporter();
    reporter.problem({ file: "a.html", line: 1, message: "same" });
    reporter.problem({ file: "a.html", line: 1, message: "same" });
    expect(reporter.problemCount).toBeGreaterThan(0);
    expect(reporter.exitCode).toBe(1);
  });

  test("problemsReported keeps the raw tally for callers bracketing a step", () => {
    // build.js decides whether one page's remnant may go downstream by
    // bracketing that page with a count. Dedup is exactly what makes
    // `problemCount` unable to answer that (two pages including the same
    // broken fragment report byte-identical problems), so the raw tally stays
    // available for it.
    const { reporter } = captureReporter();
    const before = reporter.problemsReported;
    reporter.problem({ file: "_includes/nav.html", line: 3, message: "include not found: missing.html" });
    reporter.problem({ file: "_includes/nav.html", line: 3, message: "include not found: missing.html" });
    expect(reporter.problemsReported).toBe(before + 2);
    expect(reporter.problemCount).toBe(1);
  });
});

describe("Reporter deduplication — what must survive it", () => {
  test("two DIFFERENT messages at the same file and line both survive", () => {
    const { reporter, err } = captureReporter();
    reporter.problem({ file: "index.html", line: 7, message: "/a.html does not resolve to any emitted file" });
    reporter.problem({ file: "index.html", line: 7, message: "/b.html does not resolve to any emitted file" });
    reporter.flush();
    expect(reporter.problemCount).toBe(2);
    expect(err.join("")).toContain("/a.html");
    expect(err.join("")).toContain("/b.html");
  });

  test("the same message at different lines, files, or severities all survive", () => {
    const { reporter } = captureReporter();
    reporter.problem({ file: "a.html", line: 1, message: "same" });
    reporter.problem({ file: "a.html", line: 2, message: "same" }); // different line
    reporter.problem({ file: "b.html", line: 1, message: "same" }); // different file
    reporter.advisory({ file: "a.html", line: 1, message: "same" }); // different severity
    expect(reporter.diagnostics.length).toBe(4);
  });

  test("identical message and location, different fix lines: both survive (the A04 shape)", () => {
    // A04's message carries no slot name; its fix does. Two stray slots on one
    // source line differ ONLY in their fixes — a (file, line, severity,
    // message) key would eat the second one's advice.
    const { reporter, err } = captureReporter();
    const message = "<slot> is outside a layout's <body> — replaced by its own children";
    reporter.advisory({ file: "about.html", line: 4, message, fixes: ['put slot= on a real element: <footer slot="a">…</footer>'] });
    reporter.advisory({ file: "about.html", line: 4, message, fixes: ['put slot= on a real element: <footer slot="b">…</footer>'] });
    reporter.flush();
    expect(reporter.advisoryCount).toBe(2);
    expect(err.join("")).toContain('slot="a"');
    expect(err.join("")).toContain('slot="b"');
  });

  test("a discriminator splits two byte-identical diagnostics that are different faults", () => {
    // references.js's live case: one relative url() in shared chrome resolving
    // against two different containing output files (§12), quoted in both
    // messages by its identical SOURCE spelling.
    const { reporter, err } = captureReporter();
    const d = { file: "_layout.html", line: 9, message: "bg.png does not resolve to any emitted file", context: "bg.png" };
    reporter.problem({ ...d, discriminator: "assets/bg.png" });
    reporter.problem({ ...d, discriminator: "blog/bg.png" });
    reporter.problem({ ...d, discriminator: "blog/bg.png" }); // a true repeat of the second
    expect(reporter.problemCount).toBe(2);
    reporter.flush();
    expect(err.length).toBe(2);
    // Never printed — it is a dedup key, not part of the §14.1 line.
    expect(err.join("")).not.toContain("assets/bg.png");
  });
});

describe("Reporter ordering and formatting (§14.1) survive dedup", () => {
  test("output stays ordered by path, then line, then report order", () => {
    const { reporter, err } = captureReporter();
    reporter.problem({ file: "b.html", line: 1, message: "b1" });
    reporter.problem({ file: "a.html", line: 9, message: "a9" });
    reporter.problem({ file: "a.html", line: 2, message: "a2" });
    reporter.problem({ file: "a.html", line: 2, message: "a2-second" });
    reporter.problem({ file: "b.html", line: 1, message: "b1" }); // duplicate of the first
    reporter.flush();
    expect(err.map((l) => l.split(": ").slice(0, 1)[0])).toEqual([
      "a.html:2", "a.html:2", "a.html:9", "b.html:1",
    ]);
  });

  test("two runs over the same reports print the same bytes", () => {
    const report = (reporter) => {
      reporter.problem({ file: "_includes/nav.html", line: 2, message: "/gone.html does not resolve to any emitted file", context: "/gone.html" });
      reporter.problem({ file: "index.html", line: 1, message: "page content has nowhere to land in _layout.html" });
      reporter.problem({ file: "_includes/nav.html", line: 2, message: "/gone.html does not resolve to any emitted file", context: "/gone.html" });
    };
    const a = captureReporter();
    const b = captureReporter();
    report(a.reporter);
    report(b.reporter);
    a.reporter.flush();
    b.reporter.flush();
    expect(a.err.join("")).toBe(b.err.join(""));
  });

  test("the line omits the location's colon when the line is unknown", () => {
    const { reporter, err } = captureReporter();
    reporter.advisory({ file: "hero.psd", message: "hero.psd is a design working-format file" });
    reporter.flush();
    expect(err[0].startsWith("hero.psd: advisory: ")).toBe(true);
  });

  test("--strict turns deduplicated advisories alone into exit 1, and publishes anyway", () => {
    const { reporter } = captureReporter({ strict: true });
    reporter.advisory({ file: "a.html", line: 1, message: "same" });
    reporter.advisory({ file: "a.html", line: 1, message: "same" });
    expect(reporter.advisoryCount).toBe(1);
    expect(reporter.canPublish).toBe(true);
    expect(reporter.exitCode).toBe(1);
  });
});
