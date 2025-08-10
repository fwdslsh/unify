/**
 * Tests for default command behavior
 * Verifies CLI defaults to 'build' when no command specified
 */

import { describe, it, expect } from "bun:test";
import { parseArgs } from "../../src/cli/args-parser.js";

describe("Default Command Behavior", () => {
  describe("No command specified", () => {
    it("should default to build when only options provided", () => {
      const args = parseArgs(["--source", "src", "--output", "dist"]);

      // parseArgs should default command to 'build'
      expect(args.command).toBe("build");
      expect(args.source).toBe("src");
      expect(args.output).toBe("dist");
    });

    it("should handle empty arguments", () => {
      const args = parseArgs([]);

      expect(args.command).toBe("build");
      expect(args.source).toBe("src");
      expect(args.output).toBe("dist");
    });

    it("should handle flags only", () => {
      const args = parseArgs(["--pretty-urls", "--port", "3000"]);

      expect(args.command).toBe("build");
      expect(args.prettyUrls).toBe(true);
      expect(args.port).toBe(3000);
    });
  });

  describe("Explicit commands still work", () => {
    it("should parse explicit build command", () => {
      const args = parseArgs(["build", "--source", "content"]);

      expect(args.command).toBe("build");
      expect(args.source).toBe("content");
    });

    it("should parse serve command", () => {
      const args = parseArgs(["serve", "--port", "8080"]);

      expect(args.command).toBe("serve");
      expect(args.port).toBe(8080);
    });

    it("should parse watch command", () => {
      const args = parseArgs(["watch", "--source", "src"]);

      expect(args.command).toBe("watch");
      expect(args.source).toBe("src");
    });
  });

  describe("Command detection", () => {
    it("should reject unknown commands", () => {
      expect(() => {
        parseArgs(["invalid-command"]);
      }).toThrow(/Unknown command: invalid-command/);
    });
  });

  describe("Help and version flags", () => {
    it("should parse help flag without command", () => {
      const args = parseArgs(["--help"]);

      expect(args.help).toBe(true);
      expect(args.command).toBe(null); // No command should be set for help
    });

    it("should parse version flag without command", () => {
      const args = parseArgs(["--version"]);

      expect(args.version).toBe(true);
      expect(args.command).toBe(null); // No command should be set for version
    });

    it("should parse short help flag", () => {
      const args = parseArgs(["-h"]);

      expect(args.help).toBe(true);
    });

    it("should parse short version flag", () => {
      const args = parseArgs(["-v"]);

      expect(args.version).toBe(true);
    });
  });
});
