/**
 * `template-versions.test.js` — the workflow in `docs/guides/template-versions.md`,
 * run through the real CLI against a real git repository on disk.
 *
 * The guide claims that a version in a template source is a pin, that
 * `unify update <source>` moves it (and only when asked, and only for good on a
 * `y`), that a preview moves nothing, and that `extends:` reads a pinned commit
 * from its cache with the repository gone but a tag, which can be moved, never
 * from a cache. None of that needs the network: git reaches a bare repository
 * over file://, exactly as §19.9 fetches any other, and an npm fetch is the one
 * thing the suite cannot do (tests/unit/template-versions.test.js classifies
 * every source the guide names, npm ones included, and says which are pinned).
 *
 * The literals are EXTRACTED FROM THE DOCUMENT, as in recipes.test.js: the four
 * command lines of the guide's §3 are read from it and run with one change, the
 * repository address (`https://github.com/acme/templates` becomes the local
 * bare repository), and the `unify.yaml` block of §2 is the shape init must
 * write. Editing the guide edits the test. The `release/…` branch, the commit
 * pin and the cache copy are retyped here, each marked, because the guide
 * shows them against addresses a local repository cannot answer.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4). Every run
 * that could fetch gets its own XDG_CACHE_HOME, so the user's cache is never
 * read or written.
 */
