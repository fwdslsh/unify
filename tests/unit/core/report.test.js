/**
 * Unit tests for src/core/report.js — conformance-spec §31.1/§31.2/§31.4
 * (Tier 3; no conformance authority, testing-strategy §2). CLI-observable
 * behavior lives in tests/conformance/report.test.js (RPT-01/02/04), which is
 * where the rule's real authority sits.
 *
 * This file exists for one property that a CLI fixture cannot demonstrate on
 * demand: the fingerprint's length-prefixed join is collision-free even for
 * inputs an author's own content could plausibly produce (a URL, an `@id`, a
 * field value) — the concatenation collisions a naive separator-based join
 * would be vulnerable to. Everything else here is a fast, direct check of
 * pure functions the conformance suite already exercises end to end.
 */
import { describe, expect, test } from "bun:test";
import { buildReport, fingerprint, serializeJson, serializeSarif } from "../../../src/core/report.js";

/** The Finding shape audit.js's `add()` produces, with every field named. */
const finding = (over = {}) => ({
  id: "title-missing",
  severity: "incomplete",
  file: "about.html",
  outputPath: "about.html",
  url: null,
  distinguisher: "",
  evidence: "the emitted <head> declares no <title>",
  fix: "add a <title>",
  ...over,
});

describe("fingerprint", () => {
  test("is deterministic — the same finding hashes the same way twice", () => {
    const f = finding();
    expect(fingerprint(f)).toBe(fingerprint({ ...f }));
  });

  test("is a lowercase hex string", () => {
    expect(fingerprint(finding())).toMatch(/^[0-9a-f]+$/);
  });

  test("differs when id, file, or distinguisher differs", () => {
    const base = finding({ id: "id-duplicate", distinguisher: "x" });
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, id: "fragment-missing" }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, file: "other.html" }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, distinguisher: "y" }));
  });

  test("is unchanged when evidence, fix, outputPath, or url differ", () => {
    const base = finding();
    const changed = finding({
      evidence: "a completely reworded sentence about the same fault",
      fix: "a completely different-sounding fix for the same fault",
      outputPath: "about/index.html", // e.g. moved under --pretty-urls
      url: "https://example.com/about.html", // e.g. --base-url added later
    });
    expect(fingerprint(base)).toBe(fingerprint(changed));
  });

  test("missing distinguisher defaults to the empty string (§31.2's own default)", () => {
    const f = finding();
    delete f.distinguisher;
    expect(fingerprint(f)).toBe(fingerprint(finding({ distinguisher: "" })));
  });

  test("length-prefixed join has no concatenation collision — an id/file split that would tie under a bare join does not here", () => {
    // Naive `id + file + distinguisher` concatenation: "ab" + "c" + "d" reads
    // identically to "a" + "bc" + "d" ("abcd" either way). The length-prefixed
    // join used here encodes each part's own length first, so the two inputs
    // below produce DIFFERENT strings before hashing, and therefore different
    // fingerprints — proving the join is not vulnerable to the collision its
    // own doc comment describes.
    const a = fingerprint(finding({ id: "ab", file: "c", distinguisher: "d" }));
    const b = fingerprint(finding({ id: "a", file: "bc", distinguisher: "d" }));
    expect(a).not.toBe(b);
  });

  test("a distinguisher containing digits and a colon (plausible real content — 'src/a.html#frag') collides with nothing built from its pieces", () => {
    // If the join used ":" as an unproven-absent separator, "a" + ":" +
    // "src/a.html#frag" could tie with "a:src/a.html" + "" + "#frag" for a
    // differently-shaped finding. The length-prefixed join has no such risk;
    // this pins that with a concrete pair rather than only asserting it in
    // prose.
    const x = fingerprint(finding({ id: "a", file: "b", distinguisher: "src/a.html#frag" }));
    const y = fingerprint(finding({ id: "a", file: "b:src/a.html", distinguisher: "frag" }));
    expect(x).not.toBe(y);
  });
});

describe("buildReport / serializeJson", () => {
  test("carries schemaVersion, baseUrl, summary, pages, and findings — nothing else invented", () => {
    const report = buildReport({
      records: [{ sourcePath: "a.html" }],
      findings: [finding()],
      base: null,
      problemCount: 2,
      advisoryCount: 1,
    });
    expect(report.schemaVersion).toBe(1);
    expect(report.baseUrl).toBeNull();
    expect(report.summary).toEqual({ broken: 0, incomplete: 1, problems: 2, advisories: 1 });
    expect(report.pages).toEqual([{ sourcePath: "a.html" }]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).not.toHaveProperty("distinguisher");
    expect(Object.keys(report.findings[0]).sort()).toEqual(
      ["evidence", "file", "fingerprint", "fix", "id", "outputPath", "severity", "url"].sort(),
    );
  });

  test("baseUrl is origin + pathPrefix when --base-url was supplied", () => {
    const report = buildReport({
      records: [], findings: [], problemCount: 0, advisoryCount: 0,
      base: { origin: "https://example.com", pathPrefix: "/repo/", scheme: "https:" },
    });
    expect(report.baseUrl).toBe("https://example.com/repo/");
  });

  test("serializeJson is two-space-indented with a trailing newline, and parses back to the same value", () => {
    const report = buildReport({ records: [], findings: [], base: null, problemCount: 0, advisoryCount: 0 });
    const text = serializeJson(report);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('  "schemaVersion": 1');
    expect(JSON.parse(text)).toEqual(report);
  });
});

describe("serializeSarif", () => {
  test("maps id/file/evidence/fingerprint/severity mechanically, field for field", () => {
    const report = buildReport({
      records: [], findings: [finding({ severity: "broken" })], base: null, problemCount: 0, advisoryCount: 0,
    });
    const sarif = JSON.parse(serializeSarif(report));
    expect(sarif.version).toBe("2.1.0");
    const [result] = sarif.runs[0].results;
    const [f] = report.findings;
    expect(result.ruleId).toBe(f.id);
    expect(result.level).toBe("error"); // broken -> error
    expect(result.message.text).toBe(f.evidence);
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe(f.file);
    expect(Object.values(result.partialFingerprints)).toContain(f.fingerprint);
  });

  test("incomplete maps to warning", () => {
    const report = buildReport({
      records: [], findings: [finding({ severity: "incomplete" })], base: null, problemCount: 0, advisoryCount: 0,
    });
    const sarif = JSON.parse(serializeSarif(report));
    expect(sarif.runs[0].results[0].level).toBe("warning");
  });

  test("rules[] declares every distinct ruleId used in results, and nothing else", () => {
    const report = buildReport({
      records: [],
      findings: [finding({ id: "a" }), finding({ id: "a", file: "x" }), finding({ id: "b" })],
      base: null, problemCount: 0, advisoryCount: 0,
    });
    const sarif = JSON.parse(serializeSarif(report));
    expect(sarif.runs[0].tool.driver.rules.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});
