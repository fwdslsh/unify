/**
 * `unify init <source>` — where a template comes from (conformance-spec §19.9).
 *
 * The positional argument names one of four things, told apart by SHAPE, never
 * by probing: a built-in template (an exact name from the registry), an npm
 * package (named by the convention `unify-<name>-template`, or
 * `@org/unify-<name>-template`, with an optional `@version` — the pattern is
 * what makes unify templates searchable on npm, so it is also what marks one
 * on the command line), a git repository (a URL, a `git@host:` address, or a
 * `.git` segment, with an optional subdirectory and `#ref`), or else a
 * directory on disk. The order matters only where two shapes could both
 * apply, and there the rule is the one that reaches no network on a typo:
 * `blgo` is not a built-in, not a template package name and no directory of
 * that name exists, so it is a usage error naming the four forms — never an
 * npm lookup that fails later and slower.
 *
 * A git source may name a SUBDIRECTORY of the repository, so one repository
 * can host many templates (this one does: `templates/<name>/`). The
 * repository ends at the segment ending in `.git` where there is one, else at
 * `host/owner/repo` — the layout of every hosted forge — and what follows is
 * the template's directory inside the checkout. The URL a browser shows for
 * such a directory, `https://github.com/o/r/tree/<ref>/<dir>`, is read the
 * same way, with `tree/<ref>` supplying the ref.
 *
 * A template is a PROJECT laid out the way `init` lays one out (§19.4): a
 * source tree — `site/`, or `src/`, found by the same walk `unify build` uses
 * — beside whatever belongs at the project root (`AGENTS.md`, `DEPLOY.md`,
 * `unify.yaml`, a generator in `scripts/`). A template with neither directory
 * is a bare source tree and everything in it is content. What a template's own
 * packaging needed is never copied: `.git/`, `node_modules/`, `package.json`
 * and lockfiles describe the template, not the site it scaffolds, and
 * `package.json` is the one file an author most likely already has in the
 * directory they are scaffolding into (§19.4's refusal would then fire on a
 * file nobody asked for).
 *
 * Fetching uses the author's own tools — `git clone` and `npm pack` as
 * subprocesses — rather than reimplementing either protocol, because that is
 * what makes "you must have clone rights" true in the only sense that matters:
 * the author's SSH keys, credential helper, `.npmrc` and private registry all
 * apply, and a repository or package they cannot reach fails here exactly as
 * it would fail at their own prompt. `GIT_TERMINAL_PROMPT=0` makes a missing
 * credential a failure instead of a hang on a question nobody is there to
 * answer. The one piece of format work done here is reading the tarball `npm
 * pack` produces (gzip via `node:zlib`, then the tar header walk below), since
 * `node:` has no tar reader and spawning one would add a dependency on a
 * binary the npm path otherwise does not need.
 *
 * Everything is read into memory and handed to `init` as the same
 * `{relativePath: bytes}` maps a built-in template is, so the refusals that
 * guarantee "writes nothing" (§19.4) apply to every source through one code
 * path. Nothing here writes outside a temporary directory of its own.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { UsageError } from "../core/diagnostics.js";
import { resolveSource, toRelative } from "../core/paths.js";
import { TEMPLATES, TEMPLATE_ROOT_FILES } from "../templates/index.js";
import pkg from "../../package.json" with { type: "json" };

/** The unify repository: where a built-in at another unify version is fetched from (§19.10). */
const UNIFY_REPO = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
/** A git commit id, 7 to 40 hex digits: the one form of ref a pinned record uses. */
const COMMIT = /^[0-9a-f]{7,40}$/;

