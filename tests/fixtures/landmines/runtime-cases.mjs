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
 *  - defaulted-source-notice / explicit-source-suppresses-notice: the §4.4
 *    notice fires only when the source root DEFAULTED to the working
 *    directory (no -s flag, no src/), which the checked-in harness contract
 *    (always `-s <case>/src`) cannot express; needs cwd control.
 *
 * Schema keys beyond the manifest case schema, used by the two notice cases:
 *  - omitSourceFlag: true — the harness must inject NO implicit `-s`; the
 *    case's `flags` are the complete option list after `build`. EXC-11's
 *    predicate is precisely the absence of --source, so a forced -s would
 *    test nothing.
 *  - outputDir: "<rel>" — where, relative to the temp root, the harness
 *    asserts expectFiles/expectAbsent (these cases pass `-o dist` in flags
 *    while running with cwd at the temp root).
 *  - expect.stdoutContains / expect.stdoutNotContains — substrings of stdout
 *    (the build summary; see the manifest harnessContract "stdout" entry).
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
      note: "Advisory only: both ship; they collide on case-insensitive hosts. Under --strict this exits 1 but STILL PUBLISHES — --strict moves the exit code, never what ships (product-spec §4).",
      strictVariant: { flags: ["--strict"], exit: 1, published: true }
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
  },

  "defaulted-source-notice": {
    rules: ["EXC-11"],
    build(dir) {
      // a flat directory init did not scaffold: no src/, files at the root
      writeFileSync(join(dir, "index.html"), page("Flat", "<p>hi</p>"));
      writeFileSync(join(dir, "style.css"), "body { margin: 0 }\n");
      writeFileSync(join(dir, "photo.jpg"), "not-a-real-jpg\n");
      writeFileSync(join(dir, "notes.txt"), "plain text ships too\n");
    },
    // no -s: the source root falls through to the working directory (§1),
    // which is EXC-11's entire predicate — the CLI's own argument resolution.
    flags: ["-o", "dist"],
    cwd: ".",
    omitSourceFlag: true,
    outputDir: "dist",
    expect: {
      exit: 0,
      published: true,
      diagnostics: [],
      diagnosticsExhaustive: true,
      stdoutContains: ["3 files", "--dry-run"],
      expectFiles: ["index.html", "style.css", "photo.jpg", "notes.txt"],
      note: "B7 resolved (2026-08-12): the §4.4 notice fires exactly when the source root defaulted to the working directory. Its two contract facts are asserted: the copied-file count (3 assets; the page is written, not copied) and the --dry-run pointer. Summary text on stdout, never a diagnostic — zero stderr diagnostics is part of the assertion, and the notice must not move the exit code."
    }
  },

  "explicit-source-suppresses-notice": {
    rules: ["EXC-11"],
    build(dir) {
      writeFileSync(join(dir, "index.html"), page("Flat", "<p>hi</p>"));
      writeFileSync(join(dir, "style.css"), "body { margin: 0 }\n");
    },
    // same flat tree, but the author NAMED the directory: -s . declares intent
    flags: ["-s", ".", "-o", "dist"],
    cwd: ".",
    omitSourceFlag: true,
    outputDir: "dist",
    expect: {
      exit: 0,
      published: true,
      diagnostics: [],
      diagnosticsExhaustive: true,
      stdoutNotContains: ["--dry-run"],
      expectFiles: ["index.html", "style.css"],
      note: "The suppressed twin: an explicit --source — even '.' — turns the notice off (§4.4). Identical output either way; only the summary differs."
    }
  }
};
