/**
 * The usage checks every command that builds shares, in one place: resolve the
 * run configuration (flags plus `unify.yaml`), then refuse what cannot run --
 * a missing source directory, a bad `--canonical`/`--base-url`/`--feed-full`
 * combination, `audit --clean`, an unsafe `--clean`. Each refusal is a
 * `UsageError` (exit 2).
 *
 * Moved out of `run()` in src/cli.js, body unchanged and in the same order, so
 * the CLI and the experimental public API (src/index.js) cannot disagree
 * about what a usage error is: both call this and neither re-implements a
 * check. The CLI renders the thrown `UsageError` and exits 2; the API returns
 * it as `status: 2`.
 */
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { UsageError } from "../core/diagnostics.js";
import { cleanRefusalReason } from "../core/paths.js";
import { saveEntries } from "./save-config.js";
import { resolveSettings } from "./settings.js";

/**
 * @param {object} args
 * @param {string} args.command
 * @param {Record<string, any>} args.options - parsed flags, long names
 * @param {boolean|string} [args.config] - see `resolveSettings`'s `configSource`
 * @returns {{settings: Record<string, any>, sourceRoot: string, sourceDefaulted: boolean, output: string, saving: Map<string, string[]>|null}}
 * @throws {UsageError}
 */
export function prepare({ command, options, config = true }) {
  const { settings, sourceRoot, sourceDefaulted } = resolveSettings({ ...options, command }, process.cwd(), config);

  // `init` is exempt: its whole job is to create the source root, so requiring
  // one to already exist made `unify init --source new-site` exit 2 before the
  // command ever ran.
  if (command !== "init" && (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory())) {
    throw new UsageError(`source directory not found: ${sourceRoot}`, [
      "pass --source <dir>, or run from a directory containing src/",
    ]);
  }
  // §16 — a path `dev` or `watch` is told to watch has to be there when it
  // starts: checked here, before the first build, with the flag or the file that
  // named it. `build` and `audit` never watch and read none of this.
  if (command === "dev" || command === "watch") {
    for (const { path, named } of settings.watchPaths) {
      if (!existsSync(path)) {
        throw new UsageError(`watch path not found: ${path} (named by ${named})`, ["create it, correct the path, or remove it from the watch paths"]);
      }
      try {
        accessSync(path, constants.R_OK);
      } catch {
        throw new UsageError(`watch path is not readable: ${path} (named by ${named})`, ["grant read access to it, or remove it from the watch paths"]);
      }
    }
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
  // §22.1 — `auto` and `none` are the only accepted values, so a future mode
  // cannot be silently misspelled into today's behaviour.
  if (settings.canonicalRequested !== undefined && !["auto", "none"].includes(String(settings.canonicalRequested))) {
    throw new UsageError(`--canonical accepts only "auto" or "none", got: ${settings.canonicalRequested}`, [
      "auto is the default whenever --base-url is set; write --canonical none to switch completion off",
      "unify completes a canonical only where a page authors none; an authored one always wins",
    ]);
  }
  // §22.1 — a canonical must be an absolute URL, and §20.5 has no public
  // address to build one from without --base-url. Saying so beats writing a
  // root-relative canonical or silently doing nothing while the flag says
  // otherwise.
  if (settings.canonicalRequested === "auto" && settings.baseUrl === undefined) {
    throw new UsageError("--canonical auto needs the site's address: --base-url is not set", [
      "add it: --base-url https://your-domain.example/",
      "a canonical must be absolute — a root-relative one is ignored by the crawlers it exists for",
    ]);
  }
  // §29.6 — the same shape as --canonical auto's check immediately above,
  // and for the same reason: the flag describes something the build will not
  // do without the site's address (a feed entry's <content> URLs are only
  // meaningful once they're absolute).
  if (settings.feedFull === true && settings.baseUrl === undefined) {
    throw new UsageError("--feed-full needs the site's address: --base-url is not set", [
      "add it: --base-url https://your-domain.example/",
      "a feed entry's <content> URLs are only meaningful once they're absolute",
    ]);
  }
  // §30.4 — same shape as --feed-full: it changes what a projection lists,
  // so with no projection requested it would be a silent no-op.
  if (settings.includeNoindex === true && !settings.catalog && !settings.searchCorpus) {
    throw new UsageError("--include-noindex needs --catalog or --search-corpus: neither is set", [
      "add --catalog and/or --search-corpus, or drop --include-noindex",
      "it only changes which pages those two files list",
    ]);
  }
  // §33.7 — `--source-inventory` is an input to the generator and nothing
  // else, so with no generator it is inert: a saved `source-inventory: true`
  // may sit in unify.yaml while the generator comes and goes per command.
  // A scheme with no authority — `file:`, `foo:`, `data:` — parses, but its
  // origin is the *string* "null", and every URL §20.5 builds from it then
  // reads `null/about.html`. That shipped as `<loc>null/</loc>` in a generated
  // sitemap until §12 started parsing, at which point it became a problem
  // blaming a generated file for a flag the author typed. Refused where the
  // author can act on it, in §11.3's existing family.
  if (settings.baseUrl !== undefined && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(settings.baseUrl))) {
    let origin = null;
    try {
      origin = new URL(String(settings.baseUrl)).origin;
    } catch {
      origin = "null";
    }
    if (origin === "null") {
      throw new UsageError(`--base-url needs a scheme that has a host, got: ${settings.baseUrl}`, [
        "write it with http or https: --base-url https://your-domain.example/",
        "og:, twitter: and canonical URLs are fetched over the network, so the address has to name a host",
      ]);
    }
  }
  if (settings.baseUrl !== undefined && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(settings.baseUrl))) {
    const path = `/${String(settings.baseUrl).replace(/^\/+/, "")}`;
    throw new UsageError(`--base-url needs the site's whole address, got: ${settings.baseUrl}`, [
      `write it with the scheme and domain: --base-url https://your-domain.example${path.endsWith("/") ? path : `${path}/`}`,
      "only the full address can make og:/twitter:/canonical absolute, which is what share crawlers fetch",
    ]);
  }

  // §24.2 — `audit` writes nothing, so the two flags that describe writing are
  // refused rather than accepted inertly. `--clean` especially: a reader could
  // reasonably believe the output directory had been emptied, and a flag that
  // silently does nothing is the failure §14 exists to forbid.
  // The check reads the EFFECTIVE settings, not the parsed flags. §18 defines
  // `unify.yaml` as saved CLI flags — its keys are the long option names — so a
  // saved `clean: true` is `--clean`, and reading `options` let it through
  // inertly on the one path a reader is least likely to check. The fix line
  // names both spellings because the error cannot tell which one you used.
  if (command === "audit") {
    for (const [flag, value] of [["clean", settings.clean], ["dry-run", settings.dryRun]]) {
      if (value !== true) continue;
      throw new UsageError(`unify audit does not take --${flag}: audit never writes`, [
        `drop --${flag}, or remove \`${flag}\` from unify.yaml`,
        "audit runs the whole pipeline and reports on the site build would publish; run `unify build` to publish it",
      ]);
    }
  }

  // §18 — `--save-config` is `build`'s alone. With `--dry-run` it saves after
  // a dry run that exited 0: "check the flags, then keep them" — the one
  // thing a dry run then writes is unify.yaml, never dist/.
  let saving = null;
  if (options["save-config"]) {
    if (command !== "build") {
      throw new UsageError(`--save-config applies only to \`unify build\`, not \`unify ${command}\``, [
        "run it as: unify build <flags> --save-config",
      ]);
    }
    saving = saveEntries(options);
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

  return { settings, sourceRoot, sourceDefaulted, output, saving };
}
