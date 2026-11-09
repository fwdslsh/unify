import { expect, test } from "bun:test";
import { setup } from "../../ratification/scripts/setup.mjs";

function fixture(answers, { installed = true, fail, missing = [], models = "example/fast\nexample/large\n" } = {}) {
  const calls = [], output = [];
  const io = {
    platform: "linux", repo: "/work/unify",
    which: tool => missing.includes(tool) || (tool === "opencode" && !installed) ? null : `/bin/${tool}`,
    ask: () => { if (!answers.length) throw new Error("Unexpected prompt"); return answers.shift(); },
    print: text => output.push(text),
    run: (command, args) => {
      calls.push([command, ...args]);
      if (fail?.(command, args)) throw new Error("fixture command failed");
      if (command === "bun" && args[0] === "add") installed = true;
      return command === "opencode" && args[0] === "models" ? models : "";
    },
  };
  return { io, calls, output };
}

test("setup reuses an existing provider, checks the selected model and never launches inference", () => {
  const f = fixture(["n", "", "example/fast"]);
  setup(f.io);
  expect(f.calls).toEqual([
    ["bun", "install", "--frozen-lockfile"], ["opencode", "--version"], ["opencode", "models"],
    ["bun", "run", "ratify", "--check", "--model", "example/fast"],
  ]);
  expect(f.output.at(-1)).toContain("Setup complete");
  expect(f.output.at(-1)).toContain("--model 'example/fast' --samples 1");
});

test("setup offers a missing OpenCode installation and delegates credentials to its login command", () => {
  const f = fixture(["y", "y", "", "example/large"], { installed: false });
  setup(f.io);
  expect(f.calls).toContainEqual(["bun", "add", "--global", "--trust", "opencode-ai@1.18.25"]);
  expect(f.calls).toContainEqual(["opencode", "auth", "login"]);
  expect(f.calls.at(-1)).toEqual(["bun", "run", "ratify", "--check", "--model", "example/large"]);
});

test("declining installation or cancelling does not start provider login or evaluation", () => {
  for (const answer of ["n", null]) {
    const f = fixture([answer], { installed: false });
    expect(() => setup(f.io)).toThrow();
    expect(f.calls).toEqual([["bun", "install", "--frozen-lockfile"]]);
    expect(f.output.join("\n")).not.toContain("Setup complete");
  }
});

test("a newly installed global bin outside PATH works for setup and prints the shell command", () => {
  const f = fixture(["y", "n", "", "example/fast"], { installed: false });
  let added;
  setup({ ...f.io,
    which: tool => tool === "opencode" ? (added ? "/global bin/opencode" : null) : `/bin/${tool}`,
    addPath: dir => { added = dir; },
    run: (command, args) => args.join(" ") === "pm bin -g" ? "/global bin\n" : f.io.run(command, args),
  });
  expect(added).toBe("/global bin");
  expect(f.output.at(-1)).toContain('export PATH=\'/global bin\':"$PATH"');
  expect(f.calls.at(-1)).toEqual(["bun", "run", "ratify", "--check", "--model", "example/fast"]);
});

test("failed login or preflight stops setup without claiming success", () => {
  for (const failing of ["auth", "--check"]) {
    const f = fixture(["y", "", "example/fast"], { fail: (_, args) => args.includes(failing) });
    expect(() => setup(f.io)).toThrow("fixture command failed");
    expect(f.output.join("\n")).not.toContain("Setup complete");
    if (failing === "auth") expect(f.calls).not.toContainEqual(["opencode", "models"]);
  }
});

test("setup rejects unavailable model IDs and handles an empty model list", () => {
  const f = fixture(["n", "", "missing/model", "example/fast"]);
  setup(f.io);
  expect(f.output).toContain("Select an exact model ID from the list above.");
  expect(f.calls.at(-1)).toEqual(["bun", "run", "ratify", "--check", "--model", "example/fast"]);
  const empty = fixture(["n", ""], { models: "" });
  expect(() => setup(empty.io)).toThrow("lists no models");
});

test("unsupported environments fail before installing anything", () => {
  for (const overrides of [{ platform: "darwin" }, { repo: "/tmp/unify" }, { which: () => null }]) {
    const f = fixture([]);
    expect(() => setup({ ...f.io, ...overrides })).toThrow();
    expect(f.calls).toEqual([]);
  }
});

test("setup help is usable without a terminal; unattended setup fails instead of hanging", () => {
  const help = Bun.spawnSync(["bun", "run", "ratify:setup", "--help"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout.toString()).toContain("without model inference");
  const unattended = Bun.spawnSync(["bun", "run", "ratify:setup"], { stdin: "ignore" });
  expect(unattended.exitCode).toBe(1);
  expect(unattended.stderr.toString()).toContain("interactive terminal");
});
