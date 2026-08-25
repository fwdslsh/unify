/**
 * Unit tests for src/core/generate.js — conformance-spec §33.2 (Tier 3; no
 * conformance authority, testing-strategy §2).
 *
 * §33.2's CLI-observable behavior (argv layout, P29, the overlay/context
 * lifecycle) is pinned by tests/conformance/generate.test.js against the real
 * binary. This file exists for the one claim that test doesn't have the
 * surface to make cheaply: `writeGeneratorContext`'s exact shape and key
 * order ("it is exactly this shape, key order included") and its
 * serialization (two-space JSON, trailing newline, §30.7's rule applied to
 * this file too) — a closed-set claim with no other pin anywhere in the
 * suite.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  makeOverlayDir,
  removeOverlayDir,
  writeGeneratorContext,
} from "../../../src/core/generate.js";
import pkg from "../../../package.json" with { type: "json" };

describe("writeGeneratorContext", () => {
  test("the object's key order is exactly schemaVersion, unifyVersion, command, paths, site, outputs", () => {
    const overlayDir = makeOverlayDir();
    try {
      const contextPath = writeGeneratorContext({
        overlayDir,
        sourceRoot: "/project/src",
        output: "/project/dist",
        command: "build",
        baseUrl: "https://example.com/docs/",
        prettyUrls: true,
        canonical: "auto",
        catalogPath: "assets/unify/catalog.json",
        searchCorpusPath: null,
      });
      const ctx = JSON.parse(readFileSync(contextPath, "utf8"));
      expect(Object.keys(ctx)).toEqual([
        "schemaVersion", "unifyVersion", "command", "paths", "site", "outputs",
      ]);
      expect(Object.keys(ctx.paths)).toEqual(["sourceRoot", "generatedRoot", "outputRoot"]);
      expect(Object.keys(ctx.site)).toEqual(["baseUrl", "prettyUrls", "canonical"]);
      expect(Object.keys(ctx.outputs)).toEqual(["catalog", "searchCorpus"]);
    } finally {
      removeOverlayDir(overlayDir);
    }
  });

  test("every field's value, for a build with every flag set", () => {
    const overlayDir = makeOverlayDir();
    try {
      const contextPath = writeGeneratorContext({
        overlayDir,
        sourceRoot: "/project/src",
        output: "/project/dist",
        command: "audit",
        baseUrl: "https://example.com/docs/",
        prettyUrls: true,
        canonical: "auto",
        catalogPath: "assets/unify/catalog.json",
        searchCorpusPath: "assets/unify/search-corpus.json",
      });
      const ctx = JSON.parse(readFileSync(contextPath, "utf8"));
      expect(ctx).toEqual({
        schemaVersion: 1,
        unifyVersion: pkg.version,
        command: "audit",
        paths: {
          sourceRoot: "/project/src",
          generatedRoot: overlayDir,
          outputRoot: "/project/dist",
        },
        site: {
          baseUrl: "https://example.com/docs/",
          prettyUrls: true,
          canonical: "auto",
        },
        outputs: {
          catalog: "assets/unify/catalog.json",
          searchCorpus: "assets/unify/search-corpus.json",
        },
      });
    } finally {
      removeOverlayDir(overlayDir);
    }
  });

  test("the closed defaults — null/false — for a build with no site/output flags", () => {
    const overlayDir = makeOverlayDir();
    try {
      const contextPath = writeGeneratorContext({
        overlayDir,
        sourceRoot: "/project/src",
        output: "/project/dist",
        command: "build",
        baseUrl: null,
        prettyUrls: false,
        canonical: null,
        catalogPath: null,
        searchCorpusPath: null,
      });
      const ctx = JSON.parse(readFileSync(contextPath, "utf8"));
      expect(ctx.site).toEqual({ baseUrl: null, prettyUrls: false, canonical: null });
      expect(ctx.outputs).toEqual({ catalog: null, searchCorpus: null });
    } finally {
      removeOverlayDir(overlayDir);
    }
  });

  test("two-space-indented JSON with a trailing newline (§30.7's rule, applied here too)", () => {
    const overlayDir = makeOverlayDir();
    try {
      const contextPath = writeGeneratorContext({
        overlayDir,
        sourceRoot: "/project/src",
        output: "/project/dist",
        command: "build",
        baseUrl: null,
        prettyUrls: false,
        canonical: null,
        catalogPath: null,
        searchCorpusPath: null,
      });
      const raw = readFileSync(contextPath, "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
      expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
    } finally {
      removeOverlayDir(overlayDir);
    }
  });

  test("the context path sits beside the overlay directory, never inside it", () => {
    const overlayDir = makeOverlayDir();
    try {
      const contextPath = writeGeneratorContext({
        overlayDir,
        sourceRoot: "/project/src",
        output: "/project/dist",
        command: "build",
        baseUrl: null,
        prettyUrls: false,
        canonical: null,
        catalogPath: null,
        searchCorpusPath: null,
      });
      expect(dirname(contextPath)).toBe(dirname(overlayDir));
      expect(contextPath.startsWith(overlayDir)).toBe(false);
    } finally {
      removeOverlayDir(overlayDir);
    }
  });
});

describe("removeOverlayDir", () => {
  test("removes the whole per-build temp root a makeOverlayDir() return lives in", () => {
    const overlayDir = makeOverlayDir();
    const root = dirname(overlayDir);
    expect(existsSync(root)).toBe(true);
    removeOverlayDir(overlayDir);
    expect(existsSync(root)).toBe(false);
  });

  test("refuses a directory that is not a makeOverlayDir() return, rather than deleting its parent", () => {
    // A directory whose basename is not "overlay" is not this function's
    // contract — deleting ITS parent would be deleting something unrelated
    // that happens to sit two levels up from wherever the caller pointed.
    const decoy = mkdtempSync(join(tmpdir(), "unify-generate-test-"));
    const guardParent = dirname(decoy);
    expect(existsSync(decoy)).toBe(true);
    removeOverlayDir(decoy);
    expect(existsSync(decoy)).toBe(true);
    expect(existsSync(guardParent)).toBe(true);
    rmSync(decoy, { recursive: true, force: true });
  });
});
