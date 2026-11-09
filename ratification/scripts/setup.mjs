#!/usr/bin/env bun
// Interactive setup only. Provider configuration belongs to OpenCode; no inference here.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OPENCODE_PACKAGE = "opencode-ai@1.18.25"; // Tested CLI version; never replaces an existing installation.
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const HELP = `Usage: bun run ratify:setup

Requires Bun and a Linux checkout outside /tmp, with working mount namespaces.
Installs repository dependencies, offers to install OpenCode if missing, prompts
for provider login and a model, then runs preflight without model inference.
Existing OpenCode configuration is reused. Run in an interactive terminal.`;

function execute(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: REPO, encoding: "utf8", stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed. Setup is incomplete.`);
  return result.stdout ?? "";
}

// The small I/O seam lets tests exercise login/cancellation without installing tools or using credentials.
export function setup({ run = execute, ask = prompt, which = Bun.which, print = console.log,
  platform = process.platform, repo = REPO,
  addPath = dir => { process.env.PATH = `${dir}:${process.env.PATH ?? ""}`; } } = {}) {
  if (platform !== "linux") throw new Error("Ratification needs Linux mount namespaces. Run setup in a Linux VM or container.");
  if (repo === "/tmp" || repo.startsWith("/tmp/")) throw new Error("Clone the repository outside /tmp, then run setup again.");
  const missing = ["git", "unshare", "mount", "timeout", "find", "tar"].filter(tool => !which(tool));
  if (missing.length) throw new Error(`Install these system tools and rerun setup: ${missing.join(", ")}. Use your Linux package manager.`);

  const question = text => {
    const answer = ask(text);
    if (answer === null) throw new Error("Setup cancelled.");
    return answer.trim();
  };
  const confirm = text => {
    while (true) {
      const answer = question(`${text} [Y/n]`).toLowerCase();
      if (["", "y", "yes"].includes(answer)) return true;
      if (["n", "no"].includes(answer)) return false;
      print("Enter y or n.");
    }
  };

  print("Installing repository dependencies…");
  run("bun", ["install", "--frozen-lockfile"]);
  let addedBin;
  if (!which("opencode")) {
    if (!confirm(`OpenCode is missing. Install ${OPENCODE_PACKAGE} with Bun?`)) throw new Error("Install OpenCode, then rerun setup.");
    run("bun", ["add", "--global", "--trust", OPENCODE_PACKAGE]);
    if (!which("opencode")) {
      addedBin = run("bun", ["pm", "bin", "-g"], true).trim();
      if (!addedBin) throw new Error("Bun did not report its global executable directory.");
      addPath(addedBin);
      if (!which("opencode")) throw new Error("OpenCode installation did not provide an executable. Check the installation output and rerun setup.");
    }
  }
  run("opencode", ["--version"]);
  print("Configure your provider through OpenCode. Choose n to keep existing configuration or environment credentials.");
  if (confirm("Open OpenCode's provider login now?")) run("opencode", ["auth", "login"]);
  print("For custom providers, finish their normal OpenCode configuration before continuing. No ratification-specific provider file is needed.");
  question("Press Enter when your provider is configured (Ctrl-C to cancel).");

  const models = run("opencode", ["models"], true).split(/\r?\n/).map(s => s.trim()).filter(s => /^[^\s/]+\/\S+$/.test(s));
  if (!models.length) throw new Error("OpenCode lists no models. Configure a provider and rerun setup.");
  print(models.join("\n"));
  let model;
  while (!models.includes(model)) {
    model = question("Model ID to use (provider/model):");
    if (!models.includes(model)) print("Select an exact model ID from the list above.");
  }
  run("bun", ["run", "ratify", "--check", "--model", model]);
  const pathHint = addedBin ? `For future commands in this terminal, first run:\n  export PATH=${quote(addedBin)}:"$PATH"\n\n` : "";
  print(`\nSetup complete. Preflight passed; no evaluation was started. Provider billing/authentication is checked only when making a request.\n\n${pathHint}One sample per brief:\n  bun run ratify --model ${quote(model)} --samples 1\n\nFull 35-sample ratification:\n  bun run ratify --model ${quote(model)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && ["--help", "-h"].includes(process.argv[2])) console.log(HELP);
    else {
      if (process.argv.length > 2) throw new Error(HELP);
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run `bun run ratify:setup` in an interactive terminal so OpenCode can prompt for provider login.");
      setup();
    }
  } catch (error) {
    console.error(`ratify:setup: ${error.message}`);
    process.exitCode = 1;
  }
}
