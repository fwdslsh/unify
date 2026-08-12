/**
 * Unit tests for src/core/collisions.js (Tier 3 — no conformance authority;
 * testing-strategy §2). Hand-built cases pin every branch; fixture-driven
 * cases replay landmine source trees (read directly, not composed — this
 * module only needs each file's path and page/asset kind) and assert the
 * exact diagnostics the landmines manifest declares.
 */
import { describe, expect, test } from "bun:test";
import {
  KNOWN_DEPLOYMENT_FILES, WORKING_FORMAT_EXTENSIONS, computeOutputPath,
  deploymentFileDiagnostics, resolveOutputPaths, underscoreGuardDiagnostics,
  workingFormatDiagnostics,
} from "../../../src/core/collisions.js";
import { Reporter } from "../../../src/core/diagnostics.js";

function silentReporter() {
  return new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
}

const page = (path) => ({ path, kind: "page" });
const asset = (path) => ({ path, kind: "asset" });

// ============================================================ output paths

describe("computeOutputPath", () => {
  test("a page's .html/.md extension becomes .html, same stem", () => {
    expect(computeOutputPath(page("about.html"))).toBe("about.html");
    expect(computeOutputPath(page("about.md"))).toBe("about.html");
    expect(computeOutputPath(page("blog/post.MD"))).toBe("blog/post.html"); // extension match is case-insensitive
  });
  test("an asset's path is unchanged (mirror copy, §4.4)", () => {
    expect(computeOutputPath(asset("assets/style.css"))).toBe("assets/style.css");
  });
  test("--pretty-urls transforms a page's output, never an asset's", () => {
    expect(computeOutputPath(page("about.html"), { prettyUrls: true })).toBe("about/index.html");
    expect(computeOutputPath(page("index.html"), { prettyUrls: true })).toBe("index.html");
    expect(computeOutputPath(asset("about.css"), { prettyUrls: true })).toBe("about.css");
  });
});

describe("resolveOutputPaths — P12 exact collisions", () => {
  test("two sources producing one output path: a problem naming both, at the path-ordered first", () => {
    const reporter = silentReporter();
    const entries = [page("about.md"), page("about.html")]; // deliberately out of path order
    const results = resolveOutputPaths({ entries, reporter });
    expect(results.map((r) => r.outputPath)).toEqual(["about.html", "about.html"]);
    expect(reporter.problemCount).toBe(1);
    const p = reporter.diagnostics[0];
    expect(p.severity).toBe("problem");
    expect(p.file).toBe("about.html"); // "about.html" < "about.md" lexicographically
    expect(p.message).toContain("about.md");
    expect(p.message).toContain("about.html");
    // The fix must not read as "delete one of these": a ratification round-8
    // repair sample took that literally and lost the page's only copy of the
    // shop's address. Both named edits keep every source's text.
    const fix = (p.fixes ?? []).join(" ");
    expect(fix).toContain("rename");
    expect(fix).toContain("merge");
    expect(fix).not.toContain("remove");
  });

  test("a --pretty-urls move landing on another source's output is also a problem (COL-02)", () => {
    const reporter = silentReporter();
    const entries = [page("about.html"), page("about/index.md")];
    resolveOutputPaths({ entries, prettyUrls: true, reporter });
    expect(reporter.problemCount).toBe(1);
    expect(reporter.diagnostics[0].message).toContain("about/index.html");
  });

  test("the identical tree is legal WITHOUT --pretty-urls (the collision exists only under the move)", () => {
    const reporter = silentReporter();
    const entries = [page("about.html"), page("about/index.md")];
    const results = resolveOutputPaths({ entries, prettyUrls: false, reporter });
    expect(reporter.problemCount).toBe(0);
    expect(results.map((r) => r.outputPath).sort()).toEqual(["about.html", "about/index.html"]);
  });

  test("no false positives: distinct pages never collide", () => {
    const reporter = silentReporter();
    resolveOutputPaths({ entries: [page("about.html"), page("contact.html"), asset("logo.png")], reporter });
    expect(reporter.diagnostics).toEqual([]);
  });
});

