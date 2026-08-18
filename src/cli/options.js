/**
 * The v0.7.0 argument surface. This is the whole CLI — an option that is not
 * here does not exist, and an unknown one exits 2 rather than being ignored.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../core/diagnostics.js";

const COMMANDS = ["build", "dev", "watch", "init"];

/** Long name → kind. `list` repeats, `string` takes a value, `flag` does not. */
const OPTIONS = {
  source: { kind: "string", short: "s" },
  output: { kind: "string", short: "o" },
  clean: { kind: "flag" },
  exclude: { kind: "list" },
  "pretty-urls": { kind: "flag" },
  "base-url": { kind: "string" },
  canonical: { kind: "string" },
  "dry-run": { kind: "flag" },
  strict: { kind: "flag" },
  port: { kind: "string", short: "p" },
  version: { kind: "flag", short: "v" },
  help: { kind: "flag", short: "h" },
};

/** Keys `unify.yaml` may carry — the long option names, minus the ones that make no sense to save. */
const CONFIG_KEYS = ["source", "output", "clean", "exclude", "pretty-urls", "base-url", "canonical", "strict", "port"];

const SHORT = Object.fromEntries(
  Object.entries(OPTIONS)
    .filter(([, spec]) => spec.short)
    .map(([name, spec]) => [spec.short, name]),
);

/**
 * @typedef {object} ParsedArgs
 * @property {string} command
 * @property {string|undefined} template - the positional argument to `init`
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
      throw new UsageError(`--${name} needs a value`, [`pass one, for example --${name} <value>`]);
    }
    if (spec.kind === "list") {
      const existing = /** @type {string[]} */ (options[name] ?? []);
      options[name] = [...existing, value];
    } else {
      options[name] = value;
    }
  }

  let command = "build";
  let template;
  if (positional.length > 0 && COMMANDS.includes(positional[0])) {
    command = positional.shift();
  }
  if (command === "init") template = positional.shift();

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
 * `unify.yaml` is saved flags and nothing more (§18). Parsed with a deliberately
 * tiny reader: scalars and one level of list. Anything richer would be a
 * configuration language, which §5 refuses.
 *
 * @param {string} sourceRoot
 * @returns {Record<string, string|boolean|string[]>}
 */
export function loadConfig(sourceRoot) {
  const path = join(sourceRoot, "unify.yaml");
  if (!existsSync(path)) return {};

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
