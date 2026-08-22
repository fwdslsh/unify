/**
 * Tier 2 — the local audit view at `/_unify/` (conformance-spec §27,
 * DEV-01..DEV-05), driven through the real CLI as a subprocess.
 *
 * Written from §27 rather than from the server that answers it: every
 * assertion below is either a sentence of the spec or a cross-check against
 * another command's own output. Where §27 says the report carries "the counts
 * `unify audit` prints" and "§17's first line", these tests RUN `unify audit`
 * and `unify build --dry-run` and compare — so the test cannot drift into
 * pinning one implementation's wording, and cannot pass by agreeing with a
 * report that disagrees with the command line (§27.3, §27.5).
 *
 * No mocks, no `src/**` imports: a report about a build is only evidence if a
 * real build produced it, and the reservation §27.2 leans on (§4.2/P14) is
 * pinned here with the real builder rather than assumed.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, covers, mkTmp, runCli, writeTree } from "./support.mjs";

/** @type {{proc: import('node:child_process').ChildProcess}[]} */
const running = [];
afterEach(() => {
  for (const { proc } of running.splice(0)) proc.kill("SIGTERM");
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Start a long-running CLI command, resolving once it has produced its first
 * output. Same shape as watch-dev.test.js's helper — a dev server that is
 * still booting must never read as a server that answered wrongly.
 * @param {string[]} args
 * @param {string} cwd
 */
function start(args, cwd) {
  const proc = spawn(process.execPath, [CLI, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  running.push({ proc });
  let out = "";
  let err = "";
  proc.stdout.on("data", (d) => { out += d; });
  proc.stderr.on("data", (d) => { err += d; });
  return {
    proc,
    get stdout() { return out; },
    get stderr() { return err; },
    ready: new Promise((res) => {
      const t = setTimeout(res, 3000);
      proc.stdout.once("data", () => { clearTimeout(t); setTimeout(res, 400); });
    }),
  };
}

/**
 * A port the OS says is free right now — never a fixed range. watch-dev.test.js
 * records why: a test that can silently talk to the wrong process is worse
 * than no test.
 * @returns {Promise<number>}
 */
async function freePort() {
  const net = await import("node:net");
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

/** Poll `url` until it answers with `want`, so no test races the first build. */
async function waitForStatus(url, want, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "never connected";
  for (;;) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status === want) return res;
      last = `status ${res.status}`;
      await res.text();
    } catch (e) {
      last = String(e);
    }
    if (Date.now() >= deadline) throw new Error(`${url} never returned ${want} (last: ${last})`);
    await sleep(150);
  }
}

/**
 * The report as a person reads it: style and script bodies dropped, tags
 * replaced by a space, character references resolved, runs of whitespace
 * folded. §27.5 says the report is HTML for a person, so every assertion in
 * this file is about the text that person sees, never about the markup that
 * encodes it. (Not tree comparison — that is compare.mjs's job and hygiene H5's
 * subject; this is a rendering, and it deliberately loses element boundaries.)
 * @param {string} html
 */
function plainText(html) {
  const stripped = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const decoded = stripped
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
  return decoded.split(/\s+/).join(" ").trim();
}

/**
 * The §27.4 cold-start page, verbatim from the server's own answer before any
 * build has finished. It is a 200 like the finished report, so polling for a
 * status is not enough to know which of the two arrived — and it routinely IS
 * the first paint: a `dev` process answers `/_unify/` as soon as it is
 * listening, which is before its first build returns.
 */
const PENDING = "No build has completed yet";

/**
 * Fetch `/_unify/` and render it, waiting out the cold-start page first. Every
 * assertion in this file is about a *finished* report, so a test that accepted
 * the pending page would be asserting against a document with no findings, no
 * records and no diagnostics in it — passing where it is written to fail
 * (`not.toContain`) and failing where it is not, for a reason that has nothing
 * to do with §27. Timing out returns the last text rather than throwing, so
 * the caller's own assertion is what reports the failure.
 */
async function report(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await waitForStatus(`http://localhost:${port}/_unify/`, 200);
    const text = plainText(await res.text());
    if (!text.includes(PENDING) || Date.now() >= deadline) return text;
    await sleep(100);
  }
}

/**
 * The summary line alone (§27.3 (1)), read from the raw HTML rather than the
 * rendered whole, because what it may claim is a statement about ONE line: the
 * rest of the report legitimately quotes diagnostics that name anything.
 * @param {string} html
 */
function summaryLine(html) {
  const m = /<p class="address">([\s\S]*?)<\/p>/.exec(html);
  return m === null ? "" : plainText(m[1]);
}

/**
 * The first HTTP answer this port ever gives to `/_unify/`, polled from before
 * the process has bound it (§27.4). Connection failures are the server not
 * being up yet and are retried; the first real response is returned whatever
 * it says, so the caller can assert on it rather than wait past it.
 * @returns {Promise<{status: number, body: string}>}
 */
async function firstAnswer(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://localhost:${port}/_unify/`, { redirect: "manual" });
      return { status: res.status, body: await res.text() };
    } catch {
      if (Date.now() >= deadline) throw new Error(`nothing ever answered on port ${port}`);
    }
  }
}

