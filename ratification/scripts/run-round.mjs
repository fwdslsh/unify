#!/usr/bin/env bun
/**
 * run-round.mjs — one ratification round, end to end: build the unify under test, give
 * each sample agent a brief, the authoring rules and that binary in an isolated
 * directory, then judge, rebuild, check and score what it published.
 *
 *   bun run ratify [-- options]
 *
 *   --brief <name>     a brief under ratification/briefs/ (repeatable; default: all of them)
 *   --model <id>       an OpenCode model, provider/model as `opencode models` lists it
 *                      (required, repeatable); `free` selects free OpenCode Zen models
 *   --expect-context <n>  refuse a different configured context; never overrides it
 *   --samples <n>      samples per brief and model (default 5)
 *   --name <id>        the round's directory name (default: time and unify ref)
 *   --rejudge <dir>    score a finished round again, with the checks as they are now
 *   --check            check prerequisites/configuration/isolation without model inference
 *   --status <dir>     show progress without running or judging anything
 *   --list             list the briefs
 *
 * Everything a round writes is under ratification/rounds/<id>/ (gitignored):
 *   SUMMARY.md, results.json   the score, per sample and check, and the agents' own notes
 *   round.json                 what ran: unify commit and version, rules and prompt hashes
 *   <brief>/<sample>/          the agent's working directory, exactly as it left it
 *   <brief>/.harness/<sample>/ the agent's event stream, stderr and OpenCode session data
 *   <brief>/.build/<sample>/   the fresh build every check reads
 *
 * Exit: 0 when the 4/5-per-brief bar is met, 1 when it is not, 2 when incomplete or blocked.
 * Diagnostic rounds with fewer than five samples require every sample to pass for exit 0.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, copyFileSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync, renameSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { privateSeedValues } from "./seed-values.mjs";
import { CHECKS } from "./checks.mjs";
import { isolationEnvironment } from "./isolation.mjs";
import { executionFailure, runSerial, scoreVerdict } from "./run-state.mjs";
import { POLICY, assertCommittedInputs, sampleConfig, sampleEnvironment, parseModels, modelSettings } from "./run-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAT = resolve(HERE, "..");
const REPO = resolve(RAT, "..");
const BRIEFS = join(RAT, "briefs");
const ROUNDS = join(RAT, "rounds");
const ISOLATE = join(HERE, "isolate.sh");
const JUDGE = join(HERE, "judge-round.mjs");
const BUILD_TIMEOUT_MS = 240_000;

const say = (s = "") => process.stdout.write(`${s}\n`);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const duration = (ms) => (ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`);

class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };

/** Run a command to completion; with `check`, a non-zero exit stops the round. */
function run(cmd, args, { check = true, ...opts } = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.error && check) stop(`${cmd}: ${r.error.message}`);
  if (check && r.status !== 0) stop(`${cmd} ${args.join(" ")} exited ${r.status}\n${r.stderr || r.stdout || ""}`);
  return { exit: r.status, error: r.error?.message ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const git = (...args) => run("git", args, { cwd: REPO }).stdout.trim();
const has = (tool) => run("bash", ["-c", `command -v ${tool}`], { check: false }).exit === 0;

function copyBinary(from, to) {
  copyFileSync(from, to);
  chmodSync(to, 0o755); // Never share a writable inode between independent samples.
}

// ------------------------------------------------------------------ briefs

const briefNames = () => readdirSync(BRIEFS).filter((n) => existsSync(join(BRIEFS, n, "brief.json"))).sort();

function loadBrief(name) {
  if (!briefNames().includes(name)) stop(`unknown brief: ${name}`);
  const dir = join(BRIEFS, name);
  if (!existsSync(join(dir, "brief.json"))) stop(`no brief "${name}"; the briefs are: ${briefNames().join(", ")}`);
  const brief = { name, dir, ...readJson(join(dir, "brief.json")), text: readFileSync(join(dir, "BRIEF.md"), "utf8") };
  if (brief.checks?.some(c => c.check === "privacy")) {
    const seed = readJson(join(dir, "seed", brief.judge?.seedFile ?? "varieties.json"));
    brief.privateValues = brief.judge?.privateValues ?? privateSeedValues(seed, brief.judge?.privateFields);
    if (!brief.privateValues.length) stop(`brief ${name} has no committed privacy expectations`);
  }
  return brief;
}

// -------------------------------------------------------- the unify under test

/** Build the binary every sample gets, and read the authoring rules from the same tree. */
function prepareUnify(ref, roundDir) {
  const bin = join(roundDir, "bin", "unify");
  mkdirSync(dirname(bin), { recursive: true });
  const root = REPO;
  const commit = git("rev-parse", "HEAD");
  const dirty = null;
  if (!existsSync(join(REPO, "node_modules"))) run("bun", ["install", "--frozen-lockfile"], { cwd: REPO });
  run("bun", ["build", "--compile", join(root, "src", "cli.js"), "--outfile", bin], { cwd: root });
  const rules = readFileSync(join(root, "docs", "authoring-rules.md"), "utf8");
  return { ref, commit, dirty, version: run(bin, ["--version"]).stdout.trim(), rules };
}

// -------------------------------------------------------------- isolation

/**
 * What OpenCode can use, as `opencode models --verbose` prints it: `provider/model` on a
 * line of its own, then that model's JSON.
 */
function opencodeModels(provider) {
  const text = run("opencode", ["models", ...(provider ? [provider] : []), "--verbose", "--pure"], { cwd: REPO }).stdout;
  return parseModels(text);
}

/** `free` becomes every free OpenCode Zen model that can call tools; any other name must be one OpenCode lists. */
function resolveModels(requested) {
  const models = [];
  for (const name of requested) {
    if (name === "free") {
      const free = opencodeModels("opencode")
        .filter((m) => m.cost?.input === 0 && m.cost?.output === 0 && m.capabilities?.toolcall && m.status !== "deprecated")
        .map((m) => m.id);
      if (!free.length) stop("OpenCode lists no free models: `opencode models opencode` shows what it offers");
      models.push(...free);
    } else {
      models.push(name);
    }
  }
  const known = new Set(opencodeModels().map((m) => m.id));
  const unknown = models.filter((m) => !known.has(m));
  if (unknown.length) stop(`OpenCode does not list ${unknown.join(", ")}: \`opencode models\` shows the models it can use`);
  return [...new Set(models)];
}

/**
 * The OpenCode a sample runs: the user's providers and credentials, and nothing else of
 * theirs — no instructions, agents, commands, MCP servers or skills (isolate.sh
 * hides the files; these variables cover the rest). Every permission is answered in
 * advance, so nothing waits for a person: file and shell tools work inside the sample's
 * directory; subagents (whose commands would not reach the sample's event stream), skills,
 * the web tools, questions and other directories are refused.
 */
function sampleEnv(model, masks) {
  const resolved = run("opencode", ["debug", "config", "--pure"], { check: false, cwd: REPO });
  if (resolved.exit !== 0) stop("could not read OpenCode configuration; check `opencode debug config` in this checkout");
  const env = sampleEnvironment(process.env);
  let user;
  try { user = JSON.parse(resolved.stdout); } catch { stop("invalid installed OpenCode configuration"); }
  const config = sampleConfig(user, model);
  const auth = join(process.env.XDG_DATA_HOME ?? join(process.env.HOME, ".local", "share"), "opencode", "auth.json");
  return {
    ...isolationEnvironment(masks, env),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    ...(!env.OPENCODE_AUTH_CONTENT && existsSync(auth) ? { OPENCODE_AUTH_CONTENT: readFileSync(auth, "utf8") } : {}),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
  };
}

const LEAK_NAMES = ["conformance-spec.md", "product-spec.md", "authoring-rules.md", "ratification-protocol.md", "judge-round.mjs"];

/** Look for unify's own documentation from where a sample stands. Returns what it found. */
function probe(roundDir, env) {
  const dir = join(roundDir, ".probe");
  mkdirSync(join(dir, "sandbox"), { recursive: true });
  const names = LEAK_NAMES.map((n) => `-name ${n}`).join(" -o ");
  const find = `find / \\( -path /proc -o -path /sys -o -path /dev -o -path /run \\) -prune -o \\( ${names} -o -path '*@fwdslsh*' -o -path '*unify-*-template*' \\) -print 2>/dev/null | head -40`;
  const r = run(ISOLATE, [join(dir, "sandbox"), REPO, join(dir, "state"), "bash", "-c", find], { env, check: false, timeout: 600_000 });
  if (r.exit !== 0) {
    stop(`isolation failed (isolate.sh exited ${r.exit}): ${r.stderr.trim()}\n` +
      "Samples run in a mount namespace: run as root, or allow unprivileged user namespaces " +
      "(sysctl kernel.apparmor_restrict_unprivileged_userns=0 on Ubuntu 23.10+), or run inside a Linux container.");
  }
  return r.stdout.trim().split("\n").filter(Boolean);
}

/** Run a shell command in a site copy, seen as /tmp/sandbox exactly as the agent saw its own directory. */
function isolated(site, state, command, masks) {
  return run(ISOLATE, [site, REPO, state, "bash", "-c", command], { env: isolationEnvironment(masks), check: false, timeout: BUILD_TIMEOUT_MS });
}

// ------------------------------------------------------------------ launch

function launch(job) {
  return new Promise((done) => {
    mkdirSync(job.harness, { recursive: true });
    const fds = [openSync(job.prompt, "r"), openSync(join(job.harness, "events.jsonl"), "w"), openSync(join(job.harness, "agent-stderr.txt"), "w")];
    const started = Date.now();
    let settled = false;
    const finish = (exit, signal, error) => {
      if (settled) return;
      settled = true;
      fds.forEach((fd) => closeSync(fd));
      const record = { exit, signal, error, timedOut: exit === 124, durationMs: Date.now() - started };
      writeFileSync(join(job.harness, "exit.json"), `${JSON.stringify(record, null, 2)}\n`);
      done(record);
    };
    const child = spawn(ISOLATE, [job.sample, REPO, join(job.harness, "opencode"), ...job.command], { env: job.env, stdio: fds });
    child.on("error", (e) => finish(null, null, e.message));
    child.on("close", (code, signal) => finish(code, signal, null));
  });
}

function agentCommand(model, brief) {
  const secs = String(Number(brief.timeoutSecs ?? 1800));
  return ["timeout", "-k", "30", secs, "opencode", "run", "--pure", "--format", "json", "--model", model];
}

async function newRound(opts) {
  if (!opts.model.length) stop("--model is required; select an installed model without changing its configuration");
  assertCommittedInputs(REPO);
  opts.mask = [];
  if (opts["expect-context"] !== undefined) {
    const value = Number(opts["expect-context"]);
    if (!Number.isSafeInteger(value) || value <= 0) stop("--expect-context must be a positive whole number");
    opts.expectedContext = value;
  }
  if (process.platform !== "linux") stop("rounds run on Linux: samples are isolated with mount namespaces. Use a Linux machine, VM or container.");
  for (const tool of ["unshare", "git", "bun", "timeout", "find", "tar", "opencode"]) {
    if (!has(tool)) stop(tool === "opencode" ? "OpenCode is not installed: npm install -g opencode-ai (https://opencode.ai)" : `${tool} is not installed`);
  }
  mkdirSync(ROUNDS, { recursive: true });
  const briefs = [...new Set(opts.brief.length ? opts.brief : briefNames())].map(loadBrief);
  const models = resolveModels(opts.model);
  // Refuse mismatches before compiling or preparing any sample.
  const configured = opencodeModels();
  for (const model of models) modelSettings(configured, model, opts.expectedContext);
  if (new Set(models.map(slug)).size !== models.length) stop("selected model IDs collide as directory names");
  const per = Number(opts.samples ?? 5);
  if (!Number.isInteger(per) || per < 1) stop("--samples must be a whole number of at least 1");
  const ref = "HEAD";
  const id = opts.name ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(ref)}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) stop("--name must be a simple directory name");
  const dir = join(ROUNDS, id);
  if (existsSync(dir)) stop(`${relative(REPO, dir)} already exists; pass another --name`);
  mkdirSync(dir, { recursive: true });
  try {
    const result = await prepareAndRun(opts, { id, dir, ref, briefs, models, per });
    if (opts.check) rmSync(dir, { recursive: true, force: true });
    return result;
  } catch (e) {
    if (!existsSync(join(dir, "round.json"))) rmSync(dir, { recursive: true, force: true }); // nothing ran: leave nothing
    throw e;
  }
}

