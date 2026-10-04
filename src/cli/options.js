/**
 * The argument surface. This is the whole CLI — an option that is not
 * here does not exist, and an unknown one exits 2 rather than being ignored.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../core/diagnostics.js";

const COMMANDS = ["build", "audit", "dev", "watch", "init", "update"];

/**
 * Long name → kind. `list` repeats, `string` takes a value, `flag` does not.
 * `example` supplies a real value for the missing-value fix line, where the
 * option has one worth naming.
 *
 * Every saveable option (CONFIG_KEYS) also carries `about` (one line, what it
 * does), `default` (what happens when it is left out) and `save` (the line an
 * author uncomments to change it). `configTemplate` below writes `unify.yaml`
 * from them, so the file `init` scaffolds can never fall behind this registry:
 * a saveable option added without the three fields fails the template test.
 */
const OPTIONS = {
  source: { kind: "string", short: "s", about: "the directory to build from", default: "site/ if it exists, else src/, else this directory", save: "source: site" },
  output: { kind: "string", short: "o", about: "the directory the site is published to", default: "dist", save: "output: public" },
  clean: { kind: "flag", about: "empty the output directory before publishing", default: "false", save: "clean: true" },
  exclude: { kind: "list", about: "glob patterns to leave out of the build, one per list item", default: "_*", save: "exclude:\n  - _*\n  - drafts/**" },
  "pretty-urls": { kind: "flag", about: "publish about.html as about/index.html so it is served at /about/", default: "false", save: "pretty-urls: true" },
  "base-url": { kind: "string", example: "https://your-domain.example/", about: "the site's absolute address; turns on sitemap.xml, feed.xml and absolute URLs", default: "none", save: "base-url: https://your-domain.example/" },
  canonical: { kind: "string", example: "auto", about: "auto adds a canonical link to every page that lacks one, none switches it off", default: "auto whenever base-url is set", save: "canonical: none" },
  // §29.6 — full-content feed entries. Boolean like every other flag here;
  // the "requires --base-url" usage error is cross-cutting validation (it
  // needs settings.baseUrl too), so it lives beside --canonical auto's own
  // equivalent check in cli.js, not in this registry.
  "feed-full": { kind: "flag", about: "put each post's full content in feed.xml instead of its description; needs base-url", default: "false", save: "feed-full: true" },
  "dry-run": { kind: "flag" },
  strict: { kind: "flag", about: "exit 1 on advisories too, not only on problems", default: "false", save: "strict: true" },
  // §24.8 — `build --audit`: gate the publish on the audit's findings. Boolean.
  audit: { kind: "flag", about: "with build, run the audit and publish nothing if it reports a finding; with init, keep the scaffold only if it audits clean", default: "false", save: "audit: true" },
  // §30.1 — flags rather than a consequence: unlike a sitemap or a feed,
  // nothing about a page declares "catalog me" or "index me", so there is no
  // record-derived condition that could activate either the way
  // `--base-url` activates §21. Independent of each other too: `catalog`
  // writes `assets/unify/catalog.json`, `search-corpus` writes
  // `assets/unify/search-corpus.json`, and neither implies the other.
  catalog: { kind: "flag", about: "write assets/unify/catalog.json, one record per published page", default: "false", save: "catalog: true" },
  "search-corpus": { kind: "flag", about: "write assets/unify/search-corpus.json, the text of every page for client-side search", default: "false", save: "search-corpus: true" },
  // §30.4 — catalog/corpus membership only: also list pages that are
  // excluded solely for being `noindex`. Needs --catalog or --search-corpus.
  "include-noindex": { kind: "flag", about: "also list noindex pages in the catalog and search corpus; needs one of them", default: "false", save: "include-noindex: true" },
  // §33.1 — a PATH to a JavaScript file (relative to the source root, or
  // absolute; anywhere on disk), never a command. Saved in unify.yaml like any
  // other long option.
  generate: { kind: "value", about: "a JavaScript file unify runs before every build, relative to this file", default: "none", save: "generate: scripts/gen.mjs" },
  // §33.7 — opt in to `source-pages.json` for the generator. A boolean, saveable;
  // naming it with no generator is a usage error (cli.js), like --include-noindex.
  "source-inventory": { kind: "flag", about: "hand that file source-pages.json: every source page's title, description, date, metas and links", default: "true whenever generate is set", save: "source-inventory: false" },
  // §31.1 — `unify audit`'s own output shape. This registry stays a
  // syntactic parser like every entry here: the closed set (human/json/sarif)
  // and its usage error are audit.js's own concern, the same split
  // `--canonical`'s value ("auto" only) already keeps between this file and
  // cli.js. Ignored by every command but `audit`, the same way `--clean` and
  // `--dry-run` are each read by exactly one command — unlike `--catalog`/
  // `--search-corpus`, which `build.js` reads and `audit` therefore observes
  // too, since `audit` runs the same build pipeline and never publishes it.
  format: { kind: "string", example: "json" },
  // §31.3 — the one network operation in the whole product (product-spec
  // §6.1: builds are offline and deterministic without qualification), so it
  // is a flag an author must pass explicitly rather than a consequence of
  // anything a page declares. Boolean; `cli/commands/audit.js` and
  // `core/external.js` do the rest.
  external: { kind: "flag" },
  // §18 — `build` only: upsert the saveable flags on this command line into
  // unify.yaml. Not itself saveable; cli.js enforces the rest.
  "save-config": { kind: "flag" },
  // §19.10 — `update` only: record the named template as the installed one
  // without changing a file (the recovery for a missing record).
  adopt: { kind: "flag" },
  port: { kind: "string", short: "p", about: "the port unify dev serves on", default: "3000", save: "port: 8080" },
  version: { kind: "flag", short: "v" },
  help: { kind: "flag", short: "h" },
};

