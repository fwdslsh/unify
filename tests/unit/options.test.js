/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * The CLI surface is a closed set; these pin the parser's shape. Whether the
 * *build* honors an option is a conformance question, not a unit one.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageError } from "../../src/core/diagnostics.js";
import { loadConfig, mergeConfig, parseArgs } from "../../src/cli/options.js";

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

describe("loadConfig comments", () => {
  /** Write a unify.yaml into a fresh temp root and load it. */
  function load(yaml) {
    const dir = mkdtempSync(join(tmpdir(), "unify-cfg-"));
    writeFileSync(join(dir, "unify.yaml"), yaml);
    return loadConfig(dir);
  }

  test("a whole-line comment is skipped, not a usage error", () => {
    // Ratification round 18's fixture carried one and it exited 2: the
    // trailing-comment strip requires whitespace before the '#', so a comment
    // at column 0 fell through to the key/value match and failed it.
    expect(load("# Build settings\noutput: dist\n")).toEqual({ output: "dist" });
    expect(load("   # indented too\noutput: dist\n")).toEqual({ output: "dist" });
  });

  test("a trailing comment is still stripped", () => {
    expect(load("output: dist  # where it goes\n")).toEqual({ output: "dist" });
  });

  test("a '#' inside a value survives — it needs preceding whitespace to be a comment", () => {
    expect(load("base-url: https://x.example/#frag\n")).toEqual({ "base-url": "https://x.example/#frag" });
  });

  test("a line that is neither comment, blank, key nor list item is still a usage error", () => {
    expect(() => load("just some prose\n")).toThrow(UsageError);
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