async function prepareAndRun(opts, { id, dir, ref, briefs, models, per }) {
  say(`round ${id}`);
  say(`  building unify from ${ref}…`);
  const unify = prepareUnify(ref, dir);
  say(`  unify ${unify.version} at ${unify.commit.slice(0, 12)}${unify.dirty ? ` + uncommitted changes (${unify.dirty})` : ""}`);
  const rules = `\`\`\`markdown\n${unify.rules}\`\`\`\n`;
  writeFileSync(join(dir, "rules.md"), rules);
  const contract = readFileSync(join(BRIEFS, "PROMPT.md"), "utf8");

  const envs = Object.fromEntries(models.map((m) => [m, sampleEnv(m, opts.mask)]));
  say(`  models: ${models.join(", ")}`);
  say("  checking that a sample cannot read unify's own documentation…");
  const leaks = probe(dir, envs[models[0]]);
  if (leaks.length) {
    stop(`a sample could read unify's own documentation:\n  ${leaks.join("\n  ")}\nUse a clean isolated environment; do not patch the runner or add custom masks.`);
  }
  const effectiveModels = {};
  for (const model of models) {
    const available = run(ISOLATE, [join(dir, ".probe", "sandbox"), REPO, join(dir, ".probe", "state"), "opencode", "models", "--verbose", "--pure"],
      { env: envs[model], check: false, timeout: 120_000 });
    if (available.exit !== 0) {
      stop(`OpenCode cannot load ${model} inside sample isolation without external plugins. Check provider and credential-file availability. No samples were launched.`);
    }
    effectiveModels[model] = modelSettings(parseModels(available.stdout), model, opts.expectedContext);
    const limits = effectiveModels[model];
    say(`  ${model}: context ${limits.context}, output ${limits.output}${limits.input !== undefined ? `, input ${limits.input}` : ""}; external plugins disabled`);
  }

  if (opts.check) { say("Preflight passed. No model inference was run."); return 0; }

  const jobs = [];
  const manifestBriefs = briefs.map((brief) => {
    const bdir = join(dir, brief.name);
    const prompt = join(bdir, "PROMPT.md");
    mkdirSync(bdir, { recursive: true });
    const instructions = `${contract}\n---\n\n${brief.text}`;
    writeFileSync(prompt, instructions);
    const samples = [];
    for (const model of models) {
      for (let n = 1; n <= per; n++) {
        const name = `${slug(model)}-${n}`;
        const sample = join(bdir, name);
        mkdirSync(sample);
        if (existsSync(join(brief.dir, "seed"))) cpSync(join(brief.dir, "seed"), sample, { recursive: true });
        writeFileSync(join(sample, "BRIEF.md"), brief.text);
        // The same original instructions stay in the system context after compaction.
        writeFileSync(join(sample, "AGENTS.md"), instructions);
        writeFileSync(join(sample, "rules.md"), rules);
        copyBinary(join(dir, "bin", "unify"), join(sample, "unify"));
        samples.push({ name, model });
        jobs.push({ label: `${brief.name}/${name}`, sample, prompt, harness: join(bdir, ".harness", name), env: envs[model], command: agentCommand(model, brief) });
      }
    }
    return { name: brief.name, title: brief.title, origin: brief.origin, sha256: sha(brief.text), samples };
  });

  const round = {
    id,
    created: new Date().toISOString(),
    unify: { ref, commit: unify.commit, dirty: unify.dirty, version: unify.version },
    rules: { sha256: sha(unify.rules) },
    prompt: { sha256: sha(contract) },
    agent: `opencode ${run("opencode", ["--version"]).stdout.trim()}`,
    executionPolicy: POLICY,
    concurrency: 1,
    models,
    modelSettings: effectiveModels,
    externalPlugins: false,
    persistentInstructions: "AGENTS.md (identical to PROMPT.md)",
    ...(opts.expectedContext !== undefined ? { expectedContext: opts.expectedContext } : {}),
    samplesPerModel: per,
    status: "prepared",
    isolation: { mode: process.getuid?.() === 0 ? "mount namespace" : "user and mount namespace", probe: "clean", masks: opts.mask },
    briefs: manifestBriefs,
  };
  writeFileSync(join(dir, "round.json"), `${JSON.stringify(round, null, 2)}\n`);

  say(`  launching ${jobs.length} samples serially…`);
  const complete = await runSerial(jobs, {
    launch: async (job) => {
      say(`  started  ${job.label}`);
      const r = await launch(job);
      say(`  finished ${job.label}: exit ${r.exit}${r.timedOut ? " (timed out)" : ""} after ${duration(r.durationMs)}`);
      return r;
    },
    inspect: (job) => agentEvents(job.harness),
    checkpoint: (state) => {
      Object.assign(round, state, { updated: new Date().toISOString() });
      const path = join(dir, "round.json");
      writeFileSync(path + ".tmp", `${JSON.stringify(round, null, 2)}\n`);
      renameSync(path + ".tmp", path);
    },
  });
  if (complete) round.finished = new Date().toISOString();
  else say("Provider/agent infrastructure failed. Remaining samples were not launched; this round is incomplete.");
  writeFileSync(join(dir, "round.json"), `${JSON.stringify(round, null, 2)}\n`);
  return score(dir);
}

