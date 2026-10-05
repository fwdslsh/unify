/**
 * The run configuration: flags plus `unify.yaml`, resolved into the one
 * `settings` object every command reads (§18).
 *
 * Moved out of src/cli.js so that a command can resolve a project OTHER than
 * the one the process was started in — `unify init --audit` audits the
 * project it just scaffolded (§19.9), with that project's own `unify.yaml`
 * (the blog template's `generate:`, the docs template's `catalog: true`)
 * read exactly as a later `unify audit` run from that directory would read
 * it. cli.js importing a command module that imports cli.js back would have
 * been the alternative, and a cycle through the entrypoint is not one.
 */
import { dirname, isAbsolute, resolve } from "node:path";
import { resolveSource } from "../core/paths.js";
import { configPath, loadConfig, mergeConfig } from "./options.js";

/**
 * Resolve the full run configuration from flags plus `unify.yaml`.
 * The source root has to be resolved twice: once to find the config file
 * (in the source root, else at the project root — §18), then again once the
 * file's own `source` key has had its say. That second pass is what makes a
 * project-root `unify.yaml` able to say `source: site`.
 *
 * @param {Record<string, any>} flags
 * @param {string} [cwd] - the working directory: where `unify.yaml` is looked
 *   for after the source root, and what a relative `--source` resolves against.
 *   A parameter for the same reason `resolveSource(flag, cwd)` takes one — init's
 *   `--audit` gate resolves the project it just scaffolded, and a test names
 *   that directory without moving the process into it
 * @returns {{command: string, settings: Record<string, any>, sourceRoot: string, sourceDefaulted: boolean}}
 */
export function resolveSettings(flags, cwd = process.cwd()) {
  const probe = resolveSource(flags.source, cwd);
  const config = loadConfig(probe.root, cwd);
  // §18 — a path in unify.yaml is relative to the FILE, not to wherever the
  // command ran or to the source root: `source: site` and `generate:
  // scripts/gen.mjs` beside package.json name the directories beside it. For a
  // file inside the source root the two readings coincide, so nothing written
  // before 0.10 changes meaning. CLI flags keep their own rules (`--source`
  // from the working directory, `--generate` from the source root).
  const configDir = dirname(configPath(probe.root, cwd).path);
  for (const key of ["source", "generate"]) {
    if (typeof config[key] === "string" && !isAbsolute(config[key])) config[key] = resolve(configDir, config[key]);
  }
  const settings = mergeConfig(flags, config);
  const resolved = resolveSource(settings.source, cwd);

  return {
    settings: {
      output: settings.output ?? "dist",
      clean: settings.clean === true,
      exclude: settings.exclude ?? ["_*"],
      prettyUrls: settings["pretty-urls"] === true,
      baseUrl: settings["base-url"],
      // §22.1 — `auto` whenever the site has an address, unless `canonical: none`
      // (or the explicit --canonical none) opts out; nothing without --base-url.
      canonical: settings["base-url"] !== undefined && (settings.canonical ?? "auto") === "auto" ? "auto" : undefined,
      // the value as written, for the usage checks below; the line above is what the build reads
      canonicalRequested: settings.canonical,
      // §29.6 — full-content feed entries; §30.1 — the catalog and search
      // corpus. All boolean, all read only by build.js (audit reaches them
      // too, since `unify audit` runs the same pipeline). `feed-full`'s
      // "requires --base-url" usage error is cross-cutting validation,
      // checked below beside `--canonical auto`'s identical shape.
      // `--catalog`/`--search-corpus` are independent flags — neither
      // implies the other.
      feedFull: settings["feed-full"] === true,
      catalog: settings.catalog === true,
      searchCorpus: settings["search-corpus"] === true,
      includeNoindex: settings["include-noindex"] === true,
      // §33.1 — a PATH in the source tree, never a command. Read by
      // build.js before the scan (§33.5), so `watch`, `dev` and `audit`
      // get it too: all four scan the source tree.
      generate: settings.generate ?? null,
      // §33.7 — on whenever a generator is named, unless `source-inventory: false`
      // in unify.yaml opts out; inert without a generator either way.
      sourceInventory: settings["source-inventory"] ?? settings.generate !== undefined,
      dryRun: settings["dry-run"] === true,
      // §24.1 — set by the audit command itself, never by a flag.
      audit: false,
      // §24.8 — `build --audit`: the flag (or saved `audit: true`) is the GATE,
      // a separate setting from `audit` above, which selects the read-only
      // audit branch. Only `build` reads it.
      auditGate: ["build", "init"].includes(flags.command) && settings.audit === true,
      strict: settings.strict === true,
      // §31.1/§31.3 — `unify audit`'s own two flags. `format`'s value is
      // validated by `cli/commands/audit.js` (the closed set and its usage
      // error are audit's own concern, same split `--canonical`'s value keeps
      // between this file and `options.js`); every other command ignores
      // both, exactly as they ignore `--canonical`.
      format: settings.format,
      external: settings.external === true,
      port: settings.port === undefined ? 3000 : Number(settings.port),
      // §19.10 — read by `update` alone. `template` is the --template flag (the
      // positional spelled as an option); `recordedTemplate` is the line
      // unify.yaml carries, kept apart because a named source replaces it;
      // `yes` answers the overwrite question.
      template: flags.template,
      recordedTemplate: typeof config.template === "string" ? config.template : undefined,
      yes: flags.yes === true,
    },
    sourceRoot: resolved.root,
    // The would-copy notice (§4.4) fires only when nothing chose the source
    // root: no flag, no config key, no src/ directory.
    sourceDefaulted: resolved.defaulted && settings.source === undefined,
    command: flags.command,
  };
}