/** Fetch `/_unify/` until `predicate` holds; returns the last text either way. */
async function reportUntil(port, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  for (;;) {
    text = await report(port);
    if (predicate(text)) return text;
    if (Date.now() >= deadline) return text;
    await sleep(200);
  }
}

/**
 * `unify audit`'s own report (§24.5), parsed back into records: two lines per
 * finding, `<source path>: <severity>: <evidence> [<id>]` then `  fix: …`.
 * @param {string} stdout
 */
function parseFindings(stdout) {
  const lines = stdout.split("\n");
  const out = [];
  for (const [i, line] of lines.entries()) {
    const m = /^(.+?): (broken|incomplete): (.+) \[([a-z0-9-]+)\]$/.exec(line);
    if (!m) continue;
    const fix = /^ {2}fix: (.+)$/.exec(lines[i + 1] ?? "");
    out.push({ path: m[1], severity: m[2], evidence: m[3], id: m[4], fix: fix ? fix[1] : null });
  }
  return out;
}

/** The count line `unify audit` ends with (§24.5). */
const auditCountLine = (stdout) =>
  stdout.split("\n").find((l) => /^audit: /.test(l)) ?? "<no count line>";

/** §17's first line: the address the build assumed. */
const addressLine = (stdout) => stdout.split("\n")[0];