/** Never copied out of a template, at any depth: version control and installed dependencies. */
const SKIPPED_DIRS = new Set([".git", "node_modules"]);
/** Never copied from a template's root: the template's own packaging. */
const SKIPPED_ROOT_FILES = new Set(["package.json", "package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]);

/**
 * @typedef {{kind: "builtin", name: string, version: string|null}
 *   | {kind: "npm", spec: string}
 *   | {kind: "git", url: string, ref: string|null, subdir: string|null}
 *   | {kind: "dir", path: string, ref: string|null}} TemplateSource
 *
 * Every form can carry a PIN — the version `unify.yaml`'s `template:` line
 * records (§19.10): a built-in's unify version (`blog@0.11.3`), an npm
 * version (`unify-shop-template@1.4.0`), a git commit (`url#<commit>`), and
 * for a directory the commit of the repository it sits in (`../tpl#<commit>`).
 */

/**
 * Tell the four source forms apart. Pure: no filesystem probe except the one
 * the `dir` form requires (it must exist), no network.
 *
 * @param {string} arg - the positional as written
 * @param {string[]} builtIns - the registry's names
 * @param {string} [cwd] - what a relative directory resolves against
 * @returns {TemplateSource}
 */
export function classifyTemplateSource(arg, builtIns, cwd = process.cwd()) {
  if (builtIns.includes(arg)) return { kind: "builtin", name: arg, version: null };
  // `blog@0.11.2`: the built-in as the unify of that version shipped it (§19.10).
  const pinnedBuiltIn = arg.match(/^([a-z][\w-]*)@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/);
  if (pinnedBuiltIn && builtIns.includes(pinnedBuiltIn[1])) return { kind: "builtin", name: pinnedBuiltIn[1], version: pinnedBuiltIn[2] };

  if (NPM_TEMPLATE.test(arg)) return { kind: "npm", spec: arg };

  const git = parseGitSource(arg);
  if (git) return git;

  // A directory, optionally pinned to a commit of the repository it sits in.
  const hash = arg.lastIndexOf("#");
  const dirSpec = hash === -1 ? arg : arg.slice(0, hash);
  const dirRef = hash === -1 ? null : arg.slice(hash + 1);
  const path = resolve(cwd, dirSpec);
  if (existsSync(path) && statSync(path).isDirectory()) {
    if (dirRef !== null && !COMMIT.test(dirRef)) {
      throw new UsageError(`${arg}: a directory can only be pinned to a commit of the repository it is in`, ["write the commit id after the #, or drop the #"]);
    }
    return { kind: "dir", path, ref: dirRef };
  }

  throw new UsageError(`not a template: ${arg}`, [
    `a built-in template is one of: ${builtIns.join(", ")} (optionally @<unify version>)`,
    `a directory must exist: ${path} does not`,
    "an npm package is named unify-<name>-template or @org/unify-<name>-template (optionally @version)",
    "a git repository is given by its URL, optionally /<subdirectory> and #<branch, tag or commit>",
  ]);
}

/**
 * §19.10 — the source spelled with the version that was fetched: the line
 * `unify.yaml` records as `template:`, and what `update` later fetches as the
 * baseline. A relative directory is written relative to that file.
 *
 * @param {TemplateSource} source
 * @param {string|null} revision - what `fetchTemplate` reported
 * @param {string} label - the source as typed (a relative directory keeps its spelling's kind)
 * @param {string} configDir - the directory unify.yaml sits in
 * @returns {string}
 */
export function pinSource(source, revision, label, configDir) {
  switch (source.kind) {
    case "builtin": return `${source.name}@${revision}`;
    case "npm": {
      const at = source.spec.lastIndexOf("@");
      const name = at > 0 ? source.spec.slice(0, at) : source.spec;
      return revision ? `${name}@${revision}` : name;
    }
    case "git": return `${source.url}${source.subdir ? `/${source.subdir}` : ""}#${revision}`;
    case "dir": {
      const typed = label.split("#")[0];
      const path = isAbsolute(typed) ? source.path : (relative(configDir, source.path).split(sep).join("/") || ".");
      return revision ? `${path}#${revision}` : path;
    }
  }
}

/**
 * §19.10 — whether a source names one fixed version (a baseline `update` can
 * fetch again), or floats: a bare built-in, an npm name without a version, a
 * git URL without a ref, a directory as it is now.
 * @param {TemplateSource} source
 */
export function isPinned(source) {
  switch (source.kind) {
    case "builtin": return source.version !== null;
    case "npm": return source.spec.lastIndexOf("@") > 0;
    case "git": return source.ref !== null;
    case "dir": return source.ref !== null;
  }
}

/**
 * §19.10 — the same source without its pin: the latest version, which is what
 * `update` fetches when nothing newer is named. For git that is the default
 * branch; to follow another branch or a tag line, name it on the command line.
 * @param {TemplateSource} source
 * @returns {TemplateSource}
 */
export function unpinned(source) {
  switch (source.kind) {
    case "builtin": return { ...source, version: null };
    case "npm": { const at = source.spec.lastIndexOf("@"); return at > 0 ? { ...source, spec: source.spec.slice(0, at) } : source; }
    case "git": return { ...source, ref: null };
    case "dir": return { ...source, ref: null };
  }
}

/**
 * The naming convention for a template published to npm: `unify-<name>-template`,
 * optionally under an organization, optionally pinned. Anchored, lower-case
 * (npm names are), and the `<name>` is at least one character.
 */
export const NPM_TEMPLATE = /^(@[a-z0-9][a-z0-9._-]*\/)?unify-[a-z0-9][a-z0-9._-]*-template(@[^@\s/]+)?$/;

/**
 * A git source, or null when `arg` is not one.
 *
 * Three spellings name a repository: a URL with a scheme (`https://`, `ssh://`,
 * `git://`, `file://`), the scp-like address git itself accepts
 * (`git@host:owner/repo`), and any path with a segment ending in `.git`. A
 * trailing `#ref` names a branch, a tag, or a commit (7 to 40 hex digits). The segments after the repository
 * are a subdirectory inside it: after the `.git` segment where there is one,
 * else after `host/owner/repo` (never for `file://`, whose path is a
 * filesystem path with no owner/repo shape — there, `.git` is the only
 * boundary). `https://github.com/o/r/tree/<ref>/<dir>` — what a browser shows
 * for a directory — is read as that repository, ref and directory.
 *
 * @param {string} arg
 * @returns {{kind: "git", url: string, ref: string|null, subdir: string|null}|null}
 */
export function parseGitSource(arg) {
  const hash = arg.lastIndexOf("#");
  const spec = hash === -1 ? arg : arg.slice(0, hash);
  let ref = hash === -1 ? null : arg.slice(hash + 1);
  if (ref === "") throw new UsageError(`${arg} names no ref after the #`, ["write the branch or tag after it, or drop the #"]);

  const scheme = spec.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  const scp = !scheme && /^[\w.-]+@[\w.-]+:/.test(spec);
  const dotGit = spec.split("/").findIndex((segment) => segment.endsWith(".git") && segment !== ".git");
  if (!scheme && !scp && dotGit === -1) return null;

  // Split `spec` into the repository and the path inside it.
  let repo = spec;
  let inside = [];
  if (dotGit !== -1) {
    const segments = spec.split("/");
    repo = segments.slice(0, dotGit + 1).join("/");
    inside = segments.slice(dotGit + 1);
  } else if (scheme && scheme[1] !== "file") {
    // scheme://host/owner/repo[/...]
    const slash = spec.indexOf("/", scheme[0].length);
    if (slash !== -1) {
      const segments = spec.slice(slash + 1).split("/");
      repo = spec.slice(0, slash + 1) + segments.slice(0, 2).join("/");
      inside = segments.slice(2);
    }
  } else if (scp) {
    // user@host:owner/repo[/...]
    const colon = spec.indexOf(":");
    const segments = spec.slice(colon + 1).split("/");
    repo = spec.slice(0, colon + 1) + segments.slice(0, 2).join("/");
    inside = segments.slice(2);
  }
  inside = inside.filter(Boolean);
  // The browser's URL for a directory: /tree/<ref>/<dir>.
  if (inside[0] === "tree" && inside.length >= 2) {
    if (ref !== null && ref !== inside[1]) throw new UsageError(`${arg} names two refs: tree/${inside[1]} and #${ref}`, ["keep one of them"]);
    ref = inside[1];
    inside = inside.slice(2);
  }
  if (inside.includes("..")) throw new UsageError(`${arg}: a subdirectory cannot contain ..`);
  return { kind: "git", url: repo, ref, subdir: inside.length > 0 ? inside.join("/") : null };
}

/**
 * @typedef {object} Template
 * @property {Record<string, Uint8Array|string>} files - source-root-relative path → content
 * @property {Record<string, Uint8Array|string>} rootFiles - project-root-relative path → content
 * @property {string|null} sourceDir - the template's own source directory (`site`, `src`), null for a bare source tree
 * @property {string|null} revision - what was fetched: a git commit, an npm version, unify's own version for a built-in, the
 *   commit of a directory's repository when the directory is a clean checkout, else null
 * @property {string} label - the source as the author wrote it
 */

/**
 * Fetch (where needed) and read a template into the two maps `init` writes
 * (and `update` compares), plus the revision that was fetched.
 *
 * @param {TemplateSource} source
 * @param {string} label - the positional as written
 * @returns {Promise<Template>}
 */
export async function fetchTemplate(source, label) {
  if (source.kind === "builtin" && (source.version === null || source.version === pkg.version)) {
    // §19.9/§19.5 — the embedded copy of templates/<name>/; its revision is
    // the unify that carries it, which is what `unify update` compares after
    // an upgrade.
    return { files: TEMPLATES[source.name], rootFiles: TEMPLATE_ROOT_FILES[source.name] ?? {}, sourceDir: "site", revision: pkg.version, label };
  }
  if (source.kind === "dir" && source.ref === null) {
    // The directory as it is now. Its revision is the commit of the
    // repository it sits in, when it is a clean checkout — the one case in
    // which that commit IS this content and can serve as a baseline later.
    return { ...readTemplateTree(source.path, label), revision: await cleanCommitOf(source.path), label };
  }

  const scratch = mkdtempSync(join(tmpdir(), "unify-init-"));
  try {
    let fetched;
    if (source.kind === "builtin") {
      // §19.10 — a built-in at another unify version is that version's
      // templates/<name>/ in the unify repository: the name is a shortcut to
      // the directory, and the version is its tag.
      const { dir } = await cloneGit({ url: UNIFY_REPO, ref: `v${source.version}`, subdir: `templates/${source.name}` }, scratch);
      fetched = { ...readTemplateTree(dir, label), revision: source.version };
    } else if (source.kind === "dir") {
      // The directory as of a commit of the repository it sits in.
      const tree = await gitTreeOf(source.path);
      if (tree === null) {
        throw new UsageError(`${label}: the directory is not inside a git repository, so it has no commit ${source.ref}`, [
          "drop the #commit to read the directory as it is now",
        ]);
      }
      const { dir } = await cloneGit({ url: tree.toplevel, ref: source.ref, subdir: tree.prefix }, scratch);
      fetched = { ...readTemplateTree(dir, label), revision: source.ref };
    } else {
      const { dir, revision } = source.kind === "git" ? await cloneGit(source, scratch) : await packNpm(source, scratch);
      fetched = { ...readTemplateTree(dir, label), revision };
    }
    return { ...fetched, label };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The repository a directory sits in: its top level and the directory's path
 * inside it, or null when it is not a git checkout (or git is not installed).
 * @param {string} dir
 * @returns {Promise<{toplevel: string, prefix: string|null}|null>}
 */
async function gitTreeOf(dir) {
  try {
    const out = await runTool("git", ["-C", dir, "rev-parse", "--show-toplevel", "--show-prefix"], {}, true);
    if (out.code !== 0) return null;
    const [toplevel, prefix = ""] = out.stdout.split(/\r?\n/);
    return { toplevel, prefix: prefix.replace(/\/$/, "") || null };
  } catch {
    return null; // git itself is missing: a directory template simply has no version
  }
}

/**
 * The commit a directory's content IS: HEAD of the repository it sits in,
 * provided nothing under the directory is modified or untracked. A dirty
 * checkout has no commit that matches its files, so it gets no pin.
 * @param {string} dir
 * @returns {Promise<string|null>}
 */
async function cleanCommitOf(dir) {
  const tree = await gitTreeOf(dir);
  if (tree === null) return null;
  try {
    const status = await runTool("git", ["-C", dir, "status", "--porcelain", "--untracked-files=all", "--", "."], {}, true);
    if (status.code !== 0 || status.stdout.trim() !== "") return null;
    const head = await runTool("git", ["-C", dir, "rev-parse", "HEAD"], {}, true);
    return head.code === 0 && COMMIT.test(head.stdout.trim()) ? head.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Read a template directory the way `unify build` would read a project:
 * `site/` or `src/` is the source tree, the rest sits at the project root.
 *
 * @param {string} root - the template's directory
 * @param {string} label - how the author named it, for the empty-template error
 * @returns {{files: Record<string, Uint8Array>, rootFiles: Record<string, Uint8Array>, sourceDir: string|null}}
 */
export function readTemplateTree(root, label) {
  const { root: sourceDir, defaulted } = resolveSource(undefined, root);
  const files = {};
  const rootFiles = {};
  for (const abs of walk(root)) {
    const rel = toRelative(root, abs);
    if (SKIPPED_ROOT_FILES.has(rel)) continue;
    if (!defaulted && isInside(sourceDir, abs)) files[toRelative(sourceDir, abs)] = readFileSync(abs);
    else if (defaulted) files[rel] = readFileSync(abs);
    else rootFiles[rel] = readFileSync(abs);
  }
  if (Object.keys(files).length === 0) {
    throw new UsageError(`template ${label} has no source files`, [
      "a template is a project laid out like unify init's own: a site/ (or src/) directory beside AGENTS.md, DEPLOY.md and unify.yaml",
      "a directory with neither site/ nor src/ is read as a bare source tree, so it must hold at least one file",
    ]);
  }
  return { files, rootFiles, sourceDir: defaulted ? null : toRelative(root, sourceDir) };
}

/** @param {string} dir @param {string} abs */
function isInside(dir, abs) {
  const rel = toRelative(dir, abs);
  return rel !== "" && !rel.startsWith("..");
}

/**
 * Every regular file under `dir`, skipping version control and installed
 * dependencies. A symlinked file is read through; a symlinked directory is
 * not entered, since a template cannot need one and a cycle would never end.
 * @param {string} dir
 * @returns {string[]} absolute paths, sorted for a deterministic write order
 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) out.push(...walk(abs));
    } else if (entry.isFile() || (entry.isSymbolicLink() && statSync(abs).isFile())) {
      out.push(abs);
    }
  }
  return out.sort();
}

/**
 * Run one of the author's own tools and collect its stderr; a tool that is
 * not installed is named as such rather than surfacing a raw ENOENT.
 * @param {string} tool
 * @param {string[]} args
 * @param {Record<string, string>} [env]
 * @param {boolean} [captureStdout] - keep stdout too (a `git rev-parse` answer); otherwise it is discarded
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runTool(tool, args, env = {}, captureStdout = false) {
  return new Promise((done, fail) => {
    // On Windows `npm` is `npm.cmd`, which node can only run through a shell;
    // `git` is a real executable everywhere. Every argument that reaches the
    // shell is unify's own or matched NPM_TEMPLATE (letters, digits, `.`,
    // `_`, `-`, `@`, `/`), so nothing in it can break out of the command.
    const shell = tool === "npm" && process.platform === "win32";
    const proc = spawn(tool, args, { env: { ...process.env, ...env }, stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"], shell });
    const chunks = [];
    const out = [];
    proc.stderr.on("data", (chunk) => chunks.push(chunk));
    if (captureStdout) proc.stdout.on("data", (chunk) => out.push(chunk));
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        fail(new UsageError(`${tool} is not installed or not on PATH`, [
          tool === "git"
            ? "install git, or pass the template as a directory you have already cloned"
            : "npm ships with Node.js; install it, or pass the template as a directory you have already unpacked",
        ]));
      } else fail(err);
    });
    proc.on("close", (code) => done({ code: code ?? 1, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(chunks).toString() }));
  });
}

/** The last few non-empty lines of a tool's stderr, for a usage error a person reads. */
function tail(stderr) {
  return stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-3).join(" / ");
}

/**
 * `git clone --depth 1` into the scratch directory, with the author's own
 * credentials and no prompt; the template is the checkout, or the named
 * subdirectory of it.
 * @param {{url: string, ref: string|null, subdir: string|null}} source
 * @param {string} scratch
 * @returns {Promise<{dir: string, revision: string}>} the template's path inside the checkout, and the commit checked out
 */
async function cloneGit({ url, ref, subdir }, scratch) {
  const dest = join(scratch, "repo");
  // `--branch` takes a branch or a tag, never a commit — and a commit is what
  // the record holds (§19.10), so fetching the baseline `template:` names
  // must work. A ref that reads as a commit id clones the history and checks
  // it out; anything else is a shallow clone of that branch or tag.
  const commit = ref !== null && COMMIT.test(ref);
  const args = commit
    ? ["clone", "--quiet", "--", url, dest]
    : ["clone", "--depth", "1", "--quiet", ...(ref ? ["--branch", ref] : []), "--", url, dest];
  const { code, stderr } = await runTool("git", args, { GIT_TERMINAL_PROMPT: "0" });
  if (code !== 0) {
    throw new UsageError(`git clone failed (exit ${code}) for ${url}${ref ? `#${ref}` : ""}${stderr.trim() ? `: ${tail(stderr)}` : ""}`, [
      "check the URL and the branch, tag or commit, and that you can clone the repository with git yourself",
    ]);
  }
  if (commit) {
    const out = await runTool("git", ["-C", dest, "checkout", "--quiet", "--detach", ref]);
    if (out.code !== 0) {
      throw new UsageError(`git checkout failed (exit ${out.code}) for ${url}#${ref}${out.stderr.trim() ? `: ${tail(out.stderr)}` : ""}`, [
        "check that the commit exists in the repository",
      ]);
    }
  }
  // The commit the checkout is at — the revision `unify update` records
  // (§19.10). git wrote it; reading HEAD through git keeps packed refs and
  // a detached `--branch <tag>` checkout both right.
  const head = await runTool("git", ["-C", dest, "rev-parse", "HEAD"], {}, true);
  if (head.code !== 0) throw new UsageError(`git rev-parse failed (exit ${head.code}) in the clone of ${url}${head.stderr.trim() ? `: ${tail(head.stderr)}` : ""}`);
  const revision = head.stdout.trim();
  if (subdir === null) return { dir: dest, revision };
  const inside = join(dest, ...subdir.split("/"));
  if (!existsSync(inside) || !statSync(inside).isDirectory()) {
    throw new UsageError(`${url}${ref ? `#${ref}` : ""} has no directory ${subdir}`, [
      "check the path after the repository; it is read inside the checkout",
    ]);
  }
  return { dir: inside, revision };
}

/**
 * `npm pack` into the scratch directory, then unpack the one tarball it
 * produced. The author's `.npmrc` decides the registry and the credentials.
 * @param {{spec: string}} source
 * @param {string} scratch
 * @returns {Promise<{dir: string, revision: string|null}>} the unpacked package's path, and its version
 */
async function packNpm({ spec }, scratch) {
  const { code, stderr } = await runTool("npm", ["pack", spec, "--pack-destination", scratch, "--ignore-scripts", "--loglevel=error"]);
  if (code !== 0) {
    throw new UsageError(`npm pack failed (exit ${code}) for ${spec}${stderr.trim() ? `: ${tail(stderr)}` : ""}`, [
      "check the package name and version, and that you can install it with npm yourself",
      "a template package is named unify-<name>-template, or @org/unify-<name>-template",
    ]);
  }
  const tarballs = readdirSync(scratch).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) throw new UsageError(`npm pack ${spec} produced ${tarballs.length} tarballs; expected one`);
  const dest = join(scratch, "package");
  for (const { path, data } of tarEntries(gunzipSync(readFileSync(join(scratch, tarballs[0]))))) {
    // npm wraps every file in one leading `package/` directory; drop it.
    const segments = path.split("/").filter(Boolean).slice(1);
    if (segments.length === 0 || segments.includes("..")) continue;
    const abs = join(dest, ...segments);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  }
  // The version npm resolved the spec to — the revision `unify update`
  // records (§19.10). The package's own package.json is the one place it is
  // written; it stays in the scratch directory, never in the scaffold.
  let revision = null;
  try {
    const version = JSON.parse(readFileSync(join(dest, "package.json"), "utf8")).version;
    if (typeof version === "string") revision = version;
  } catch {
    // no readable package.json: the version is simply unknown
  }
  return { dir: dest, revision };
}

/**
 * The regular files of a tar archive — the ustar/pax headers npm writes.
 * Directories are implied by the file paths; links are not files.
 * @param {Buffer} buf - the uncompressed archive
 * @returns {Generator<{path: string, data: Buffer}>}
 */
function* tarEntries(buf) {
  const field = (header, start, length) => {
    const bytes = header.subarray(start, start + length);
    const end = bytes.indexOf(0);
    return bytes.subarray(0, end === -1 ? length : end).toString("utf8");
  };
  let longName = null;
  let paxPath = null;
  for (let offset = 0; offset + 512 <= buf.length; ) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156]);
    const data = buf.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === "L") { longName = data.toString("utf8").replace(/\0+$/, ""); continue; } // GNU long name
    if (type === "x") { paxPath = paxRecords(data).get("path") ?? paxPath; continue; } // pax extended header
    if (type === "g") continue; // pax global header

    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const path = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = null;
    longName = null;
    if (type === "0" || type === "\0" || type === "7") yield { path, data };
  }
}

/**
 * pax extended-header records: `<length> <key>=<value>\n`, repeated.
 * @param {Buffer} data
 * @returns {Map<string, string>}
 */
function paxRecords(data) {
  const records = new Map();
  // Lengths count BYTES, so the walk stays on the buffer: a path with a
  // non-ASCII character is exactly the case a pax header exists for.
  for (let at = 0; at < data.length; ) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(data.subarray(at, space).toString("latin1"));
    if (!Number.isFinite(length) || length <= 0) break;
    const record = data.subarray(space + 1, at + length - 1).toString("utf8");
    const eq = record.indexOf("=");
    if (eq !== -1) records.set(record.slice(0, eq), record.slice(eq + 1));
    at += length;
  }
  return records;
}
