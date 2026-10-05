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
import { CONFIG_KEYS, configTemplate, loadConfig, mergeConfig, parseArgs, templateLines, templateRecord } from "../../src/cli/options.js";
import { registerTmp } from "../tmp-reaper.mjs";

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

  test("retired options are unknown like any other", () => {
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

  test("--catalog and --search-corpus are boolean flags, like --strict or --clean, and are independent of each other (§30.1)", () => {
    expect(parseArgs(["--catalog"]).options.catalog).toBe(true);
    expect(parseArgs([]).options.catalog).toBeUndefined();
    expect(() => parseArgs(["--catalog=yes"])).toThrow(UsageError);

    expect(parseArgs(["--search-corpus"]).options["search-corpus"]).toBe(true);
    expect(parseArgs([]).options["search-corpus"]).toBeUndefined();
    expect(() => parseArgs(["--search-corpus=yes"])).toThrow(UsageError);

    const both = parseArgs(["--catalog", "--search-corpus"]).options;
    expect(both.catalog).toBe(true);
    expect(both["search-corpus"]).toBe(true);
  });

  test("--search-index is retired: unknown like any other removed option", () => {
    expect(() => parseArgs(["--search-index"])).toThrow(UsageError);
  });
});

describe("loadConfig comments", () => {
  /** Write a unify.yaml into a fresh temp root and load it. */
  function load(yaml) {
    const dir = registerTmp(mkdtempSync(join(tmpdir(), "unify-cfg-")));
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

describe("configTemplate — the unify.yaml init scaffolds (§18, §19.8)", () => {
  // Top-level keys only: the lines indented under template: (source:, keep:) are the block's, not keys of their own.
  const keyOf = (line) => line.match(/^(?:# )?([a-z][\w-]*):/)?.[1];

  test("lists every saveable option exactly once, each under a one-line description naming its default", () => {
    const lines = configTemplate().split("\n");
    const keys = lines.map(keyOf).filter(Boolean);
    expect(keys).toEqual(CONFIG_KEYS);
    for (const [i, line] of lines.entries()) {
      if (!keyOf(line)) continue;
      expect(lines[i - 1]).toMatch(/^# .+ \(default: .+\)$/);
    }
  });

  test("with nothing set, every option is commented out and the file loads as empty", () => {
    const text = configTemplate();
    expect(text.split("\n").filter((l) => /^[a-z]/.test(l))).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "unify-tpl-"));
    registerTmp(dir);
    writeFileSync(join(dir, "unify.yaml"), text);
    expect(loadConfig(dir)).toEqual({});
  });

  test("every commented line is a valid line once uncommented — the reader accepts the whole file", () => {
    const text = configTemplate()
      .split("\n")
      .map((l) => (/^# [a-z][\w-]*:/.test(l) || /^#   [a-z][\w-]*:/.test(l) || /^#   - /.test(l) || /^#     - /.test(l) ? l.slice(2) : l))
      .join("\n");
    const dir = mkdtempSync(join(tmpdir(), "unify-tpl-"));
    registerTmp(dir);
    writeFileSync(join(dir, "unify.yaml"), text);
    expect(Object.keys(loadConfig(dir)).sort()).toEqual([...CONFIG_KEYS].sort());
  });

  test("a set key is written live in its place; an unknown key is refused", () => {
    const live = configTemplate({ catalog: true }).split("\n").filter((l) => /^[a-z]/.test(l));
    expect(live).toEqual(["catalog: true"]);
    expect(() => configTemplate({ "dry-run": true })).toThrow(/not a saveable option/);
  });
});

describe("the template block — the one key that takes a block (§18, §19.10)", () => {
  const load = (text) => {
    const dir = mkdtempSync(join(tmpdir(), "unify-tpl-"));
    registerTmp(dir);
    writeFileSync(join(dir, "unify.yaml"), text);
    return loadConfig(dir);
  };

  test("template: <source> alone is the record; the block spells source: and keep: under it; either is read", () => {
    expect(load("template: blog\n")).toEqual({ template: "blog" });
    expect(load("template:\n  source: blog\n  keep:\n    - unify.yaml\n    - site/assets/theme.css\n")).toEqual({ template: { source: "blog", keep: ["unify.yaml", "site/assets/theme.css"] } });
    expect(load("template:\n  keep:\n    - site/assets/theme.css\n")).toEqual({ template: { keep: ["site/assets/theme.css"] } });
    expect(load("template:\n  keep: site/assets/theme.css\n")).toEqual({ template: { keep: ["site/assets/theme.css"] } });
    expect(templateRecord("blog")).toEqual({ source: "blog" });
    expect(templateRecord({ keep: ["x"] })).toEqual({ keep: ["x"] });
    expect(templateRecord(undefined)).toEqual({});
  });

  test("keep: at the top level, a stray indented line, an unknown member and a list under template: itself are usage errors naming the block", () => {
    // The message and the fix lines together: what was wrong, and the shape to write instead.
    const failure = (text) => {
      try {
        load(text);
      } catch (e) {
        return `${e.message} | ${e.fixes.join(" ")}`;
      }
      return "no error";
    };
    expect(failure("keep:\n  - site/x\n")).toMatch(/unknown key: keep \| keep: belongs under template:/);
    expect(failure("output: dist\n  keep:\n    - site/x\n")).toMatch(/cannot read line: keep: \| only template: takes an indented block/);
    expect(failure("template:\n  files:\n    - site/x\n")).toMatch(/unknown key under template: files/);
    expect(failure("template:\n  - site/x\n")).toMatch(/cannot read line: - site\/x \| a list item needs its key/);
  });

  test("templateLines renders the bare line when there is nothing to keep, else the block; configTemplate writes it live the same way, and keep is not a key of its own", () => {
    expect(templateLines({ source: "blog" })).toEqual(["template: blog"]);
    expect(templateLines({ source: "blog", keep: ["unify.yaml", "site/assets/theme.css"] })).toEqual(["template:", "  source: blog", "  keep:", "    - unify.yaml", "    - site/assets/theme.css"]);
    expect(templateLines({ keep: ["site/assets/theme.css"] })).toEqual(["template:", "  keep:", "    - site/assets/theme.css"]);
    expect(configTemplate({ template: { keep: ["site/assets/theme.css"] } })).toContain("\ntemplate:\n  keep:\n    - site/assets/theme.css\n");
    expect(configTemplate({ template: "blog" })).toContain("\ntemplate: blog\n");
    expect(() => configTemplate({ keep: ["x"] })).toThrow(/not a saveable option/);
  });

  test("--keep repeats into a list, like --exclude", () => {
    expect(parseArgs(["update", "--keep", "site/assets/theme.css", "--keep", "site/_includes/nav.html"]).options.keep).toEqual(["site/assets/theme.css", "site/_includes/nav.html"]);
  });
});
