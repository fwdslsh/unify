#!/usr/bin/env node
/**
 * unify — the CLI.
 *
 * THE SHEBANG NAMES `node`, AND IT IS NOT A STATEMENT ABOUT THE PREFERRED
 * RUNTIME (issue #49). It is the one line that decides whether `npx
 * @fwdslsh/unify` works on a machine that has never had bun installed: an npm
 * install links `node_modules/.bin/unify` at this file, the OS reads line 1 to
 * decide what to exec, and `env bun` there is `command not found` no matter
 * which runtime could have run the JavaScript. Nothing is lost on the bun
 * side, because nothing on the bun side reads it — `bun install -g` invokes
 * the script with bun itself, `bun src/cli.js` names the runtime on the
 * command line, and the compiled binary has no shebang at all.
 *
 * Exit taxonomy (§14.1): 0 published (with --dry-run, would have been);
 * 1 problems found, nothing published, previous output untouched;
 * 2 invalid usage or fatal environment fault.
 */

import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };
import { Reporter, UsageError } from "./core/diagnostics.js";
import { configPath, parseArgs } from "./cli/options.js";
import { prepare } from "./cli/prepare.js";
import { writeConfig } from "./cli/save-config.js";
import { classifyTemplateSource } from "./cli/template-source.js";
import { TEMPLATES } from "./templates/index.js";

const HELP = `unify — HTML-native composition: no expression language, no client runtime.

  unify [build]              build the site (default command)
  unify audit                evaluate the site the build would publish — writes nothing
  unify dev                  build, watch, serve, and reload — the inner loop
  unify watch                build + rebuild on change, no server
  unify init [template]      scaffold a starter site: a built-in name, a directory, a git repository (URL[/subdirectory][#ref]) or an npm package
  unify update [template]    fetch the recorded template again and copy its changed files over this project, after showing the list and asking

Options:
  -s, --source <dir>       source directory (default: site/ if it exists, else src/, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --canonical <mode>   auto (the default with --base-url) adds a canonical link to pages that author none; none switches it off
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml
      --feed-full          include each entry's full rendered content in feed.xml (needs --base-url)
      --catalog            write assets/unify/catalog.json — a browse/filter/TOC projection of every public page
      --search-corpus      write assets/unify/search-corpus.json — normalized page text for client-side search
      --include-noindex    list noindex pages in the catalog and search corpus (needs one of them)
      --generate <path>    run one JavaScript file before the build (a relative path is from the source root)
      --source-inventory   give that file source-pages.json: every source page's authored title, description, date, meta and links (on by default with --generate; source-inventory: false in unify.yaml turns it off)
      --extends <source>   build on a template without copying it — a built-in name, a directory, a git repository or an npm package, as init takes it: its layouts, includes, assets and pages sit beneath the site's, and a file of the site's at the same path or output path wins (a pinned version or commit is fetched once and cached)
      --dry-run            run the full build and every check, print the report, write nothing (with \`update\`: list the files it would write, write nothing)
      --audit              \`build\`: audit the composed site before publishing; publish only if \`unify audit\` would exit 0. \`init\`: keep the scaffold only if \`unify audit --strict\` passes on it
      --save-config        \`build\` only: write the saveable options given here into unify.yaml (after a good build)
      --template <source>  \`init\`/\`update\`: the template, the same as the positional; init saves it in unify.yaml
  -y, --yes                \`update\`: overwrite the listed files without asking
      --keep <path>        \`update\`: a file it never overwrites once it exists — the ones you customized (repeatable, relative to the working directory; the file's list is keep: under template: in unify.yaml, relative to the file)
      --strict             advisories count as problems for the exit code (with \`audit\`, \`incomplete\` findings too; \`broken\` ones always exit 1)
      --format <kind>      \`audit\` report shape: human (default), json, or sarif
      --external           \`audit\` only: fetch every off-origin URL the site emits and report the ones that don't resolve
  -p, --port <n>           port for \`unify dev\` (default: 3000)
      --watch-path <path>  \`dev\`/\`watch\`: a file or directory outside the project to rebuild on when it changes — watched only, never scanned or published (repeatable; relative to the working directory)
  -v, --version            print version
  -h, --help               print help
`;

/**
 * The version is *imported*, not read from disk.
 *
 * Reading `package.json` relative to `import.meta.url` works in development
 * and fails in the shipped artifact: `bun build --compile` bundles by tracing
 * imports, so there is no `package.json` beside the script inside the binary
 * and `unify --version` died with `ENOENT: /$bunfs/package.json` — on the
 * install path the product leads with. An import is traced and inlined like
 * any other module, so it works in both.
 *
 * @returns {string}
 */
