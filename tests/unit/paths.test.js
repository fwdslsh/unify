/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * These may not declare rule coverage; the conformance fixtures own that.
 * They exist so a containment bug surfaces at its unit rather than as a
 * puzzling fixture diff three layers up.
 */

import { describe, expect, test } from "bun:test";
import { cleanRefusalReason, contains, isNeverShipped, toRelative } from "../../src/core/paths.js";

describe("contains", () => {
  test("a root contains itself", () => {
    expect(contains("/a/b", "/a/b")).toBe(true);
  });

  test("a descendant is contained", () => {
    expect(contains("/a/b", "/a/b/c/d.html")).toBe(true);
  });

  test("a sibling is not", () => {
    expect(contains("/a/b", "/a/c")).toBe(false);
  });

  test("a prefix-sharing sibling is not — /a/bc is outside /a/b", () => {
    expect(contains("/a/b", "/a/bc")).toBe(false);
  });

  test("traversal out and back still resolves inside", () => {
    expect(contains("/a/b", "/a/b/../b/c")).toBe(true);
  });

  test("traversal that escapes is caught", () => {
    expect(contains("/a/b", "/a/b/../../etc/passwd")).toBe(false);
  });
});

describe("isNeverShipped", () => {
  test.each([
    [".git/config", true],
    ["node_modules/x/index.js", true],
    [".env", true],
    [".env.production", true],
    ["unify.yaml", true],
    ["deep/nested/.git/HEAD", true],
    // `.env.*` is literal and errs safe: `.env.example` is a real convention,
    // and the rule does not try to judge which suffixes are harmless.
    [".env.example", true],
    ["src/.env.example.html", true],
  ])("holds back %s", (path, expected) => {
    expect(isNeverShipped(path)).toBe(expected);
  });

  test.each([
    [".htaccess"],
    [".nojekyll"],
    ["CNAME"],
    ["environment.html"],
    ["envs/.environment"],
  ])("ships %s — dotfiles are deploy files, and the list is literal", (path) => {
    expect(isNeverShipped(path)).toBe(false);
  });
});

describe("cleanRefusalReason", () => {
  test("refuses when output is the working directory", () => {
    expect(cleanRefusalReason("/proj", "/proj/src", "/proj")).not.toBeNull();
  });

  test("refuses when output contains the source root", () => {
    expect(cleanRefusalReason("/proj", "/proj/src", "/elsewhere")).not.toBeNull();
  });

  test("refuses when output is inside the source root", () => {
    expect(cleanRefusalReason("/proj/src/dist", "/proj/src", "/elsewhere")).not.toBeNull();
  });

  test("allows a sibling output directory", () => {
    expect(cleanRefusalReason("/proj/dist", "/proj/src", "/proj/other")).toBeNull();
  });
});

describe("toRelative", () => {
  test("emits source-root-relative, slash-separated paths", () => {
    expect(toRelative("/a/b", "/a/b/c/d.html")).toBe("c/d.html");
  });
});