describe("resolveOutputPaths — A11 case-only collisions", () => {
  test("two outputs differing only by letter case: advisory, not a problem", () => {
    const reporter = silentReporter();
    const entries = [page("About.html"), page("about.html")];
    resolveOutputPaths({ entries, reporter });
    expect(reporter.problemCount).toBe(0);
    expect(reporter.advisoryCount).toBe(1);
    const a = reporter.diagnostics[0];
    expect(a.severity).toBe("advisory");
    expect(a.file).toBe("About.html"); // path-ordered first ('A' < 'a')
    expect(a.message).toContain("about.html");
  });

  test("both outputs still get a computed path (advisories never change what publishes)", () => {
    const reporter = silentReporter();
    const results = resolveOutputPaths({ entries: [page("About.html"), page("about.html")], reporter });
    expect(results.map((r) => r.outputPath).sort()).toEqual(["About.html", "about.html"]);
  });
});

// =============================================================== P14 guard

describe("underscoreGuardDiagnostics (§4.2 P14)", () => {
  test("an emitted _-prefixed page is a problem", () => {
    const reporter = silentReporter();
    underscoreGuardDiagnostics([page("_layout.html")], reporter);
    expect(reporter.problemCount).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("_layout.html");
    expect(reporter.diagnostics[0].message).toContain("_layout.html");
  });

  test("a page inside a _-prefixed directory is a problem, without needing its own underscore", () => {
    const reporter = silentReporter();
    underscoreGuardDiagnostics([page("_notes/todo.html")], reporter);
    expect(reporter.problemCount).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("_notes/todo.html");
  });

  test("an ordinary page is silent", () => {
    const reporter = silentReporter();
    underscoreGuardDiagnostics([page("index.html")], reporter);
    expect(reporter.diagnostics).toEqual([]);
  });

  test("a root-level _-prefixed NON-page file is deliberately NOT covered (§4.2's own carve-out)", () => {
    const reporter = silentReporter();
    underscoreGuardDiagnostics([asset("_headers")], reporter);
    expect(reporter.diagnostics).toEqual([]);
  });

  test("an asset inside a _-prefixed directory IS covered (the directory clause has no page restriction)", () => {
    const reporter = silentReporter();
    underscoreGuardDiagnostics([asset("_includes/logo.png")], reporter);
    expect(reporter.problemCount).toBe(1);
  });
});

// =============================================================== A09

describe("workingFormatDiagnostics (§14.3 A09)", () => {
  test("each closed-list extension fires an advisory naming the file", () => {
    const reporter = silentReporter();
    workingFormatDiagnostics([asset("logo.psd"), asset("logo.fig"), asset("logo.png")], reporter);
    expect(reporter.problemCount).toBe(0);
    expect(reporter.advisoryCount).toBe(2);
    const files = reporter.diagnostics.map((d) => d.file).sort();
    expect(files).toEqual(["logo.fig", "logo.psd"]);
  });
  test("a page is never flagged even with a matching extension in its name", () => {
    const reporter = silentReporter();
    workingFormatDiagnostics([page("about.html")], reporter);
    expect(reporter.diagnostics).toEqual([]);
  });
  test("WORKING_FORMAT_EXTENSIONS is exactly the closed list", () => {
    expect(WORKING_FORMAT_EXTENSIONS).toEqual([".psd", ".ai", ".sketch", ".fig", ".xcf"]);
  });
});

// =============================================================== A14