import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { registerTmp } from "../tmp-reaper.mjs";
import { ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 90_000;
const DOC = readFileSync(join(ROOT, "docs", "guides", "template-versions.md"), "utf8");

/** The body of the `## ` section whose heading starts with `prefix`. */
function section(prefix) {
  const start = DOC.indexOf(`\n## ${prefix}`);
  if (start < 0) throw new Error(`template-versions.md has no section "## ${prefix}…"`);
  const end = DOC.indexOf("\n## ", start + 1);
  return DOC.slice(start, end < 0 ? DOC.length : end);
}

/** The first fenced block of a language in a section, verbatim. */
function firstBlock(prefix, lang) {
  const m = section(prefix).match(new RegExp("```" + lang + "\\n([\\s\\S]*?)```"));
  if (!m) throw new Error(`template-versions.md "${prefix}" has no ${lang} block`);
  return m[1];
}

/** The address the guide's workflow uses, and the one the test swaps it for. */
const GUIDE_REPO = "https://github.com/acme/templates";

/** The guide's §3 command lines, as argument lists, with the repository address swapped for `repo`. */
function workflow(repo) {
  const lines = firstBlock("3. ", "sh").trim().split("\n");
  if (lines.length !== 4) throw new Error(`§3 shows four commands, found ${lines.length}:\n${lines.join("\n")}`);
  const [init, dry, ask, yes] = lines.map((line) => {
    const words = line.trim().split(/\s+/);
    if (words[0] !== "unify") throw new Error(`§3 command does not start with unify: ${line}`);
    return words.slice(1).map((w) => (w.startsWith(GUIDE_REPO) ? repo + w.slice(GUIDE_REPO.length) : w));
  });
  if (init[0] !== "init" || dry[0] !== "update" || !dry.includes("--dry-run") || ask[0] !== "update" || ask.length !== 2 || yes[0] !== "update" || !yes.includes("--yes")) {
    throw new Error(`§3's four commands are init, update --dry-run, update, update --yes; found:\n${lines.join("\n")}`);
  }
  return { init, dry, ask, yes };
}

function expectExit(r, code, what) {
  if (r.exit !== code) throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
}
const read = (...p) => readFileSync(join(...p), "utf8");

/** The author's own tool, run as §19.9 runs it. @returns {string} stdout */
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}
const commit = (work, msg) => {
  git(work, "add", "-A");
  git(work, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", msg);
};

// ------------------------------------------------------------- the template

const LAYOUT = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· Shop</title></head><body><main><slot></slot></main></body></html>\n';
const page = (title, body) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${title} page."></head><body><main>${body}</main></body></html>\n`;

/** What the template is at a version: a project laid out as init lays one out, in a `shop/` directory of the repository. */
const shop = (v) => ({
  "shop/site/_layout.html": LAYOUT,
  "shop/site/index.html": page("Home", `<h1>${v}</h1>`),
  "shop/site/assets/theme.css": `:root { --accent: ${v}; }\n`,
  "shop/README.md": `# Shop ${v}\n`,
  // What the built-ins ship: unify.yaml, kept, with the theme.
  "shop/unify.yaml": "template:\n  keep:\n    - unify.yaml\n    - site/assets/theme.css\n",
});

/**
 * A repository `templates` holding the template at three versions: tag v1,
 * tag v2 (which also adds site/about.html), and a v3 on `main` nobody tagged,
 * plus a branch `release/0.3.0` cut from v2 with a pending change.
 * @returns {{bare: string, base: string, sha: (tag: string) => string}} `base` is `file://<bare>`, the address standing in for GUIDE_REPO
 */
function templateRepo() {
  const work = mkTmp();
  writeTree(work, shop("v1"));
  git(work, "init", "-q", "-b", "main");
  commit(work, "v1");
  git(work, "tag", "v1");
  writeTree(work, { ...shop("v2"), "shop/site/about.html": page("About", "<h1>About</h1>") });
  commit(work, "v2");
  git(work, "tag", "v2");
  git(work, "checkout", "-q", "-b", "release/0.3.0");
  writeTree(work, shop("pending"));
  commit(work, "pending");
  git(work, "checkout", "-q", "main");
  writeTree(work, shop("v3"));
  commit(work, "v3");
  const bare = registerTmp(`${work}.git`);
  git(work, "clone", "-q", "--bare", work, bare);
  return { bare, base: `file://${bare}`, sha: (ref) => git(work, "rev-parse", ref) };
}

/** The source unify.yaml records: `template: <source>`, or `source:` under `template:`. */
function recorded(tmp) {
  const text = read(tmp, "unify.yaml");
  return text.match(/^template: (.+)$/m)?.[1] ?? text.match(/^\s+source: (.+)$/m)?.[1] ?? null;
}

const heading = (tmp) => read(tmp, "site", "index.html").match(/<h1>([^<]*)<\/h1>/)?.[1];

// ------------------------------------------------------------ §2 and §3

test("§3 — init at a tag records that string and the template moving on changes nothing; a preview and a refusal move nothing; y, or --yes, moves the files and the line", async () => {
  const { base } = templateRepo();
  const { init, dry, ask, yes } = workflow(base);
  const v1 = init[1];
  const v2 = ask[1];
  if (!v1.endsWith("#v1") || !v2.endsWith("#v2")) throw new Error(`§3 moves from #v1 to #v2, found ${v1} and ${v2}`);

  // ---- init: pinned at v1 while main has moved on to v3 and v2 exists
  const a = mkTmp();
  const r = await runCli(init, a);
  expectExit(r, 0, "the guide's init line");
  if (!r.stdout.includes(`recorded template: ${v1} in unify.yaml`)) throw new Error(`init must say what it recorded:\n${r.stdout}`);
  if (heading(a) !== "v1") throw new Error(`the tag is v1, not main's v3: ${heading(a)}`);
  if (recorded(a) !== v1) throw new Error(`unify.yaml records the source exactly as typed, ${v1}; has ${recorded(a)}`);
  // §2's yaml block is the shape of the record: the typed source, then the template's own keep: list.
  const shown = firstBlock("2. ", "yaml").trim();
  if (!shown.startsWith("template:\n  source: unify-docs-template@0.4.0\n  keep:\n")) throw new Error(`§2's block changed shape:\n${shown}`);
  const expected = shown.replace("unify-docs-template@0.4.0", v1);
  if (!read(a, "unify.yaml").includes(expected)) throw new Error(`unify.yaml must carry §2's block with the typed source:\n${expected}\n--- has ---\n${read(a, "unify.yaml")}`);
  expectExit(await runCli(["build", "--dry-run", "--strict"], a), 0, "the scaffold builds clean");

  // ---- the pin holds: the template has moved on and update has nothing newer to bring
  const same = await runCli(["update"], a);
  expectExit(same, 0, "update with no argument, pinned at v1");
  if (!same.stdout.includes("nothing to do") || same.stderr.includes("[y/N]")) throw new Error(`a pinned source has nothing newer:\n${same.stdout}${same.stderr}`);
  if (recorded(a) !== v1 || heading(a) !== "v1") throw new Error("a no-op update changed something");

  // ---- the guide's --dry-run line: a list, and neither the files nor the line move
  const preview = await runCli(dry, a);
  expectExit(preview, 0, "the guide's --dry-run line");
  for (const line of ["would overwrite site/index.html", "would overwrite README.md", "would add site/about.html", "keep site/assets/theme.css"]) {
    if (!preview.stdout.includes(line)) throw new Error(`the preview lacks "${line}":\n${preview.stdout}`);
  }
  if (preview.stderr.includes("[y/N]")) throw new Error("--dry-run must not ask");
  if (recorded(a) !== v1 || heading(a) !== "v1" || existsSync(join(a, "site", "about.html"))) throw new Error("--dry-run moved the files or the line");

  // ---- the guide's plain line: it asks; anything but y writes nothing, exits 1 and leaves the line on v1
  for (const [what, input] of [["a closed stdin", undefined], ["n", "n\n"], ["a blank line", "\n"]]) {
    const declined = await runCli(ask, a, {}, input);
    expectExit(declined, 1, `the guide's plain line, answered with ${what}`);
    if (!/overwrite 2 file\(s\)\? \[y\/N\]/.test(declined.stderr)) throw new Error(`the question names the count:\n${declined.stderr}`);
    if (recorded(a) !== v1 || heading(a) !== "v1" || existsSync(join(a, "site", "about.html"))) throw new Error(`${what}: something moved`);
  }
  const accepted = await runCli(ask, a, {}, "y\n");
  expectExit(accepted, 0, "the guide's plain line, answered y");
  if (!accepted.stdout.includes("update: overwrote 2, added 1, 1 kept")) throw new Error(`the summary counts what moved:\n${accepted.stdout}`);
  if (heading(a) !== "v2" || !existsSync(join(a, "site", "about.html"))) throw new Error("y copies v2");
  if (recorded(a) !== v2) throw new Error(`y moves the line to ${v2}; it has ${recorded(a)}`);
  // keep: held. The theme is v1's, though v2 changed it; and the keep list is as the template shipped it.
  if (read(a, "site", "assets", "theme.css") !== ":root { --accent: v1; }\n") throw new Error("a file under keep: is never overwritten");
  if (!read(a, "unify.yaml").includes(`template:\n  source: ${v2}\n  keep:\n    - unify.yaml\n    - site/assets/theme.css\n`)) throw new Error(`the record moves inside its block:\n${read(a, "unify.yaml")}`);
  // The pin moved, and holds at its new place: main is at v3 and the project stays at v2.
  const held = await runCli(["update"], a);
  expectExit(held, 0, "update at the new pin");
  if (!held.stdout.includes("nothing to do") || heading(a) !== "v2") throw new Error(`the new pin holds against main's v3:\n${held.stdout}${held.stderr}`);

  // ---- the guide's --yes line, from v1 again in another project: no question, same result
  const b = mkTmp();
  expectExit(await runCli(init, b), 0, "a second project, init at v1");
  const yesRun = await runCli(yes, b);
  expectExit(yesRun, 0, "the guide's --yes line");
  if (yesRun.stderr.includes("[y/N]")) throw new Error("--yes must not ask");
  if (heading(b) !== "v2" || recorded(b) !== v2 || !existsSync(join(b, "site", "about.html"))) throw new Error(`--yes moves the files and the line:\n${yesRun.stdout}${yesRun.stderr}`);
}, TEST_MS);

test("§3, §5 — a branch with a slash goes after the #, a preview of it moves nothing, a commit (short or whole) pins, and naming the old pin goes back", async () => {
  const { base, sha } = templateRepo();
  const { init, ask } = workflow(base);
  const v1 = init[1];
  const v2 = ask[1];
  const project = mkTmp();
  expectExit(await runCli(init, project), 0, "init at v1");
  expectExit(await runCli(["update", v2, "--yes"], project), 0, "move to v2");

  // The guide's `#release/…` example, against the local repository's branch (retyped: the guide's address is GitHub's).
  const branch = `${base}/shop#release/0.3.0`;
  const peek = await runCli(["update", branch, "--dry-run"], project);
  expectExit(peek, 0, "a preview of a branch whose name has a slash");
  if (!peek.stdout.includes("would overwrite site/index.html")) throw new Error(`the branch's pending change is in the list:\n${peek.stdout}`);
  if (recorded(project) !== v2 || heading(project) !== "v2") throw new Error("a preview moves neither the files nor the line");
  const scaffold = mkTmp();
  expectExit(await runCli(["init", branch], scaffold), 0, "init from the branch with a slash");
  if (heading(scaffold) !== "pending" || recorded(scaffold) !== branch) throw new Error(`init from ${branch}: ${heading(scaffold)}, recorded ${recorded(scaffold)}`);

  // "to move to a commit, put it after the #" — seven digits is enough; the line is what was typed.
  const short = `${base}/shop#${sha("v1").slice(0, 7)}`;
  const toCommit = await runCli(["update", short, "--yes"], project);
  expectExit(toCommit, 0, "move to a short commit");
  if (heading(project) !== "v1" || recorded(project) !== short) throw new Error(`a commit pins the line as typed: ${heading(project)}, ${recorded(project)}`);
  const whole = `${base}/shop#${sha("v2")}`;
  expectExit(await runCli(["update", whole, "--yes"], project), 0, "move to a whole commit");
  if (heading(project) !== "v2" || recorded(project) !== whole) throw new Error(`a whole commit pins too: ${heading(project)}, ${recorded(project)}`);
  const held = await runCli(["update"], project);
  expectExit(held, 0, "update at a commit");
  if (!held.stdout.includes("nothing to do")) throw new Error(`a commit is the same bytes every time:\n${held.stdout}${held.stderr}`);
  // "to go back, name the old pin"
  expectExit(await runCli(["update", v1, "--yes"], project), 0, "go back");
  if (heading(project) !== "v1" || recorded(project) !== v1) throw new Error("naming the old pin goes back");
}, TEST_MS);

// ------------------------------------------------------------------ §4

test("§4 — extends: a tag is fetched on every run and never cached; a commit is cached, and a restored cache builds with the repository gone", async () => {
  const { bare, base, sha } = templateRepo();
  const site = mkTmp();
  writeTree(site, { "docs/index.md": "---\ntitle: Notes\ndescription: Notes page.\n---\n# Notes\n" });
  const cache = join(site, "cache");
  const entries = (dir) => {
    try {
      return readdirSync(join(dir, "unify", "templates")).filter((n) => !n.startsWith("."));
    } catch {
      return [];
    }
  };
  const extend = (ref) => writeTree(site, { "unify.yaml": `source: docs\nextends: ${base}/shop#${ref}\n` });

  // A tag: built, and not a byte of it cached — "a tag can be moved".
  extend("v1");
  expectExit(await runCli(["build", "--strict"], site, { XDG_CACHE_HOME: cache }), 0, "extends a tag");
  if (entries(cache).length !== 0) throw new Error(`a tag is never cached: ${entries(cache).join(", ")}`);

  // A commit: one entry, "fetched once into the cache".
  extend(sha("v1"));
  expectExit(await runCli(["build", "--strict"], site, { XDG_CACHE_HOME: cache }), 0, "extends a commit");
  if (entries(cache).length !== 1) throw new Error(`one cache entry for one pinned commit: ${entries(cache).join(", ")}`);
  const built = read(site, "dist", "index.html");

  // "In CI, restore the cache directory between runs": a copy of the directory, in another place, with the repository gone.
  const restored = join(site, "restored");
  cpSync(cache, restored, { recursive: true });
  rmSync(bare, { recursive: true, force: true });
  expectExit(await runCli(["build", "--strict", "--clean"], site, { XDG_CACHE_HOME: restored }), 0, "the pinned commit from a restored cache, repository gone");
  if (read(site, "dist", "index.html") !== built) throw new Error("a build from the restored cache is byte-identical");

  // The tag again, now that nothing can answer: it is not in any cache, so the build stops.
  extend("v1");
  const gone = await runCli(["build", "--strict", "--clean"], site, { XDG_CACHE_HOME: restored });
  expectExit(gone, 2, "extends a tag with the repository gone");
  if (!/git clone failed/.test(gone.stderr)) throw new Error(`the tool's own failure, as a usage error:\n${gone.stderr}`);
}, TEST_MS);