// ----------------------------------------------------------------- scoring

/** The judge's record for every sample of one brief, from builds run where the agent ran. */
function judgeBrief(bdir, brief, masks) {
  const config = join(bdir, "judge.json");
  const out = join(bdir, "judge-results.json");
  writeFileSync(config, `${JSON.stringify({ ...brief.judge, binary: join(dirname(bdir), "bin", "unify"), ...(brief.privateValues ? { privateValues: brief.privateValues } : {}), isolate: { script: ISOLATE, repo: REPO, state: join(bdir, ".harness", ".judge"), masks } }, null, 2)}\n`);
  rmSync(out, { force: true });
  run(process.execPath, [JUDGE, bdir, "--config", config, "--out", out], { check: false });
  return readJson(out)?.samples ?? [];
}

/** First lines of the REPORT.md answer about what the rules did not say. */
function rulesGaps(sample) {
  const lines = (existsSync(join(sample, "REPORT.md")) ? readFileSync(join(sample, "REPORT.md"), "utf8") : "").split("\n");
  const at = lines.findIndex((l) => /not answer|didn['’]t answer/i.test(l));
  if (at === -1) return null;
  const end = lines.findIndex((l, i) => i > at && /^(#{1,6} |\s*\d+\.\s|\*\*\d)/.test(l));
  return lines.slice(at, end === -1 ? at + 12 : Math.min(end, at + 12)).join("\n").trim();
}

/**
 * What a run's OpenCode said about it: steps, cost and first error from the event stream.
 * A model error OpenCode keeps retrying — a provider's usage limit — never reaches the
 * stream, and the run idles to its timeout; the session log is where it says why.
 */
function agentEvents(harness) {
  const file = join(harness, "events.jsonl");
  const events = (existsSync(file) ? readFileSync(file, "utf8") : "").split("\n").flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
  const steps = events.filter((e) => e.type === "step_finish");
  const error = events.find((e) => e.type === "error")?.error;
  const logs = join(harness, "opencode", "log");
  const logged = (existsSync(logs) ? readdirSync(logs).sort() : [])
    .flatMap((f) => [...readFileSync(join(logs, f), "utf8").matchAll(/level=ERROR .*?error\.error="([^"]*)"/g)].map((m) => m[1]));
  return {
    turns: events.length ? steps.length : null,
    costUsd: steps.length ? steps.reduce((a, e) => a + (e.part?.cost ?? 0), 0) : null,
    error: error ? (error.data?.message ?? error.name ?? "error") : null,
    errorName: error?.name ?? null,
    logged: logged.at(-1) ?? null,
  };
}

function scoreSample(dir, bdir, brief, { name, model }, judge, masks) {
  const sample = join(bdir, name);
  const harness = join(bdir, ".harness", name);
  const exit = readJson(join(harness, "exit.json")) ?? {};
  const agent = agentEvents(harness);
  const reported = existsSync(join(sample, "REPORT.md"));
  const command = judge?.chosenCommand ?? null;

  // A fresh build of the sample's own command, in a copy, so its directory stays the evidence.
  const site = join(bdir, ".build", name);
  rmSync(site, { recursive: true, force: true });
  let out = null;
  let build = null;
  if (command && !judge.run.refused && judge.outputDir != null) {
    cpSync(sample, site, { recursive: true, verbatimSymlinks: true, filter: (src) => src !== join(sample, "unify") });
    copyBinary(join(dir, "bin", "unify"), join(site, "unify"));
    const o = judge.outputDir;
    out = /^\/tmp\/sandbox(\/|$)/.test(o) ? join(site, o.slice("/tmp/sandbox".length)) : isAbsolute(o) ? o : join(site, o);
    out = resolve(out);
    if (!out.startsWith(site + "/")) {
      out = null;
      build = { exit: null, stderr: "output must be inside the sample directory", stdout: "" };
    } else {
      rmSync(out, { recursive: true, force: true });
      build = isolated(site, join(bdir, ".harness", ".build"), command.replace(/^unify\b/, "./unify"), masks);
    }
  }

  const ctx = {
    out, site, privateValues: brief.privateValues, command: judge?.buildCommand ?? command, judge, baseUrl: brief.baseUrl, events: join(harness, "events.jsonl"),
    exec: (c) => isolated(site, join(bdir, ".harness", ".build"), c, masks),
  };
  const strict = !judge
    ? { pass: false, detail: "not judged: no REPORT.md" }
    : judge.run.exit === null
      ? { pass: false, detail: judge.run.refused ?? judge.run.error ?? "not run" }
      : { pass: judge.run.exit === 0, detail: `exit ${judge.run.exit}: ${judge.run.problems ?? 0} problems, ${judge.run.advisories ?? 0} advisories${judge.run.diagnostics?.[0] ? ` — ${judge.run.diagnostics[0]}` : ""}` };
  const checks = [
    {
      id: "agent-finished", scored: true,
      pass: exit.exit === 0 && !agent.error && reported,
      detail: `${exit.exit == null ? `killed (${exit.signal ?? exit.error ?? "no exit code"})` : `exit ${exit.exit}`}${exit.timedOut ? " (timed out)" : ""}` +
        `${agent.error ? `, agent error: ${agent.error}` : agent.logged && !reported ? `, OpenCode logged: ${agent.logged}` : ""}, ${reported ? "wrote REPORT.md" : "no REPORT.md"}`,
    },
    { id: "publish-command", scored: true, pass: Boolean(command), detail: command ?? judge?.chosenReason ?? "no REPORT.md" },
    { id: "strict-build", scored: true, ...strict },
    { id: "fresh-build", scored: true, pass: build?.exit === 0,
      detail: build ? `exit ${build.exit}${build.exit !== 0 ? `: ${(build.stderr + "\n" + build.stdout).trim().split("\n").slice(-4).join(" / ")}` : ""}` : "publish command could not be rebuilt" },
    ...(brief.checks ?? []).map(({ id, check, scored = true, ...params }) => {
      const fn = CHECKS[check];
      if (!fn) return { id: id ?? check, scored, pass: false, detail: `unknown check "${check}"` };
      try {
        return { id: id ?? check, scored, ...fn(ctx, params) };
      } catch (e) {
        return { id: id ?? check, scored, pass: false, detail: `check failed: ${e.message}` };
      }
    }),
  ];
  return {
    name, model,
    pass: checks.filter((c) => c.scored).every((c) => c.pass),
    checks,
    agent: { exit: exit.exit ?? null, timedOut: Boolean(exit.timedOut), durationMs: exit.durationMs ?? null, turns: agent.turns, costUsd: agent.costUsd, failure: executionFailure(exit, agent) },
    freshBuild: build && { command, exit: build.exit },
    rulesGaps: rulesGaps(sample),
  };
}

function score(dir) {
  const round = readJson(join(dir, "round.json")) ?? stop(`${dir} has no round.json`);
  const pending = round.briefs.flatMap(b => b.samples.filter(s => !existsSync(join(dir, b.name, ".harness", s.name, "exit.json"))));
  if (round.status === "running" && pending.length) stop("round is still running; use --status instead of --rejudge");
  const masks = round.isolation?.masks ?? [];
  say(`scoring ${round.id}…`);
  const results = { round: round.id, scoredAt: new Date().toISOString(), briefs: [] };
  for (const b of round.briefs) {
    const brief = loadBrief(b.name);
    const bdir = join(dir, b.name);
    const judged = judgeBrief(bdir, brief, masks);
    results.briefs.push({
      name: b.name, title: brief.title, origin: brief.origin,
      briefChanged: sha(brief.text) !== b.sha256,
      samples: b.samples.filter(s => existsSync(join(bdir, ".harness", s.name, "exit.json"))).map((s) => scoreSample(dir, bdir, brief, s, judged.find((j) => j.sample === s.name), masks)),
    });
  }
  results.verdict = scoreVerdict(results.briefs, round.models, round.briefs.reduce((n, b) => n + b.samples.length, 0));
  const summary = renderSummary(round, results);
  writeFileSync(join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(join(dir, "SUMMARY.md"), summary);
  say();
  say(summary);
  say(`written: ${relative(process.cwd(), join(dir, "SUMMARY.md"))} and results.json`);
  return results.verdict.exitCode;
}

// ----------------------------------------------------------------- summary

function renderSummary(round, results) {
  const all = results.briefs.flatMap((b) => b.samples);
  const passed = all.filter((s) => s.pass).length;
  const cost = all.reduce((a, s) => a + (s.agent.costUsd ?? 0), 0);
  const cell = (c) => (c.pass ? "✓" : "✗") + (c.scored ? "" : " (i)");
  const md = [];
  const groups = results.briefs.flatMap((b) => round.models.map((m) => ({ brief: b.name, model: m, samples: b.samples.filter((s) => s.model === m) })));
  const bar = !results.verdict.complete ? "**incomplete: unattempted samples are not failures or passes**"
    : results.verdict.barMet === null ? "not measured: at least 5 samples per brief and model are required"
    : results.verdict.barMet ? "**met**" : "**not met**";

  md.push(`# Ratification round ${round.id}`, "");
  md.push(`- **unify** ${round.unify.version} at \`${round.unify.commit.slice(0, 12)}\`${round.unify.ref === "worktree" ? " (working tree)" : ` (${round.unify.ref})`}${round.unify.dirty ? `, plus uncommitted changes \`${round.unify.dirty}\`` : ""}`);
  md.push(`- **rules** \`${round.rules.sha256.slice(0, 12)}\` · **prompt** \`${round.prompt.sha256.slice(0, 12)}\` · **agent** ${round.agent} · **models** ${round.models.join(", ")} · **isolation** ${round.isolation.mode}, probe ${round.isolation.probe}`);
  for (const [model, limits] of Object.entries(round.modelSettings ?? {})) {
    md.push(`- **${model} limits**: context ${limits.context}, output ${limits.output}${limits.input !== undefined ? `, input ${limits.input}` : ""}; external plugins ${round.externalPlugins ? "enabled" : "disabled"}`);
  }
  md.push(`- ${round.created}${round.finished ? ` to ${round.finished}` : ""}; scored ${results.scoredAt}${cost ? `; agent cost $${cost.toFixed(2)}` : ""}`, "");
  md.push("## Score", "");
  md.push(`Completed ${results.verdict.completed}/${results.verdict.expected} planned samples.`, "");
  md.push(`**${passed} of ${all.length} samples completed their brief: every scored check passed (${all.length ? Math.round((100 * passed) / all.length) : 0}%).**`, "");
  md.push(`The protocol's bar, at least 4 of 5 samples of a model on each brief: ${bar}.`, "");
  md.push("| Brief | Model | Passed | Checks that failed |", "|---|---|---|---|");
  for (const g of groups) {
    const fails = {};
    for (const s of g.samples) for (const c of s.checks) if (c.scored && !c.pass) fails[c.id] = (fails[c.id] ?? 0) + 1;
    md.push(`| ${g.brief} | ${g.model} | ${g.samples.filter((s) => s.pass).length}/${g.samples.length} | ${Object.entries(fails).map(([id, n]) => `${id} (${n})`).join(", ") || "—"} |`);
  }

  for (const b of results.briefs) {
    const ids = [...new Set(b.samples.flatMap((s) => s.checks.map((c) => c.id)))];
    md.push("", `## ${b.name} — ${b.title}`, "");
    if (b.origin) md.push(`*${b.origin}.*${b.briefChanged ? " **BRIEF.md has changed since this round ran.**" : ""}`, "");
    md.push(`| Sample | Time | Turns | Cost | ${ids.join(" | ")} | Result |`, `|---|---|---|---|${ids.map(() => "---|").join("")}---|`);
    for (const s of b.samples) {
      const byId = Object.fromEntries(s.checks.map((c) => [c.id, c]));
      md.push(`| ${s.name} | ${duration(s.agent.durationMs)} | ${s.agent.turns ?? "—"} | ${s.agent.costUsd == null ? "—" : `$${s.agent.costUsd.toFixed(2)}`} | ${ids.map((id) => (byId[id] ? cell(byId[id]) : "")).join(" | ")} | ${s.pass ? "**pass**" : "fail"} |`);
    }
    const notes = b.samples.flatMap((s) => s.checks.filter((c) => !c.pass || !c.scored).map((c) => `- ${s.name} · **${c.id}**${c.scored ? "" : " (not scored)"}: ${c.detail}`));
    if (notes.length) md.push("", ...notes);
    const gaps = b.samples.filter((s) => s.rulesGaps);
    if (gaps.length) {
      md.push("", "What the agents said the rules did not answer:", "");
      for (const s of gaps) md.push(`**${s.name}**`, "", ...s.rulesGaps.split("\n").map((l) => `> ${l}`), "");
    }
  }
  md.push("", "---", "", "`✓` passed, `✗` failed, `(i)` reported but not scored. Each sample's directory is " +
    "`<brief>/<sample>/`, its OpenCode event stream and session data are in `<brief>/.harness/<sample>/`, and the build the checks read is " +
    "`<brief>/.build/<sample>/`. Triage every failure with ratification/ratification-protocol.md before changing anything.", "");
  return md.join("\n");
}

// -------------------------------------------------------------------- main

async function main() {
  const { values: opts } = parseArgs({
    options: {
      brief: { type: "string", multiple: true, default: [] },
      model: { type: "string", multiple: true, default: [] }, samples: { type: "string" },
      name: { type: "string" }, rejudge: { type: "string" }, list: { type: "boolean" },
      check: { type: "boolean" }, status: { type: "string" }, "expect-context": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (opts.help) {
    say(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n?/, "").replace(/^ \* ?/gm, ""));
    return 0;
  }
  if ([opts.check, opts.status, opts.rejudge, opts.list].filter(Boolean).length > 1) stop("choose only one of --check, --status, --rejudge or --list");
  if (opts.list) {
    for (const n of briefNames()) {
      const b = loadBrief(n);
      say(`${n.padEnd(18)} ${b.title}${b.origin ? ` (${b.origin})` : ""}`);
    }
    return 0;
  }
  if (opts.status) {
    const dir = resolve(opts.status);
    const round = readJson(join(dir, "round.json")) ?? stop("no round.json in the requested directory");
    const total = round.briefs.reduce((n, b) => n + b.samples.length, 0);
    const completed = round.briefs.reduce((n, b) => n + b.samples.filter(s => existsSync(join(dir, b.name, ".harness", s.name, "exit.json"))).length, 0);
    say(JSON.stringify({ round: round.id, status: round.status ?? "unknown", completed, total,
      modelSettings: round.modelSettings,
      active: round.active ?? null, verdict: readJson(join(dir, "results.json"))?.verdict ?? null }, null, 2));
    return 0;
  }
  if (opts.rejudge) return score(resolve(opts.rejudge));
  return newRound(opts);
}

main().then((code) => { process.exitCode = code; }, (e) => {
  process.stderr.write(`ratify: ${e.message}\n`);
  process.exitCode = 2;
});
