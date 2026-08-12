/**
 * Landmine cases that CANNOT be checked into git and must be built at test
 * runtime in a temp directory:
 *
 *  - case-twin-outputs: two files differing only by letter case break checkout
 *    on macOS/Windows (case-insensitive filesystems), so the tree is generated.
 *  - symlink-escape: a symlink pointing outside the source root; target paths
 *    differ per machine, so it is generated.
 *  - never-shipped-vcs: a nested `.git/` directory cannot be tracked by git;
 *    `node_modules/` is globally ignored; both are generated.
 *  - clean-containment: needs control of the working directory and a doomed
 *    output path; generated so no repo path is ever at risk.
 *
 * Each entry has the same expectation schema as manifest.json cases. The
 * conformance harness imports BUILD_CASES, calls build(dir) with a fresh temp
 * dir, then runs unify with `flags` and asserts `expect` exactly like a
 * checked-in case. These cases still declare `rules` and therefore feed the
 * traceability ledger.
 */
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";

const page = (title, body) =>
  `<!doctype html>\n<html>\n  <head><title>${title}</title></head>\n  <body>\n    ${body}\n  </body>\n</html>\n`;

export const BUILD_CASES = {
  "case-twin-outputs": {
    rules: ["COL-03", "A11"],
    build(dir) {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "About.html"), page("About upper", "<p>Upper</p>"));
      writeFileSync(join(dir, "src", "about.html"), page("about lower", "<p>lower</p>"));
    },
    flags: [],
    expect: {
      exit: 0,
      published: true,
      diagnostics: [
        { file: "src/About.html", line: null, severity: "advisory", containsAll: ["about.html"] }
      ],
      diagnosticsExhaustive: true,
      expectFiles: ["About.html", "about.html"],
      note: "Advisory only: both ship; they collide on case-insensitive hosts. Under --strict this exits 1 (second run below).",
      strictVariant: { flags: ["--strict"], exit: 1, published: false }
    }
  },

  "symlink-escape": {
    rules: ["EXC-10", "A12"],
    build(dir) {
      mkdirSync(join(dir, "src"), { recursive: true });
      mkdirSync(join(dir, "outside"), { recursive: true });
      writeFileSync(join(dir, "outside", "secret.txt"), "outside the root\n");
      writeFileSync(join(dir, "src", "index.html"), page("P", "<p>hi</p>"));
      symlinkSync(join(dir, "outside", "secret.txt"), join(dir, "src", "leak.txt"));
      // and one legal symlink that stays inside the root:
      writeFileSync(join(dir, "src", "real.txt"), "inside\n");
      symlinkSync(join(dir, "src", "real.txt"), join(dir, "src", "alias.txt"));
    },
    flags: [],
    expect: {
      exit: 0,
      published: true,
      diagnostics: [
        { file: "src/leak.txt", line: null, severity: "advisory", containsAll: ["symlink"] }
      ],
      diagnosticsExhaustive: true,
      expectFiles: ["index.html", "real.txt", "alias.txt"],
      expectAbsent: ["leak.txt", "secret.txt"],
      note: "leak.txt treated as absent (advisory 12); alias.txt resolves inside the root and mirror-copies."
    }
  },

  "never-shipped-vcs": {
    rules: ["EXC-08"],
    build(dir) {
      const src = join(dir, "src");
      mkdirSync(join(src, ".git"), { recursive: true });
      mkdirSync(join(src, "node_modules", "leftpad"), { recursive: true });
      writeFileSync(join(src, ".git", "config"), "[core]\n");
      writeFileSync(join(src, "node_modules", "leftpad", "index.js"), "module.exports=0\n");
      writeFileSync(join(src, ".env"), "TOKEN=x\n");
      writeFileSync(join(src, ".env.local"), "TOKEN=y\n");
      writeFileSync(join(src, "unify.yaml"), "output: dist\n");
      writeFileSync(join(src, ".htaccess"), "Options -Indexes\n");
      writeFileSync(join(src, "index.html"), page("P", "<p>hi</p>"));
    },
    flags: [],
    expect: {
      exit: 0,
      published: true,
      diagnostics: [],
      diagnosticsExhaustive: true,
      expectFiles: ["index.html", ".htaccess"],
      expectAbsent: [".git/config", "node_modules/leftpad/index.js", ".env", ".env.local", "unify.yaml"],
      note: "The never-shipped list is literal; dotfiles like .htaccess ship. Nothing on the list is scanned, so no diagnostics reference it."
    }
  },

  "clean-containment": {
    rules: ["PUB-03", "DIA-04"],
    build(dir) {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "index.html"), page("P", "<p>hi</p>"));
    },
    // -o . --clean from inside the project dir: output contains the source root
    flags: ["-o", ".", "--clean"],
    cwd: ".",
    expect: {
      exit: 2,
      published: false,
      diagnostics: [],
      diagnosticsExhaustive: false,
      note: "Exit 2 (usage/environment), not 1: the refusal must be distinguishable from a site error, and nothing may be deleted. The harness asserts the source tree is byte-untouched afterwards."
    }
  }
};