describe("deploymentFileDiagnostics (§4.2/§14.3 A14)", () => {
  test("a recognized deployment file held back by exclusion draws an advisory naming the fix", () => {
    const reporter = silentReporter();
    deploymentFileDiagnostics(["_headers"], reporter);
    expect(reporter.advisoryCount).toBe(1);
    const a = reporter.diagnostics[0];
    expect(a.file).toBe("_headers");
    expect(a.message).toContain("_headers");
    expect((a.fixes ?? []).join(" ")).toContain("--exclude");
  });
  test("an unrecognized excluded file is silent", () => {
    const reporter = silentReporter();
    deploymentFileDiagnostics(["_private-notes.txt"], reporter);
    expect(reporter.diagnostics).toEqual([]);
  });
  test("KNOWN_DEPLOYMENT_FILES is the maintained, greppable list", () => {
    expect(KNOWN_DEPLOYMENT_FILES).toEqual(["_headers", "_redirects", "_routes.json", "_worker.js"]);
  });
});

// ==================================================== landmine fixtures

describe("fixture: underscore-guard (--exclude drafts/** replaces the default _*)", () => {
  test("_layout.html and _notes/todo.html both fire P14; the excluded drafts/wip.html is never in the emitted set to begin with", () => {
    const reporter = silentReporter();
    // Simulates the caller's exclusion pass already having applied
    // `--exclude drafts/**` (replacing the default _*): drafts/wip.html is
    // excluded and never appears here; _layout.html / _notes/todo.html are
    // NOT excluded by this replaced set, so they reach this function.
    const entries = [page("index.html"), page("_layout.html"), page("_notes/todo.html")];
    underscoreGuardDiagnostics(entries, reporter);
    expect(reporter.problemCount).toBe(2);
    const files = reporter.diagnostics.map((d) => d.file).sort();
    expect(files).toEqual(["_layout.html", "_notes/todo.html"]);
  });
});

describe("fixture: working-format", () => {
  test("logo.psd and logo.fig both draw A09; index.html does not", () => {
    const reporter = silentReporter();
    workingFormatDiagnostics([page("index.html"), asset("logo.psd"), asset("logo.fig")], reporter);
    expect(reporter.advisoryCount).toBe(2);
    expect(reporter.problemCount).toBe(0);
  });
});

describe("fixture: deploy-file-excluded", () => {
  test("_headers, _redirects, _routes.json each draw A14; a nested blog/_headers is never passed in (root-only recognition)", () => {
    const reporter = silentReporter();
    // The caller (file classification) only ever passes ROOT-level excluded
    // names per this function's contract; blog/_headers would not appear here.
    deploymentFileDiagnostics(["_headers", "_redirects", "_routes.json"], reporter);
    expect(reporter.advisoryCount).toBe(3);
    const files = reporter.diagnostics.map((d) => d.file).sort();
    expect(files).toEqual(["_headers", "_redirects", "_routes.json"]);
  });
});

describe("fixture: collision-md-html / collision-pretty-landing", () => {
  test("collision-md-html: about.html + about.md collide unconditionally", () => {
    const reporter = silentReporter();
    resolveOutputPaths({ entries: [page("about.html"), page("about.md")], reporter });
    expect(reporter.problemCount).toBe(1);
  });

  test("collision-pretty-landing: about.html + about/index.md collide only under --pretty-urls", () => {
    const clean = silentReporter();
    resolveOutputPaths({ entries: [page("about.html"), page("about/index.md")], prettyUrls: false, reporter: clean });
    expect(clean.problemCount).toBe(0);

    const pretty = silentReporter();
    resolveOutputPaths({ entries: [page("about.html"), page("about/index.md")], prettyUrls: true, reporter: pretty });
    expect(pretty.problemCount).toBe(1);
  });
});

describe("fixture-equivalent: case-twin-outputs (runtime-cases.mjs — About.html + about.html)", () => {
  test("advisory only, both still emitted, path-ordered-first attribution", () => {
    const reporter = silentReporter();
    const results = resolveOutputPaths({ entries: [page("About.html"), page("about.html")], reporter });
    expect(reporter.problemCount).toBe(0);
    expect(reporter.advisoryCount).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("About.html");
    expect(reporter.diagnostics[0].message).toContain("about.html");
    expect(results.length).toBe(2);
  });
});
