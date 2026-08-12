/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * The CLI surface is a closed set; these pin the parser's shape. Whether the
 * *build* honors an option is a conformance question, not a unit one.
 */

import { describe, expect, test } from "bun:test";
import { UsageError } from "../../src/core/diagnostics.js";
import { mergeConfig, parseArgs } from "../../src/cli/options.js";

describe("parseArgs", () => {
  test("build is the default command", () => {
    expect(parseArgs([]).command).toBe("build");
    expect(parseArgs(["--strict"]).command).toBe("build");
  });

  test("named commands are recognized", () => {
    for (const command of ["build", "dev", "watch", "init"]) {
      expect(parseArgs([command]).command).toBe(command);
    }
  });

  test("init takes a positional template", () => {
    expect(parseArgs(["init", "blog"]).template).toBe("blog");
  });

  test("short and long forms agree", () => {
    expect(parseArgs(["-s", "site"]).options.source).toBe("site");
    expect(parseArgs(["--source", "site"]).options.source).toBe("site");
    expect(parseArgs(["--source=site"]).options.source).toBe("site");
  });

  test("--exclude repeats into a list", () => {
    expect(parseArgs(["--exclude", "_*", "--exclude", "drafts/**"]).options.exclude).toEqual([
      "_*",
      "drafts/**",
    ]);
  });

  test("an unknown option is a usage fault, never ignored", () => {
    expect(() => parseArgs(["--nope"])).toThrow(UsageError);
    expect(() => parseArgs(["-z"])).toThrow(UsageError);
  });

  test("retired v0.6 options are unknown like any other", () => {
    for (const retired of ["--minify", "--fail-on", "--host", "--copy", "--ignore", "--default-layout"]) {
      expect(() => parseArgs([retired, "x"])).toThrow(UsageError);
    }
  });

  test("the retired serve command is not a command", () => {
    expect(() => parseArgs(["serve"])).toThrow(UsageError);
  });

  test("a value-taking option with no value is a usage fault, not a silent death", () => {
    expect(() => parseArgs(["--source"])).toThrow(UsageError);
    expect(() => parseArgs(["--base-url"])).toThrow(UsageError);
  });

  test("a flag given a value is a usage fault", () => {
    expect(() => parseArgs(["--strict=yes"])).toThrow(UsageError);
  });
});

describe("mergeConfig", () => {
  test("CLI flags win over unify.yaml", () => {
    expect(mergeConfig({ output: "flag" }, { output: "file" }).output).toBe("flag");
  });

  test("the file supplies what the flags left unset", () => {
    expect(mergeConfig({}, { output: "file", strict: true })).toEqual({ output: "file", strict: true });
  });
});
