/**
 * §15 transactional publish — PUB-02, PUB-04 (both "targeted" per rules.tsv).
 * Real CLI spawns only (hygiene H3); no filesystem mocking (H1); tree
 * snapshots go through compare.mjs, the one sanctioned comparator (H5).
 *
 * PUB-02 (publish sync): unchanged files are not rewritten, files no longer
 * produced are deleted, changed files land via temp-then-rename. "Not
 * rewritten" and "temp-then-rename" are proved at the filesystem level, not
 * merely by content — see the two techniques below, both named at their use
 * site.
 *
 * PUB-04 (--dry-run writes nothing): proved against a REALISTIC pre-existing
 * output directory that diverges from what the new build would produce in
 * every way (a page whose content would change, a page that would be
 * deleted, an unrelated file the build has never heard of) — a full
 * before/after byte-snapshot diff over the whole tree, not just the two
 * fixed PUB-01 sentinel files the generic harness seeds.
 */
import { test } from "bun:test";
import { existsSync, linkSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffSnapshots, snapshotTree } from "./compare.mjs";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 45_000;

const page = (title, body) =>
  `<!doctype html>\n<html>\n  <head><title>${title}</title></head>\n  <body>${body}</body>\n</html>\n`;

test("PUB-02: unchanged files keep their inode/mtime; stale outputs are deleted; changed files land via temp-then-rename", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<p>Home</p>"),
    "keep.html": page("Keep", "<p>unchanged</p>"),
    "change.html": page("Change", "<p>before</p>"),
    "gone.html": page("Gone", "<p>will be removed</p>"),
    "assets/pic.txt": "binary-ish-content\n",
  });

  let r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`setup build failed (exit ${r.exit}): ${r.stderr}`);

  const distDir = join(tmp, "dist");
  const keepPath = join(distDir, "keep.html");
  const changePath = join(distDir, "change.html");
  const gonePath = join(distDir, "gone.html");
  if (!existsSync(keepPath) || !existsSync(changePath) || !existsSync(gonePath)) {
    throw new Error("setup build did not produce the expected pages");
  }

  const keepStatBefore = statSync(keepPath);

  // A hard link OUTSIDE the output directory keeps a second directory entry
  // pointing at change.html's CURRENT inode/data, independent of whatever
  // path "dist/change.html" points to next. If the second build rewrites
  // change.html IN PLACE (open+truncate+write, same inode), this witness
  // file's content changes too, because it shares that inode. If the second
  // build instead writes a new temp file and renames it over the dest path
  // (temp-then-rename: a NEW inode replaces the "dist/change.html" directory
  // entry, and the OLD inode — still referenced by the witness's own
  // directory entry — is untouched), the witness keeps showing the OLD
  // content forever. This is a filesystem-level proof, not a timing guess.
  const changeWitness = join(tmp, "change-witness.html");
  linkSync(changePath, changeWitness);

  // Mutate the source: keep.html untouched; change.html's content changes;
  // gone.html is removed; new.html is added.
  writeFileSync(join(tmp, "src", "change.html"), page("Change", "<p>after</p>"));
  rmSync(join(tmp, "src", "gone.html"));
  writeFileSync(join(tmp, "src", "new.html"), page("New", "<p>brand new</p>"));

  r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 0) throw new Error(`second build failed (exit ${r.exit}): ${r.stderr}`);

  // unchanged: not rewritten (same inode AND same mtime).
  const keepStatAfter = statSync(keepPath);
  if (keepStatAfter.ino !== keepStatBefore.ino) throw new Error("keep.html: inode changed — an unchanged file was rewritten");
  if (keepStatAfter.mtimeMs !== keepStatBefore.mtimeMs) throw new Error("keep.html: mtime changed — an unchanged file was rewritten");

  // no longer produced: deleted.
  if (existsSync(gonePath)) throw new Error("gone.html is still present after its source was removed — stale output was not deleted");

  // changed: new content lands, via temp-then-rename (the witness proves it,
  // not just that the visible path shows new content).
  const changeContentAfter = readFileSync(changePath, "utf8");
  if (!changeContentAfter.includes("after")) throw new Error("change.html: the new content did not land");
  const witnessContent = readFileSync(changeWitness, "utf8");
  if (!witnessContent.includes("before")) {
    throw new Error(
      "change.html appears to have been rewritten IN PLACE: a hard link captured before the second build now shows the NEW content. " +
      "§15 requires temp-then-rename, under which a pre-existing hard link keeps pointing at the untouched old inode.",
    );
  }

  // new: it exists (same code path as "changed" — plan.write makes no
  // distinction — checked for completeness).
  if (!existsSync(join(distDir, "new.html"))) throw new Error("new.html was not written");

  covers("PUB-02");
}, TEST_MS);

test("PUB-04: --dry-run writes nothing at all, even against a heavily-diverging pre-existing output directory", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<p>New content</p>"),
    "about.html": page("About", "<p>About</p>"),
    "assets/style.css": "body { color: red; }\n",
  });
  // A pre-existing dist/ standing in for a previous, DIFFERENT build: content
  // this dry run would (hypothetically) rewrite, content that would become
  // stale, and an unrelated file the pipeline has never heard of.
  writeTree(join(tmp, "dist"), {
    "index.html": page("Old Home", "<p>Old content</p>"),
    "old.html": page("Old", "<p>stale</p>"),
    "assets/style.css": "body { color: blue; }\n",
    "keep-dir/note.txt": "untouched forever\n",
  });

  const before = snapshotTree(join(tmp, "dist"));

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
  if (r.exit !== 0) throw new Error(`expected exit 0 (this source tree has no problems), got ${r.exit}: ${r.stderr}`);

  const after = snapshotTree(join(tmp, "dist"));
  const diffs = diffSnapshots(before, after, "before --dry-run", "after --dry-run");
  if (diffs.length) throw new Error(`--dry-run wrote something (PUB-04 violated):\n  ${diffs.join("\n  ")}`);

  // The report still describes what WOULD happen — on stdout, and only there.
  if (!r.stdout.includes("write dist/index.html")) throw new Error(`dry-run report missing the expected write line for index.html. stdout:\n${r.stdout}`);
  if (!r.stdout.includes("delete dist/old.html")) throw new Error(`dry-run report missing the expected delete line for old.html. stdout:\n${r.stdout}`);

  covers("PUB-04");
}, TEST_MS);

test("PUB-04: --dry-run writes nothing at all when the build has a problem", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": '<!doctype html>\n<html>\n  <head><title>Home</title></head>\n  <body><a href="/nope.html">dead link</a></body>\n</html>\n',
  });
  writeTree(join(tmp, "dist"), {
    "sentinel.html": page("Sentinel", "<p>keep</p>"),
  });
  const before = snapshotTree(join(tmp, "dist"));

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], tmp);
  if (r.exit !== 1) throw new Error(`expected exit 1 (a real broken reference exists), got ${r.exit}. stdout: ${r.stdout}`);
  if (!r.stderr.includes("nope.html")) throw new Error(`the broken-link diagnostic did not print to stderr under --dry-run. stderr:\n${r.stderr}`);

  const after = snapshotTree(join(tmp, "dist"));
  const diffs = diffSnapshots(before, after, "before", "after");
  if (diffs.length) throw new Error(`--dry-run wrote something despite a problem (PUB-04 violated):\n  ${diffs.join("\n  ")}`);

  covers("PUB-04");
}, TEST_MS);