/** Output paths of the pages a `--dry-run` says the build writes (§17). */
function pagesFromDryRun(stdout) {
  const out = [];
  for (const line of stdout.split("\n")) {
    const m = /^write (\S+) \([^)]*\) ← (.+)$/.exec(line);
    if (m && !m[2].startsWith("generated")) out.push(m[1].replace(/^dist\//, ""));
  }
  return out;
}

/** Every file under `dir` as path → base64 bytes (byte comparison, not text). */
function snapshotBytes(dir) {
  /** @type {Record<string,string>} */
  const out = {};
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, rel);
      else out[rel] = readFileSync(p).toString("base64");
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

/** Wait until two consecutive readings of `dir` agree — a build has settled. */
async function settledSnapshot(dir, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let prev = JSON.stringify(snapshotBytes(dir));
  for (;;) {
    await sleep(400);
    const next = JSON.stringify(snapshotBytes(dir));
    if (next === prev && Object.keys(JSON.parse(next)).length > 0) return JSON.parse(next);
    prev = next;
    if (Date.now() >= deadline) return JSON.parse(next);
  }
}

const LAYOUT =
  '<!doctype html>\n<html lang="en-GB">\n<head><meta charset="utf-8"><title> — Zebra Site</title></head>\n<body><main><slot></slot></main></body>\n</html>\n';

/** A page a person would write: title, description, one h1, some prose. */
const page = (title, desc, body) =>
  `<!doctype html>\n<html><head><title>${title}</title>` +
  (desc === null ? "" : `<meta name="description" content="${desc}">`) +
  `</head>\n<body><h1>${title}</h1>${body}</body></html>\n`;

/**
 * The DEV-03/DEV-05 fixture: several DIFFERENT findings, two pages with none at
 * all, one build advisory, and one page nothing links to whose name appears
 * nowhere else on the machine.
 */
const AUDITED_SITE = {
  "src/_layout.html": LAYOUT,
  "src/index.html": page("Home", "Landing page of the zebra site",
    '<p>Welcome to the zebra site.</p><ul><li><a href="/clean.html">clean</a></li>'
    + '<li><a href="/duplicate-ids.html">ids</a></li><li><a href="/nodesc.html">nodesc</a></li>'
    + '<li><a href="/canon.html">canon</a></li></ul>'),
  "src/clean.html": page("Clean", "A page with nothing wrong with it",
    "<p>This page is entirely unremarkable.</p><h2 id=\"second\">A second heading</h2><p>More prose.</p>"),
  "src/canon.html":
    '<!doctype html>\n<html><head><title>Canon</title><meta name="description" content="A page that names its own canonical">'
    + '<link rel="canonical" href="https://zebra.example/canon.html"></head>\n'
    + "<body><h1>Canon</h1><p>Self canonical page.</p></body></html>\n",
  "src/duplicate-ids.html": page("Duplicate Ids", "A page that repeats an id twice",
    '<p id="twice">first</p><p id="twice">second</p><a href="/clean.html#absent">to clean</a>'),
  "src/nodesc.html": page("No Description", null, "<p>Nothing describes this one.</p>"),
  "src/zebra-marker.html": page("Zebra Marker", "A page nothing links to at all", "<p>Deliberately unlinked.</p>"),
  "src/art.psd": "not really a photoshop file\n",
};

const BASE = "https://zebra.example/";

/**
 * The one finding in §24.4's catalogue that is NOT located at a page:
 * `robots-sitemap-missing` is located at the source `robots.txt` and reads no
 * record (§24.4). Built WITHOUT `--base-url`, so §23.3's exemption applies and
 * the finding fires; `nodesc.html` puts an ordinary page-located finding in the
 * same report, so the grouping has both kinds to arrange.
 */
const ROBOTS_SITE = {
  "src/_layout.html": LAYOUT,
  "src/index.html": page("Home", "The landing page here",
    '<p>Alpha.</p><a href="/about.html">about</a> <a href="/nodesc.html">nodesc</a>'),
  "src/about.html": page("About", "About this site here", "<p>Beta.</p>"),
  "src/nodesc.html": page("No Description", null, "<p>Nothing describes this one.</p>"),
  "src/robots.txt": "User-agent: *\nDisallow:\nSitemap: /sitemap.xml\n",
};

/** A site whose FIRST build fails §12's reference check, so `dev` writes §16's error page. */
const BROKEN_SITE = {
  "src/_layout.html": LAYOUT,
  "src/index.html": page("Home", "The landing page here", '<p>Alpha.</p><a href="/about.html">about</a>'),
  "src/about.html": page("About", "About this site here", '<p>Beta.</p><a href="/nowhere-at-all.html">gone</a>'),
};

const SMALL_SITE = {
  "src/_layout.html": LAYOUT,
  "src/index.html": page("Home", "The landing page here", '<p>Alpha.</p><a href="/about.html">about</a>'),
  "src/about.html": page("About", "About this site here", "<p>Beta.</p>"),
  "src/style.css": "body{color:red}\n",
};

describe("§27 the local audit view", () => {
  test("DEV-01 — the report is served and never published: dist/ is a fresh build's dist/, byte for byte", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SMALL_SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    // Ask for the report — the one act §27.1 says writes nothing.
    const text = await report(port);
    expect(text.length).toBeGreaterThan(0);
    await sleep(400);
    const served = await settledSnapshot(join(tmp, "dist"));

    d.proc.kill("SIGTERM");
    await sleep(300);

    // "no file is created for it": nothing named _unify anywhere in the output.
    expect(Object.keys(served).filter((p) => p.split("/").includes("_unify"))).toEqual([]);
    expect(Object.keys(served).filter((p) => p.includes("_unify"))).toEqual([]);

    // A page fetched from dist/ by any other means is byte-identical whether or
    // not dev ever ran: build the same source in a directory dev never touched.
    const fresh = mkTmp();
    writeTree(fresh, SMALL_SITE);
    const built = await runCli(["build"], fresh);
    expect(built.exit).toBe(0);
    const plain = snapshotBytes(join(fresh, "dist"));

    expect(Object.keys(served).sort()).toEqual(Object.keys(plain).sort());
    for (const p of Object.keys(plain)) {
      expect(served[p], `${p} differs after a dev run`).toBe(plain[p]);
    }
    expect(Object.keys(plain).length).toBeGreaterThan(0);

    // "It is not in the --dry-run list, because --dry-run lists what a build
    // would write and this is not that."
    const dry = await runCli(["build", "--dry-run"], fresh);
    expect(dry.exit).toBe(0);
    expect(dry.stdout).not.toContain("_unify");
    expect(dry.stderr).not.toContain("_unify");
    covers("DEV-01");
  }, 30_000);

  test("DEV-02 — /_unify/ is the one served path, and §4.2 already forbids a site emitting it", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SMALL_SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    // Exactly one path serves the report.
    const ok = await waitForStatus(`http://localhost:${port}/_unify/`, 200);
    expect((ok.headers.get("content-type") ?? "").toLowerCase()).toContain("text/html");
    expect(plainText(await ok.text()).length).toBeGreaterThan(0);

    // A request without the trailing slash redirects to it, as any directory would.
    const bare = await fetch(`http://localhost:${port}/_unify`, { redirect: "manual" });
    await bare.text();
    expect([301, 302, 307, 308]).toContain(bare.status);
    expect(bare.headers.get("location") ?? "").toMatch(/\/_unify\/$/);

    // Any other path beneath it is a 404 from the server itself.
    for (const p of ["/_unify/anything-else", "/_unify/index.html", "/_unify/findings.json", "/_unify/a/b"]) {
      const res = await fetch(`http://localhost:${port}${p}`);
      await res.text();
      expect(res.status, `${p} must not be served`).toBe(404);
    }
    d.proc.kill("SIGTERM");
    await sleep(200);

    // The reservation's own argument, pinned rather than assumed: a site that
    // TRIES to emit into _unify cannot. Under the default exclude set both
    // sources are excluded (§4.1) and nothing named _unify is emitted.
    const squat = mkTmp();
    writeTree(squat, {
      "src/index.html": page("Home", "The landing page here", "<p>Alpha.</p>"),
      "src/_unify/index.html": page("Squat", "Trying to occupy the reserved path", "<p>Mine.</p>"),
      "src/_unify.html": page("Squat Two", "Trying to occupy it as a page", "<p>Also mine.</p>"),
    });
    const defaulted = await runCli(["build"], squat);
    expect(defaulted.exit).toBe(0);
    const emitted = snapshotBytes(join(squat, "dist"));
    expect(Object.keys(emitted)).toEqual(["index.html"]);

    // And when the author REPLACES the exclude set, so nothing holds them back,
    // each one is P14 — a problem, so the site does not publish at all.
    const replaced = await runCli(["build", "--exclude", "no-such-thing"], squat);
    expect(replaced.exit).toBe(1);
    expect(replaced.stderr).toMatch(/^src\/_unify\.html:\d+: problem: /m);
    expect(replaced.stderr).toMatch(/^src\/_unify\/index\.html:\d+: problem: /m);
    expect(replaced.stderr).not.toContain("advisory: _unify");
    // §15: a problem leaves the previous output untouched, so the reserved path
    // is still not on disk.
    expect(snapshotBytes(join(squat, "dist"))).toEqual(emitted);
    covers("DEV-02");
  }, 30_000);

  test("DEV-02 — the one output path §4.2 spares is answered by the redirect anyway", async () => {
    // §27.2's reservation argument holds for everything BENEATH `/_unify/` —
    // every such output path carries a `_`-prefixed directory segment, which is
    // P14. It does not hold for one shape, and §27.2 now names it: §4.2
    // deliberately spares root-level `_`-prefixed NON-PAGE files (the Netlify
    // seam that ships `_headers` and `_redirects`), so a source root holding a
    // file named exactly `_unify`, built with an exclude set that spares it,
    // emits `dist/_unify` with no diagnostic. The server answers `/_unify`
    // with §27.2's redirect regardless of what is on disk — it decides who
    // answers by the request path alone, never by reading the output
    // directory — so that one file is unreachable through `unify dev`.
    const tmp = mkTmp();
    const bytes = "redirect rules — not a page, not held back by §4.2\n";
    writeTree(tmp, {
      "src/index.html": page("Home", "The landing page here", "<p>Alpha.</p>"),
      "src/_unify": bytes,
    });
    const spare = ["--exclude", "_*.html", "--exclude", "_*.md"];

    // First: §4.2 really does spare it — the premise the paragraph rests on.
    const built = await runCli(["build", ...spare], tmp);
    expect(built.exit).toBe(0);
    expect(built.stderr).not.toContain("_unify");
    expect(readFileSync(join(tmp, "dist", "_unify"), "utf8")).toBe(bytes);

    const port = await freePort();
    const d = start(["dev", "-p", String(port), ...spare], tmp);
    await d.ready;

    const bare = await fetch(`http://localhost:${port}/_unify`, { redirect: "manual" });
    const bareBody = await bare.text();
    expect([301, 302, 307, 308]).toContain(bare.status);
    expect(bare.headers.get("location") ?? "").toMatch(/\/_unify\/$/);
    expect(bareBody, "the emitted file is not served at the reserved path").not.toContain("redirect rules");

    const view = await waitForStatus(`http://localhost:${port}/_unify/`, 200);
    const viewText = plainText(await view.text());
    expect(viewText).toContain("local audit view");
    expect(viewText, "the report answers, not the file").not.toContain("redirect rules");

    // And the file is still on disk, byte for byte: `dev` shadowed it, nothing
    // rewrote or removed it, and `unify build` ships it either way.
    expect(readFileSync(join(tmp, "dist", "_unify"), "utf8")).toBe(bytes);
    covers("DEV-02");
  }, 30_000);

  test("DEV-03 — the report and `unify audit` name the same findings over the same tree", async () => {
    const tmp = mkTmp();
    writeTree(tmp, AUDITED_SITE);

    // The two commands whose output §27.3 says the report carries.
    const audit = await runCli(["audit", "--base-url", BASE], tmp);
    expect(audit.exit).toBe(0);
    const findings = parseFindings(audit.stdout);
    const dry = await runCli(["build", "--dry-run", "--base-url", BASE], tmp);
    expect(dry.exit).toBe(0);
    const pages = pagesFromDryRun(dry.stdout);

    // Teeth: several different findings, and at least two pages with none.
    const ids = findings.map((f) => f.id).sort();
    expect(new Set(ids).size).toBeGreaterThanOrEqual(4);
    expect(new Set(findings.map((f) => f.severity))).toEqual(new Set(["broken", "incomplete"]));
    const accused = new Set(findings.map((f) => f.path));
    const innocent = pages.filter((p) => !accused.has(p));
    expect(innocent.length).toBeGreaterThanOrEqual(2);
    // And one §14 advisory the build raised, which is stream 4 of the report.
    const advisories = audit.stderr.split("\n").filter((l) => / advisory: /.test(l));
    expect(advisories.length).toBeGreaterThanOrEqual(1);

    const port = await freePort();
    const d = start(["dev", "-p", String(port), "--base-url", BASE], tmp);
    await d.ready;
    const text = await reportUntil(port, (t) => t.includes(findings[0].evidence));

    // 1. The summary line: the counts audit prints, and §17's first line.
    const count = auditCountLine(audit.stdout);
    expect(text).toContain(count);
    expect(text).toContain(addressLine(dry.stdout));

    // 2. The findings — §24.5's four fields rearranged rather than reworded, and
    //    not one finding more or fewer than the command line reports.
    const bracketed = [...text.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]).sort();
    expect(bracketed).toEqual(ids);
    for (const f of findings) {
      expect(text, `evidence for ${f.id}`).toContain(f.evidence);
      expect(f.fix, `${f.id} must carry a fix line (§24.5)`).not.toBeNull();
      expect(text, `fix for ${f.id}`).toContain(f.fix);
      expect(text, `page for ${f.id}`).toContain(f.path);
      expect(text).toContain(f.severity);
    }
    // Grouped BY PAGE: one page's findings are contiguous, never interleaved.
    const ordered = [...findings].sort((a, b) => text.indexOf(a.evidence) - text.indexOf(b.evidence));
    const runs = ordered.map((f) => f.path).filter((p, i, a) => i === 0 || a[i - 1] !== p);
    expect(runs.length).toBe(new Set(runs).size);

    // 3. Every page's record, including the pages nothing is wrong with.
    for (const p of pages) expect(text, `record for ${p}`).toContain(p);
    for (const p of innocent) expect(text, `innocent page ${p}`).toContain(p);
    // The record's own fields, read off the emitted document (§20.2).
    const emittedTitle = /<title>([\s\S]*?)<\/title>/.exec(readFileSync(join(tmp, "dist", "clean.html"), "utf8"));
    const cleanTitle = plainText(emittedTitle[1]);
    expect(text).toContain(cleanTitle);                       // title
    expect(text).toContain("A page with nothing wrong with it"); // description
    expect(text).toContain(`${BASE}clean.html`);              // public URL
    expect(text).toContain(`${BASE}canon.html`);              // canonical
    expect(text).toContain("en-GB");                          // language
    expect(text).toContain("A second heading");               // heading outline below h1

    // The order §27.3 states: summary, findings, records, diagnostics.
    expect(text.indexOf(count)).toBeLessThan(text.indexOf(ordered[0].evidence));
    expect(text.indexOf(ordered[ordered.length - 1].evidence)).toBeLessThan(text.indexOf(cleanTitle));
    for (const line of advisories) {
      expect(text, "the build's advisories, verbatim").toContain(line.trim());
      expect(text.indexOf(cleanTitle)).toBeLessThan(text.indexOf(line.trim()));
    }

    // No score, no grade, no percentage, no character count — anywhere.
    for (const banned of [/%/, /\bscore\b/i, /\bgrade[ds]?\b/i, /\bpercent/i, /\branking\b/i, /\bkeyword/i, /\bcharacters?\b/i, /\bchars\b/i, /\/\s*100\b/, /\bout of 10\b/i]) {
      expect(banned.test(text), `report must not carry ${banned}`).toBe(false);
    }
    covers("DEV-03");
  }, 30_000);

  test("DEV-04 — the report follows the rebuild, and says why there is no new build", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SMALL_SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    const before = await report(port);
    expect(before).toContain("About");
    expect(before).toContain("About this site here");
    expect(before).not.toContain("Directions");

    // Edit a source file while dev is running: rename the page and drop its
    // description, so both the manifest and the finding list must move.
    writeFileSync(join(tmp, "src", "about.html"),
      page("Directions", null, "<p>Beta.</p>"));
    const after = await reportUntil(port, (t) => t.includes("Directions"));

    // The report changed to match — checked against the command line, not
    // against itself: §27.5 says a disagreement is a defect in §27.
    const audit = await runCli(["audit"], tmp);
    expect(audit.exit).toBe(0);
    const findings = parseFindings(audit.stdout);
    expect(findings.some((f) => f.id === "description-missing")).toBe(true);
    expect(after).toContain("Directions");
    expect(after).not.toContain("About this site here");
    expect(after).toContain(auditCountLine(audit.stdout));
    const ids = [...after.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]).sort();
    expect(ids).toEqual(findings.map((f) => f.id).sort());
    for (const f of findings) expect(after).toContain(f.evidence);

    // Now break a page so the rebuild FAILS. §15 leaves the previous dist/ in
    // place, so without §27.3's fourth stream the report would describe a site
    // the browser is no longer being served.
    writeFileSync(join(tmp, "src", "about.html"),
      page("Directions", null, '<p>Beta.</p><a href="/nowhere-at-all.html">gone</a>'));
    const broken = await reportUntil(port, (t) => t.includes("nowhere-at-all.html"));

    // The diagnostics the same tree produces on the command line, verbatim.
    const failed = await runCli(["build", "--dry-run"], tmp);
    expect(failed.exit).toBe(1);
    const diagnostics = failed.stderr.split("\n").filter((l) => l.trim().length > 0);
    expect(diagnostics.some((l) => /: problem: /.test(l))).toBe(true);
    for (const line of diagnostics) {
      expect(broken, "the build's diagnostics, verbatim").toContain(line.trim());
    }

    // And the server never blocks on a rebuild: the report still answers, and
    // promptly, while the site on disk is the stale one.
    const t0 = Date.now();
    const again = await waitForStatus(`http://localhost:${port}/_unify/`, 200, 5_000);
    await again.text();
    expect(Date.now() - t0).toBeLessThan(5_000);
    covers("DEV-04");
  }, 30_000);

  test("DEV-05 — nothing turns it on or off, and nothing else serves it", async () => {
    const tmp = mkTmp();
    writeTree(tmp, AUDITED_SITE);

    // Not configurable: no flag turns it on, off, or moves it.
    for (const flag of ["--audit-view", "--no-audit-view"]) {
      for (const cmd of ["dev", "build", "audit"]) {
        const res = await runCli([cmd, flag], tmp);
        expect(res.exit, `unify ${cmd} ${flag} must be a usage error`).toBe(2);
      }
    }

    // build writes files, audit evaluates: neither produces nor mentions it.
    const built = await runCli(["build"], tmp);
    expect(built.exit).toBe(0);
    expect(built.stdout + built.stderr).not.toContain("_unify");
    const audited = await runCli(["audit"], tmp);
    expect(audited.exit).toBe(0);
    expect(audited.stdout + audited.stderr).not.toContain("_unify");
    expect(Object.keys(snapshotBytes(join(tmp, "dist"))).filter((p) => p.includes("_unify"))).toEqual([]);

    // `unify watch` has no server. Its own output announces none, and the one
    // port a dev server would take by default answers nothing about this site.
    const w = start(["watch"], tmp);
    await w.ready;
    await sleep(600);
    expect(w.stdout + w.stderr).not.toContain("_unify");
    expect(w.stdout + w.stderr).not.toContain("http://localhost");
    let servedByWatch = null;
    try {
      const res = await fetch("http://localhost:3000/_unify/", { signal: AbortSignal.timeout(2000) });
      servedByWatch = plainText(await res.text());
    } catch {
      servedByWatch = null; // nothing listening: the expected answer
    }
    if (servedByWatch !== null) {
      expect(servedByWatch, "unify watch must not serve the audit view").not.toContain("zebra-marker.html");
    }
    w.proc.kill("SIGTERM");
    await sleep(300);

    // Positive control: the same site under `unify dev` does answer, and names
    // the very page the watch probe looked for — so the difference above is the
    // command, not the fixture.
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;
    const text = await report(port);
    expect(text).toContain("zebra-marker.html");
    expect(d.stdout).toContain(String(port));
    covers("DEV-05");
  }, 30_000);

  test("DEV-03 — a finding located at no page groups under its own file, with no record beside it", async () => {
    // §27.3 (2) names exactly one such finding and says what walking the
    // records would cost: "`robots-sitemap-missing` is located at the source
    // `robots.txt` and reads no record, so it groups under that file with no
    // record beside it. Walking the records and collecting each one's findings
    // would drop it, and §27.5 forbids exactly that." Without this test the
    // implementation §27.3 forbids passes every other assertion in this file,
    // because no fixture here had a robots.txt at all.
    const tmp = mkTmp();
    writeTree(tmp, ROBOTS_SITE);

    // No --base-url anywhere: §23.3 exempts the Sitemap: line, §21.1 writes no
    // sitemap, and §24.4 reports the residual.
    const audit = await runCli(["audit"], tmp);
    expect(audit.exit).toBe(0);
    const findings = parseFindings(audit.stdout);
    const robots = findings.filter((f) => f.id === "robots-sitemap-missing");
    expect(robots.length, "the fixture must produce the one non-page finding").toBe(1);
    expect(robots[0].path).toBe("robots.txt");
    // And an ordinary page-located finding beside it, so this is grouping
    // rather than a report with one entry in it.
    expect(findings.some((f) => f.id !== "robots-sitemap-missing")).toBe(true);

    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;
    const text = await reportUntil(port, (t) => t.includes(robots[0].evidence));

    // §27.5: no finding `unify audit` prints is absent from this view.
    const bracketed = [...text.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]).sort();
    expect(bracketed).toEqual(findings.map((f) => f.id).sort());
    expect(text, "the robots.txt finding's evidence").toContain(robots[0].evidence);
    expect(text, "the robots.txt finding's fix").toContain(robots[0].fix);
    expect(text, "grouped under the file it is located at").toContain("robots.txt");

    // "with no record beside it": robots.txt is not a page, so §20 has no
    // record for it and the Pages section must not invent one.
    expect(text, "§27.3 (3): the records section is in the report").toContain("Pages");
    const pagesSection = text.slice(text.indexOf("Pages"));
    expect(pagesSection, "every page's record, so this slice is not empty").toContain("index.html");
    expect(pagesSection, "robots.txt is not a page and has no §20 record").not.toContain("robots.txt");
    covers("DEV-03");
  }, 30_000);

  test("DEV-04 — the first request is answered, before any build has completed", async () => {
    // §27.4: "A request that arrives before any build has completed IS
    // ANSWERED — with the report of the last build that did, or with a page
    // saying no build has completed yet." Every other test in this file waits
    // the cold-start page out, so none of them can fail on this sentence: a
    // server that refused `/_unify/` until its first build finished passed the
    // whole file. The poll starts before the process has bound the port, so
    // the answer asserted here is the first one that ever left the server.
    const tmp = mkTmp();
    writeTree(tmp, SMALL_SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);

    const first = await firstAnswer(port);
    expect(first.status, `the first answer was ${first.status}: ${first.body.slice(0, 200)}`).toBe(200);
    // One of the two documents §27.4 allows, and nothing else: the cold-start
    // page, or a finished report (§27.3's sections).
    const rendered = plainText(first.body);
    const isPending = rendered.includes(PENDING);
    const isReport = rendered.includes("Findings") && rendered.includes("Pages");
    expect(isPending || isReport, `neither answer §27.4 allows: ${rendered.slice(0, 200)}`).toBe(true);

    // And the finished report still arrives, so the pending page is a first
    // paint rather than the only thing this server ever serves.
    await d.ready;
    const text = await report(port);
    expect(text).toContain("About this site here");
    expect(text).not.toContain(PENDING);
    covers("DEV-04");
  }, 30_000);

  test("DEV-03 — the summary line describes the build, and claims nothing about the output directory", async () => {
    // §27.3 (1) fixes what the summary carries: the counts `unify audit`
    // prints, and the address the build assumed. A third clause once said "this
    // build wrote nothing to the output directory", and under `dev` that is
    // false in the one case it existed for — §16 makes an error page "the one
    // thing a broken rebuild may write", and the browser reading this report is
    // being served one. Nothing in this module can see what was written
    // (§27.3: it opens no file), so the summary must claim nothing about it —
    // product-spec §6.1's no-invented-claims rule, in the document whose whole
    // job is to say what this build did.
    const tmp = mkTmp();
    writeTree(tmp, BROKEN_SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    // Wait for the report to describe the failed build.
    await reportUntil(port, (t) => t.includes("nowhere-at-all.html"));

    // The output directory demonstrably changed: it did not exist before this
    // run, and the only thing in it is the error page this rebuild wrote.
    const written = await settledSnapshot(join(tmp, "dist"));
    expect(Object.keys(written).length).toBeGreaterThan(0);
    const errorPage = Buffer.from(written["about.html"] ?? "", "base64").toString("utf8");
    expect(errorPage, "§16: a failed rebuild under dev writes an error page").toContain("unify-watch-error-page");
    const served = await waitForStatus(`http://localhost:${port}/about.html`, 200);
    expect(await served.text(), "and the browser is being served it").toContain("unify-watch-error-page");

    // The summary line, read on its own: the publish state §15 decided, and no
    // sentence about what is or is not in `dist/`.
    const raw = await (await waitForStatus(`http://localhost:${port}/_unify/`, 200)).text();
    const summary = summaryLine(raw);
    expect(summary).toContain("not published");
    const audit = await runCli(["audit"], tmp);
    expect(audit.exit).toBe(1); // §24.6: the pipeline raised a problem
    expect(summary, "§27.3 (1): §17's first line").toContain(addressLine((await runCli(["build", "--dry-run"], tmp)).stdout));
    for (const claim of [/wrote nothing/i, /output directory/i, /untouched/i, /\bdist\b/]) {
      expect(claim.test(summary), `the summary must not describe the output directory: ${summary}`).toBe(false);
    }
    covers("DEV-03");
  }, 30_000);
});
