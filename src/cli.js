#!/usr/bin/env bun
/**
 * unify — the v0.7.0 CLI.
 *
 * Exit taxonomy (§14.1): 0 published (with --dry-run, would have been);
 * 1 problems found, nothing published, previous output untouched;
 * 2 invalid usage or fatal environment fault.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { Reporter, UsageError } from "./core/diagnostics.js";
import { cleanRefusalReason, resolveSource } from "./core/paths.js";
import { loadConfig, mergeConfig, parseArgs } from "./cli/options.js";

const HELP = `unify — HTML-native composition: no expression language, no client runtime.

  unify [build]              build the site (default command)
  unify dev                  build, watch, serve, and reload — the inner loop
  unify watch                build + rebuild on change, no server
  unify init [template]      scaffold a starter site

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -p, --port <n>           port for \`unify dev\` (default: 3000)
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
 * Resolve the full run configuration from flags plus `unify.yaml`.
 * The source root has to be resolved twice: once to find the config file,
 * then again once the file's own `source` key has had its say.
 *
 * @param {Record<string, any>} flags
 * @returns {{command: string, settings: Record<string, any>, sourceRoot: string, sourceDefaulted: boolean}}
 */
function resolveSettings(flags) {
  const probe = resolveSource(flags.source);
  const settings = mergeConfig(flags, loadConfig(probe.root));
  const resolved = resolveSource(settings.source);

  return {
    settings: {
      output: settings.output ?? "dist",
      clean: settings.clean === true,
      exclude: settings.exclude ?? ["_*"],
      prettyUrls: settings["pretty-urls"] === true,
      baseUrl: settings["base-url"],
      dryRun: settings["dry-run"] === true,
      strict: settings.strict === true,
      port: settings.port === undefined ? 3000 : Number(settings.port),
    },
    sourceRoot: resolved.root,
    // The would-copy notice (§4.4) fires only when nothing chose the source
    // root: no flag, no config key, no src/ directory.
    sourceDefaulted: resolved.defaulted && settings.source === undefined,
    command: flags.command,
  };
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

  const { settings, sourceRoot, sourceDefaulted } = resolveSettings({ ...options, command });

  // `init` is exempt: its whole job is to create the source root, so requiring
  // one to already exist made `unify init --source new-site` exit 2 before the
  // command ever ran.
  if (command !== "init" && (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory())) {
    throw new UsageError(`source directory not found: ${sourceRoot}`, [
      "pass --source <dir>, or run from a directory containing src/",
    ]);
  }
  if (Number.isNaN(settings.port) || settings.port <= 0) {
    throw new UsageError(`--port must be a positive number, got: ${settings.port}`);
  }
  // §11.3 — one form, the whole address. A bare path used to be accepted and
  // prefixed links correctly while leaving og:/twitter:/canonical
  // root-relative, which no share crawler can resolve: seventeen of eighteen
  // ratification samples chose it, and five of five then published dead
  // preview images with a green build. There is no repair for that inside a
  // diagnostic — the fix is that the weaker form no longer exists.
  if (settings.baseUrl !== undefined && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(settings.baseUrl))) {
    const path = `/${String(settings.baseUrl).replace(/^\/+/, "")}`;
    throw new UsageError(`--base-url needs the site's whole address, got: ${settings.baseUrl}`, [
      `write it with the scheme and domain: --base-url https://your-domain.example${path.endsWith("/") ? path : `${path}/`}`,
      "only the full address can make og:/twitter:/canonical absolute, which is what share crawlers fetch",
    ]);
  }

  const output = resolve(process.cwd(), settings.output);

  if (settings.clean) {
    const refusal = cleanRefusalReason(output, sourceRoot);
    if (refusal) {
      throw new UsageError(`--clean refused: ${refusal}`, [
        "point --output at a directory that holds only build output",
      ]);
    }
  }

  const reporter = new Reporter({ strict: settings.strict });
  const context = { sourceRoot, output, settings, reporter, template, sourceDefaulted };

  switch (command) {
    case "build":
      return (await import("./cli/commands/build.js")).build(context);
    case "dev":
      return (await import("./cli/commands/dev.js")).dev(context);
    case "watch":
      return (await import("./cli/commands/watch.js")).watch(context);
    case "init":
      return (await import("./cli/commands/init.js")).init(context);
    default:
      throw new UsageError(`unknown command: ${command}`);
  }
}

/* c8 ignore start — process wiring, exercised by the conformance harness */
if (import.meta.main) {
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
