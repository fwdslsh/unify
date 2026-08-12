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
 *  - dry-run-report: §17's "delete" verb requires a file ALREADY present in
 *    the output directory before the CLI runs; checked-in cases only ever
 *    get their `src/` copied in (harness.test.js's `normalizeCase`), with no
 *    way to seed `dist/` ahead of time, so this needs build()'s access to the
 *    whole temp root.
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
  },

  "dry-run-report": {
    rules: ["DRY-01", "DRY-02"],
    build(dir) {
      mkdirSync(join(dir, "src", "blog"), { recursive: true });
      mkdirSync(join(dir, "src", "assets"), { recursive: true });
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(
        join(dir, "src", "_layout.html"),
        "<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\">\n    <title>— Site</title>\n  </head>\n" +
        "  <body>\n    <main>\n      <p>Page content appears here.</p>\n    </main>\n  </body>\n</html>\n",
      );
      writeFileSync(
        join(dir, "src", "404.html"),
        "<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\">\n    <title>Not Found</title>\n  </head>\n" +
        "  <body data-layout=\"none\">\n    <h1>404</h1>\n  </body>\n</html>\n",
      );
      writeFileSync(join(dir, "src", "about.md"), "---\ntitle: About\n---\n\n# About\n\nText here.\n");
      writeFileSync(
        join(dir, "src", "blog", "_layout.html"),
        "<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\">\n    <title>— Blog</title>\n  </head>\n" +
        "  <body>\n    <main>\n      <p>Page content appears here.</p>\n    </main>\n  </body>\n</html>\n",
      );
      writeFileSync(
        join(dir, "src", "blog", "post.html"),
        "<!doctype html>\n<html>\n  <head>\n    <title>Post</title>\n  </head>\n" +
        "  <body>\n    <main>\n      <h1>Post</h1>\n      <p>Hi.</p>\n    </main>\n  </body>\n</html>\n",
      );
      writeFileSync(join(dir, "src", "assets", "style.css"), "body { margin: 0; }\n");
      // A file already in the output that this source no longer produces —
      // the one thing a checked-in case cannot express (see the module doc
      // comment) and the only way to exercise the "delete" verb.
      writeFileSync(
        join(dir, "dist", "stale.html"),
        "<!doctype html>\n<html>\n  <head><title>Stale</title></head>\n  <body>gone</body>\n</html>\n",
      );
    },
    flags: ["--dry-run", "--pretty-urls"],
    expect: {
      exit: 0,
      published: true,
      diagnostics: [],
      diagnosticsExhaustive: true,
      // published:true + expectAbsent (rather than the generic PUB-01
      // sentinel, which would seed its own extra index.html/sentinel-keep/
      // files into dist/ and blur an otherwise-exact report) proves nothing
      // was actually written: every path the report calls "write"/"copy"
      // stays absent, and the pre-seeded stale.html survives untouched.
      expectFiles: ["stale.html"],
      expectAbsent: ["404.html", "about.html", "about/index.html", "index.html", "assets/style.css", "blog/post.html", "blog/post/index.html"],
      // DRY-01/02, transcribed verbatim from the conformance spec's own §17
      // worked example: ordered by output path regardless of verb (404 <
      // about/ < assets/ < blog/ < stale.html, byte for byte), each write
      // line naming its source page and the layout it resolved to, or "(no
      // layout)" when it resolved to none.
      stdoutContains: [
        "write dist/404.html ← 404.html (no layout)\n" +
        "write dist/about/index.html ← about.md + _layout.html\n" +
        "copy dist/assets/style.css ← assets/style.css\n" +
        "write dist/blog/post/index.html ← blog/post.html + blog/_layout.html\n" +
        "delete dist/stale.html",
      ],
      note: "DRY-01/DRY-02: reproduces conformance-spec.md §17's own worked example exactly (same paths, same arrow, same order), under --pretty-urls so both the '+layout' and '(no layout)' write-line shapes and the delete verb all appear in one pass. published:true here (not the generic PUB-01 sentinel) so the exact stdout block matches the spec's example without extra seeded files; PUB-04's stronger byte-for-byte 'nothing written anywhere' proof lives in tests/conformance/publish-sync.test.js."
    }
  }
};