/** Keys `unify.yaml` may carry — the long option names, minus the ones that make no sense to save. */
export const CONFIG_KEYS = ["source", "output", "clean", "exclude", "pretty-urls", "base-url", "canonical", "feed-full", "catalog", "search-corpus", "include-noindex", "strict", "audit", "port", "generate", "source-inventory"];

/**
 * §18/§19.8 — the `unify.yaml` that `init` writes at the project root: every
 * saveable option, each described in one line and commented out, so the file
 * documents the whole surface and changes nothing until a line is uncommented.
 * Only a value that differs from the default needs to be written; `set` names
 * the ones a template needs live (the docs template's `catalog: true`).
 *
 * @param {Record<string, string|boolean|string[]>} [set] - keys to write uncommented, with their values
 * @returns {string}
 */
export function configTemplate(set = {}) {
  for (const key of Object.keys(set)) {
    if (!CONFIG_KEYS.includes(key)) throw new Error(`configTemplate: ${key} is not a saveable option`);
  }
  const lines = [
    "# unify.yaml — saved flags for `unify build`, `audit`, `dev` and `watch`.",
    "# Keys are the long option names; a flag on the command line wins over this file.",
    "# Every option is listed with its default. Uncomment a line only to change it: a",
    "# default never needs writing. A relative path here resolves against this file.",
    "",
  ];
  for (const key of CONFIG_KEYS) {
    const { about, default: fallback, save } = OPTIONS[key];
    lines.push(`# ${about} (default: ${fallback})`);
    if (key in set) {
      const value = set[key];
      if (Array.isArray(value)) lines.push(`${key}:`, ...value.map((item) => `  - ${item}`));
      else lines.push(`${key}: ${value}`);
    } else {
      lines.push(...save.split("\n").map((line) => `# ${line}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}

const SHORT = Object.fromEntries(
  Object.entries(OPTIONS)
    .filter(([, spec]) => spec.short)
    .map(([name, spec]) => [spec.short, name]),
);

/**
 * @typedef {object} ParsedArgs
 * @property {string} command
 * @property {string|undefined} template - the positional argument to `init` and `update`
 * @property {Record<string, string|boolean|string[]>} options
 */

/**
 * @param {string[]} argv - arguments after the executable and script
 * @returns {ParsedArgs}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string|boolean|string[]>} */
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (!arg.startsWith("-") || arg === "-") {
      positional.push(arg);
      continue;
    }

    let name;
    let inlineValue;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    } else {
      if (arg.length !== 2) throw unknownOption(arg);
      name = SHORT[arg[1]];
      if (!name) throw unknownOption(arg);
    }

    const spec = OPTIONS[name];
    if (!spec) throw unknownOption(arg);

    if (spec.kind === "flag") {
      if (inlineValue !== undefined) {
        throw new UsageError(`--${name} does not take a value`, [`drop the =${inlineValue}`]);
      }
      options[name] = true;
      continue;
    }

    const value = inlineValue ?? argv[++i];
    if (value === undefined) {
      // Name a real value where the option has one worth naming. `--canonical`
      // is the likeliest typo of the pair (`auto` is its only value), and a fix
      // line reading `--canonical <value>` names nothing.
      throw new UsageError(`--${name} needs a value`, [
        spec.example ? `write it as: --${name} ${spec.example}` : `pass one, for example --${name} <value>`,
      ]);
    }
    if (spec.kind === "list") {
      const existing = /** @type {string[]} */ (options[name] ?? []);
      options[name] = [...existing, value];
    } else {
      // A repeated single-value option used to keep the last one and discard
      // the rest in silence — `-o dist -o other` published to `other` at exit
      // 0, and a second `--generate` ran instead of the first rather than as
      // well as it. That is an author's instruction dropped without a word,
      // which is the failure this product refuses everywhere else; the CLI
      // boundary was simply the one place nothing was watching. A repeated
      // FLAG stays fine (`--strict --strict` asks for the same thing twice)
      // and so does a repeated `list` option, which is what --exclude is for.
      if (name in options) {
        throw new UsageError(`--${name} given more than once`, [
          name === "generate"
            ? `unify runs one generator: put the tasks inside that one file (have it import and call the others)`
            : `pass it once — every value but the last was being discarded`,
        ]);
      }
      options[name] = value;
    }
  }

  let command = "build";
  let template;
  if (positional.length > 0 && COMMANDS.includes(positional[0])) {
    command = positional.shift();
  }
  if (command === "init" || command === "update") template = positional.shift();

  if (positional.length > 0) {
    throw new UsageError(`unexpected argument: ${positional[0]}`, ["run `unify --help` for the full surface"]);
  }

  return { command, template, options };
}

/**
 * @param {string} arg
 * @returns {UsageError}
 */
function unknownOption(arg) {
  return new UsageError(`unknown option: ${arg}`, ["run `unify --help` for the full surface"]);
}

/**
 * §18 — where `unify.yaml` is: in the source root if one is there, else at
 * the project root (the working directory), else nowhere — in which case the
 * path returned is the project root's, where `--save-config` creates it.
 *
 * The file is build tooling, not content, so it belongs beside `package.json`
 * rather than inside the content directory; that is also what lets it name
 * the source directory (`source: site`), which a file inside that directory
 * could not do before the directory was known. The source root's copy wins
 * when both exist, so no site that already keeps one there changes.
 *
 * @param {string} sourceRoot
 * @param {string} [projectRoot]
 * @returns {{path: string, exists: boolean}}
 */
export function configPath(sourceRoot, projectRoot = process.cwd()) {
  const inSource = join(sourceRoot, "unify.yaml");
  if (existsSync(inSource)) return { path: inSource, exists: true };
  const inProject = join(projectRoot, "unify.yaml");
  if (existsSync(inProject)) return { path: inProject, exists: true };
  return { path: inProject, exists: false };
}

/**
 * `unify.yaml` is saved flags and nothing more (§18). Parsed with a deliberately
 * tiny reader: scalars and one level of list. Anything richer would be a
 * configuration language, which §5 refuses.
 *
 * @param {string} sourceRoot
 * @param {string} [projectRoot] - see `configPath`
 * @returns {Record<string, string|boolean|string[]>}
 */
export function loadConfig(sourceRoot, projectRoot = process.cwd()) {
  const { path, exists } = configPath(sourceRoot, projectRoot);
  if (!exists) return {};

  /** @type {Record<string, string|boolean|string[]>} */
  const config = {};
  let listKey = null;

  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    // A whole-line comment is the commonest thing in a YAML file and used to
    // be a fatal usage error here: the trailing-comment strip below requires
    // whitespace before the `#`, so a `# Build settings` at column 0 reached
    // the key/value match, failed it, and exited 2. Found by a ratification
    // round whose fixture carried one (round 18).
    if (/^\s*#/.test(raw)) continue;
    // Trailing comments still need the preceding whitespace, which is what
    // keeps a `#` inside a value — `base-url: https://x.example/#frag` — from
    // being eaten.
    const line = raw.replace(/\s+#.*$/, "");
    if (line.trim() === "") continue;

    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      /** @type {string[]} */ (config[listKey]).push(unquote(item[1].trim()));
      continue;
    }

    const entry = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!entry) {
      throw new UsageError(`unify.yaml: cannot read line: ${raw.trim()}`, [
        "unify.yaml holds saved flags only — keys with scalar or list values",
      ]);
    }

    const [, key, value] = entry;
    if (!CONFIG_KEYS.includes(key)) {
      throw new UsageError(`unify.yaml: unknown key: ${key}`, [
        `keys are the long option names: ${CONFIG_KEYS.join(", ")}`,
      ]);
    }

    if (value === "") {
      config[key] = [];
      listKey = key;
      continue;
    }
    listKey = null;
    if (value === "true" || value === "false") config[key] = value === "true";
    else config[key] = unquote(value.trim());
  }

  return config;
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  const quoted = value.match(/^(['"])(.*)\1$/);
  return quoted ? quoted[2] : value;
}

/**
 * CLI wins on conflict; the file only supplies what the flags left unset.
 * @param {Record<string, any>} flags
 * @param {Record<string, any>} config
 * @returns {Record<string, any>}
 */
export function mergeConfig(flags, config) {
  const merged = { ...config };
  for (const [key, value] of Object.entries(flags)) merged[key] = value;
  return merged;
}
