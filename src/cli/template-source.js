/**
 * `unify init <source>` — where a template comes from (conformance-spec §19.9).
 *
 * The positional argument names one of four things, told apart by SHAPE, in
 * this order: a built-in template (an exact name from the registry), a git
 * repository (a URL, a `git@host:` address, or a `.git` segment, with an
 * optional subdirectory and `#ref`), a directory on disk (which must exist),
 * or else an npm package — ANY package, named as published, optionally with
 * `@version` or `@tag`. The `unify-<name>-template` convention exists so a
 * template can be found on npm; it is not what makes a package a template.
 * `--audit` is: it keeps a scaffold only if it audits clean. The cost of the
 * open form is that a misspelled directory name reaches npm and fails there,
 * with npm's own message; an argument that is no form at all (a space in it,
 * a `/` outside a scope) is a usage error naming the four forms.
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
 * — beside whatever belongs at the project root (`README.md`, `DEPLOY.md`,
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

/** A git commit id, 7 to 40 hex digits: a ref `git clone --branch` cannot take. */
const COMMIT = /^[0-9a-f]{7,40}$/;

/** Never copied out of a template, at any depth: version control and installed dependencies. */
const SKIPPED_DIRS = new Set([".git", "node_modules"]);
/** Never copied from a template's root: the template's own packaging. */
const SKIPPED_ROOT_FILES = new Set(["package.json", "package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]);

/**
 * @typedef {{kind: "builtin", name: string}
 *   | {kind: "npm", spec: string}
 *   | {kind: "git", url: string, ref: string|null, subdir: string|null}
 *   | {kind: "dir", path: string}} TemplateSource
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
  if (builtIns.includes(arg)) return { kind: "builtin", name: arg };

  const git = parseGitSource(arg);
  if (git) return git;

  // A directory that exists wins over a package of the same name: what is on
  // disk is what the author can see.
  const path = resolve(cwd, arg);
  if (existsSync(path) && statSync(path).isDirectory()) return { kind: "dir", path };

  // Anything else that is a package name is an npm package — any package,
  // not only one named by the convention: --audit is what tells a template
  // from a package that is not one. A misspelled directory name lands here
  // too, and fails at npm with npm's own message.
  if (NPM_SPEC.test(arg)) return { kind: "npm", spec: arg };

  throw new UsageError(`not a template: ${arg}`, [
    `a built-in template is one of: ${builtIns.join(", ")}`,
    `a directory must exist: ${path} does not`,
    "an npm package is named as published (name or @scope/name, optionally @version or @tag); add --audit to keep it only if it audits clean",
    "a git repository is given by its URL, optionally /<subdirectory> and #<branch, tag or commit>",
  ]);
}

/**
 * §19.10 — the source as `unify.yaml` records it: exactly as typed, except
 * that a relative directory is written relative to that file (§18), which is
 * what a relative path in the file means.
 *
 * @param {TemplateSource} source
 * @param {string} label - the source as typed
 * @param {string} configDir - the directory unify.yaml sits in
 * @returns {string}
 */
export function recordSource(source, label, configDir) {
  if (source.kind !== "dir" || isAbsolute(label)) return label;
  return relative(configDir, source.path).split(sep).join("/") || ".";
}

/**
 * An npm package as published: an optionally scoped name, optionally
 * `@version` or `@tag`. Anchored and lower-case, as npm names are, and the
 * version part keeps to the characters a version or dist-tag can hold —
 * which is also what keeps the one argument that reaches a shell (npm on
 * Windows, below) free of metacharacters. `unify-<name>-template` is the
 * convention that makes a template findable on npm (§19.9); nothing here
 * requires it.
 */
export const NPM_SPEC = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[A-Za-z0-9._^~-]+)?$/;

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
 * @property {string} label - the source as the author wrote it
 */

/**
 * Fetch (where needed) and read a template into the two maps `init` writes
 * and `update` compares.
 *
 * @param {TemplateSource} source
 * @param {string} label - the positional as written
 * @returns {Promise<Template>}
 */
export async function fetchTemplate(source, label) {
  if (source.kind === "builtin") {
    // §19.9/§19.5 — the embedded copy of templates/<name>/, the one the
    // running unify carries.
    return { files: TEMPLATES[source.name], rootFiles: TEMPLATE_ROOT_FILES[source.name] ?? {}, sourceDir: "site", label };
  }
  if (source.kind === "dir") return { ...readTemplateTree(source.path, label), label };

  const scratch = mkdtempSync(join(tmpdir(), "unify-init-"));
  try {
    const dir = source.kind === "git" ? await cloneGit(source, scratch) : await packNpm(source, scratch);
    return { ...readTemplateTree(dir, label), label };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
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
      "a template is a project laid out like unify init's own: a site/ (or src/) directory beside README.md, DEPLOY.md and unify.yaml",
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
 * @returns {Promise<{code: number, stderr: string}>}
 */
function runTool(tool, args, env = {}) {
  return new Promise((done, fail) => {
    // On Windows `npm` is `npm.cmd`, which node can only run through a shell;
    // `git` is a real executable everywhere. Every argument that reaches the
    // shell is unify's own or matched NPM_SPEC (letters, digits, `.`, `_`,
    // `-`, `@`, `/`, `^`, `~`), so nothing in it can break out of the command.
    const shell = tool === "npm" && process.platform === "win32";
    const proc = spawn(tool, args, { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "pipe"], shell });
    const chunks = [];
    proc.stderr.on("data", (chunk) => chunks.push(chunk));
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        fail(new UsageError(`${tool} is not installed or not on PATH`, [
          tool === "git"
            ? "install git, or pass the template as a directory you have already cloned"
            : "npm ships with Node.js; install it, or pass the template as a directory you have already unpacked",
        ]));
      } else fail(err);
    });
    proc.on("close", (code) => done({ code: code ?? 1, stderr: Buffer.concat(chunks).toString() }));
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
 * @returns {Promise<string>} the template's path inside the checkout
 */
async function cloneGit({ url, ref, subdir }, scratch) {
  const dest = join(scratch, "repo");
  // `--branch` takes a branch or a tag, never a commit. A ref that reads as a
  // commit id clones the history and checks it out; anything else is a
  // shallow clone of that branch or tag.
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
  if (subdir === null) return dest;
  const inside = join(dest, ...subdir.split("/"));
  if (!existsSync(inside) || !statSync(inside).isDirectory()) {
    throw new UsageError(`${url}${ref ? `#${ref}` : ""} has no directory ${subdir}`, [
      "check the path after the repository; it is read inside the checkout",
    ]);
  }
  return inside;
}

/**
 * `npm pack` into the scratch directory, then unpack the one tarball it
 * produced. The author's `.npmrc` decides the registry and the credentials.
 * @param {{spec: string}} source
 * @param {string} scratch
 * @returns {Promise<string>} the unpacked package's path
 */
async function packNpm({ spec }, scratch) {
  const { code, stderr } = await runTool("npm", ["pack", spec, "--pack-destination", scratch, "--ignore-scripts", "--loglevel=error"]);
  if (code !== 0) {
    throw new UsageError(`npm pack failed (exit ${code}) for ${spec}${stderr.trim() ? `: ${tail(stderr)}` : ""}`, [
      "check the package name and version, and that you can install it with npm yourself",
      "a bare word that is not a built-in or an existing directory is read as an npm package, so a misspelled directory name lands here too",
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
  return dest;
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