function version() {
  return pkg.version;
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function run(argv) {
  const { command, template, options } = parseArgs(argv);

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const { settings, sourceRoot, sourceDefaulted, output, saving } = prepare({ command, options });

  /**
   * §18 — the lines `--save-config` writes name paths relative to the FILE:
   * a `--generate` the author gave relative to the source root is rewritten
   * relative to unify.yaml's directory, and `--source` is written when the
   * file sits outside the source root (beside package.json), where it is the
   * one thing that tells the next bare `unify build` which directory to read.
   * Inside the source root `source` stays unwritten, as before: circular there.
   * @param {Map<string, string[]>} entries
   * @param {string} path - the unify.yaml being written
   */
  function relocateSavedPaths(entries, path) {
    const dir = dirname(path);
    const rel = (abs) => relative(dir, abs).split(sep).join("/") || ".";
    if (entries.has("generate")) {
      const abs = isAbsolute(options.generate) ? resolve(options.generate) : resolve(sourceRoot, options.generate);
      entries.set("generate", [`generate: ${rel(abs)}`]);
    }
    // §34.1 — likewise a directory `--extends`, given from the working
    // directory, saved relative to the file; any other source is saved as typed.
    if (entries.has("extends")) {
      const source = classifyTemplateSource(options.extends, Object.keys(TEMPLATES));
      if (source.kind === "dir") entries.set("extends", [`extends: ${rel(source.path)}`]);
    }
    // §16 — likewise `--watch-path`, given from the working directory.
    if (entries.has("watch-path")) {
      entries.set("watch-path", ["watch-path:", ...options["watch-path"].map((p) => `  - ${rel(resolve(p))}`)]);
    }
    if (options.source !== undefined && resolve(dir) !== resolve(sourceRoot)) {
      entries.set("source", [`source: ${rel(resolve(sourceRoot))}`]);
    }
  }

  const reporter = new Reporter({ strict: settings.strict });
  // §33.2 — the actual subcommand, carried alongside `settings` rather than
  // folded into it: it is not a saved-flag concept (unify.yaml has nothing
  // named `command`), only the generator context's `command` field reads it,
  // and every command handler below (build/audit/dev/watch) already receives
  // and forwards this whole context object.
  const context = { sourceRoot, output, settings, reporter, template, sourceDefaulted, command };

  switch (command) {
    case "build": {
      const code = await (await import("./cli/commands/build.js")).build(context);
      // §18 — only a build (or dry run) that exited 0 records its settings,
      // into the unify.yaml that was read (source root, else project root),
      // or a new one in the source root.
      if (saving && code === 0) {
        const { path } = configPath(sourceRoot);
        relocateSavedPaths(saving, path);
        if (saving.size === 0) {
          process.stdout.write("--save-config: no saveable options were given, so unify.yaml was not written\n");
        } else {
          writeConfig(path, saving);
          process.stdout.write(`saved ${[...saving.keys()].join(", ")} to ${path}\n`);
        }
      }
      return code;
    }
    case "audit":
      return (await import("./cli/commands/audit.js")).audit(context);
    case "dev":
      return (await import("./cli/commands/dev.js")).dev(context);
    case "watch":
      return (await import("./cli/commands/watch.js")).watch(context);
    case "init":
      // §19.9 — `--audit` (or a saved `audit: true`) gates the scaffold the way
      // it gates a publish; `auditGate` is the one setting init reads.
      return (await import("./cli/commands/init.js")).init({ ...context, template: template ?? settings.template, audit: settings.auditGate });
    case "update":
      // §19.10 — the positional (or --template) names another template; else
      // the recorded line in unify.yaml, read by resolveSettings, is fetched.
      return (await import("./cli/commands/update.js")).update({ ...context, template: template ?? settings.template });
    default:
      throw new UsageError(`unknown command: ${command}`);
  }
}

/**
 * Is this file the program, rather than a module something else imported?
 *
 * `import.meta.main` alone was the check, and it is the reason `node
 * src/cli.js` used to be a SILENT NO-OP (issue #49). bun has always had the
 * property; node only grew it in v22.18.0, and on anything older it is
 * `undefined` — so the whole CLI was skipped, nothing was written, nothing was
 * printed, and the exit code was 0. A build that publishes nothing and reports
 * success is precisely the failure the content-loss law exists to forbid, and
 * it was reachable from the entrypoint by every node in the supported range.
 *
 * So the runtime's own answer is used WHEN THERE IS ONE, and otherwise the
 * question is answered directly: is the script node was told to run this file?
 * `realpathSync` is what makes that comparison hold for an npm install, where
 * `argv[1]` is the `node_modules/.bin/unify` symlink while `import.meta.url`
 * is already the link's target — comparing the two as written would fail on
 * the install path this whole change exists to support.
 *
 * @returns {boolean}
 */
function isProgram() {
  if (typeof import.meta.main === "boolean") return import.meta.main;
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === self;
  } catch {
    return resolve(entry) === self; // never ran, never resolved — not the program
  }
}

/* c8 ignore start — process wiring, exercised by the conformance harness */
if (isProgram()) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    const usage = error instanceof UsageError;
    process.stderr.write(`${usage ? "" : "unify: "}${error.message}\n`);
    for (const fix of usage ? error.fixes : []) process.stderr.write(`  fix: ${fix}\n`);
    if (process.env.DEBUG === "1" && error.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = usage ? 2 : 1;
  }
}
/* c8 ignore stop */
