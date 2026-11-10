import { afterAll, expect, test } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS } from "../../ratification/scripts/checks.mjs";
import { finishedCleanly, replyOf, sessionOf } from "../../ratification/scripts/retrospective.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(tmpdir(), "unify-ratification-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const run = (cmd, cwd = REPO) => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: "pipe", stderr: "pipe" });
  expect(r.exitCode, r.stderr.toString()).toBe(0);
  return r;
};
const binary = join(root, "unify");
run(["bun", "build", "--compile", "src/cli.js", "--outfile", binary]);

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test</title><meta name="description" content="A test page."></head><body><h1>Test</h1></body></html>';

for (const [name, config, sourceConfig, command, output] of [
  ["default", "", "", "./unify build", "dist"],
  ["project setting", "output: public\n", "", "./unify build", "public"],
  ["source setting wins", "output: wrong\n", "output: correct\n", "./unify build", "correct"],
  ["CLI wins with spaces", "output: wrong\n", "output: also-wrong\n", './unify build -o "public site"', "public site"],
  ["equals form", "output: wrong\n", "", './unify build --output="other site"', "other site"],
  ["audit gate", "output: public\n", "", "./unify build --audit", "public"],
]) {
  test(`ratification judges the binary's resolved output: ${name}`, () => {
    const round = join(root, name);
    const sample = join(round, "sample");
    mkdirSync(join(sample, "site"), { recursive: true });
    linkSync(binary, join(sample, "unify"));
    writeFileSync(join(sample, "site/index.html"), html);
    if (config) writeFileSync(join(sample, "unify.yaml"), config);
    if (sourceConfig) writeFileSync(join(sample, "site/unify.yaml"), sourceConfig);
    writeFileSync(join(sample, "REPORT.md"), `Exact publish command:\n\n\`\`\`sh\n${command}\n\`\`\`\n`);
    run(["bash", "-c", command], sample);
    const out = join(round, "judge.json");
    run(["bun", "ratification/scripts/judge-round.mjs", round, "--out", out]);
    const judged = JSON.parse(readFileSync(out, "utf8")).samples[0];
    expect(judged.run.exit).toBe(0);
    expect(judged.outputDir).toBe(output);
    expect(CHECKS.minPages({ out: join(sample, judged.outputDir) }, { min: 1 }).pass).toBe(true);
  });
}

for (const [name, source, command, expectedOutput] of [
  ["strict diagnostic", html.replace("<h1>", '<include src="missing.html"></include><h1>'), "./unify build", "public"],
  ["no build summary", html, "./unify build --source missing-directory", null],
]) {
  test(`ratification handles failed builds: ${name}`, () => {
    const round = join(root, name);
    const sample = join(round, "sample");
    mkdirSync(join(sample, "site"), { recursive: true });
    linkSync(binary, join(sample, "unify"));
    writeFileSync(join(sample, "site/index.html"), source);
    writeFileSync(join(sample, "unify.yaml"), "output: public\n");
    writeFileSync(join(sample, "REPORT.md"), `Exact publish command:\n\n\`\`\`sh\n${command}\n\`\`\`\n`);
    const out = join(round, "judge.json");
    run(["bun", "ratification/scripts/judge-round.mjs", round, "--out", out]);
    const judged = JSON.parse(readFileSync(out, "utf8")).samples[0];
    expect(judged.run.exit).not.toBe(0);
    expect(judged.outputDir).toBe(expectedOutput);
  });
}

test("ratification chooses the publish command over a nearby longer verification command", () => {
  const round = join(root, "publish-command");
  const sample = join(round, "sample");
  mkdirSync(join(sample, "site"), { recursive: true });
  linkSync(binary, join(sample, "unify"));
  writeFileSync(join(sample, "site/index.html"), html);
  writeFileSync(join(sample, "REPORT.md"), '## Publish command\n```sh\n./unify build --audit\n```\n\n## Final checks\n```sh\n./unify build --dry-run --strict\n```\n');
  const out = join(round, "judge.json");
  run(["bun", "ratification/scripts/judge-round.mjs", round, "--out", out]);
  const judged = JSON.parse(readFileSync(out, "utf8")).samples[0];
  expect(judged.chosenCommand).toBe("./unify build --audit");
  expect(judged.outputDir).toBe("dist");
  expect(judged.run.exit).toBe(0);
});

for (const [name, report, command, refused, commandLine = 3] of [
  ["four spaces", '## Publish command\n\n    ./unify build --output "public site"\n', './unify build --output "public site"'],
  ["list code block", '- Publish command\n\n      ./unify build --output "public site"\n', './unify build --output "public site"'],
  ["list fenced block", '- Publish command\n\n  ```sh\n  ./unify build --output "public site"\n  ```\n', './unify build --output "public site"', null, 4],
  ["tab and continuation", '## Publish command\n\n\t./unify build \\\n\t    --output "public site"\n', './unify build      --output "public site"'],
  ["indented substitution", '## Publish command\n\n    ./unify build --output "$(touch sentinel)"\n', './unify build --output "$(touch sentinel)"', "shell substitution"],
  ["paragraph continuation", 'The docs show this example:\n    ./unify build\n', null],
  ["quoted example", '> Example from the rules:\n>\n>     ./unify build\n', null],
  ["quoted fenced example", '> ```sh\n> ./unify build\n> ```\n', null],
  ["list paragraph", '- Example from the rules:\n\n    ./unify build\n', null],
]) {
  test(`ratification report code blocks: ${name}`, () => {
    const round = join(root, `code-block-${name}`);
    const sample = join(round, "sample");
    mkdirSync(join(sample, "site"), { recursive: true });
    linkSync(binary, join(sample, "unify"));
    writeFileSync(join(sample, "site/index.html"), html);
    writeFileSync(join(sample, "REPORT.md"), report);
    const out = join(round, "judge.json");
    Bun.spawnSync({ cmd: ["bun", "ratification/scripts/judge-round.mjs", round, "--out", out], cwd: REPO, stdout: "pipe", stderr: "pipe" });
    const judged = JSON.parse(readFileSync(out, "utf8")).samples[0];
    expect(judged.chosenCommand).toBe(command);
    if (refused) expect(judged.run.refused).toContain(refused);
    else if (command) {
      expect(judged.run.exit).toBe(0);
      expect(judged.outputDir).toBe("public site");
      expect(judged.candidates[0].line).toBe(commandLine);
      expect(judged.candidates[0].inPublishSection).toBe(true);
    } else expect(judged.run.executed).toBeNull();
    expect(existsSync(join(sample, "sentinel"))).toBe(false);
    expect(readFileSync(join(sample, "REPORT.md"), "utf8")).toBe(report);
  });
}

const entry = (updated = "2026-01-02T09:30:00Z") => `<entry><title>News &amp; events</title><link href="https://example.test/news/"/><updated>${updated}</updated></entry>`;
const feed = (body) => `<feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`;
let serial = 0;
function check(xml, minEntries = 1) {
  const out = join(root, `feed-${serial++}`);
  mkdirSync(out);
  writeFileSync(join(out, "feed.xml"), xml);
  return CHECKS.feed({ out, baseUrl: "https://example.test/" }, { minEntries });
}

test("ratification rejects four empty entries even with a feed-level timestamp", () => {
  const result = check(feed('<updated>2026-01-02T09:30:00Z</updated>' + '<entry/>'.repeat(4)), 4);
  expect(result.pass).toBe(false);
  expect(result.detail).toContain("entry 1: missing or invalid updated timestamp");
});

for (const date of ["2026-01-02", "", "2026-01-02T09:30:00", "garbageT09:30", "2026-02-30T09:30:00Z", "2026-01-02T25:30:00Z"]) {
  test(`ratification rejects invalid entry timestamp ${JSON.stringify(date)}`, () => {
    expect(check(feed(entry(date))).pass).toBe(false);
  });
}

test("ratification accepts complete entries with offsets and fractional seconds", () => {
  expect(check(feed(entry("2024-02-29T09:30:00.123-06:00").repeat(4)), 4).pass).toBe(true);
});

test("ratification validates each entry rather than counting timestamps", () => {
  expect(check(feed(entry() + '<entry><title>Missing time</title><link href="/news/"/></entry>'), 2).pass).toBe(false);
});

test("ratification ignores entry-shaped comments, CDATA and other namespaces", () => {
  expect(check(feed(`<!--${entry()}--><content><![CDATA[${entry()}]]></content><entry xmlns="urn:other"/>`)).pass).toBe(false);
});

test("ratification supports Atom namespace prefixes and CDATA text", () => {
  const xml = '<a:feed xmlns:a="http://www.w3.org/2005/Atom"><a:entry><a:title><![CDATA[News]]></a:title><a:link href="/news/"/><a:updated>2026-01-02T09:30:00Z</a:updated></a:entry></a:feed>';
  expect(check(xml).pass).toBe(true);
});

test("ratification rejects malformed XML, empty titles and missing links", () => {
  expect(check(feed(entry()).replace('</entry>', '')).pass).toBe(false);
  expect(check(feed(entry().replace('News &amp; events', ''))).pass).toBe(false);
  expect(check(feed(entry().replace(/<link[^>]*\/>/, ''))).pass).toBe(false);
});

function siteFixture(files) {
  const out = join(root, `site-${serial++}`);
  mkdirSync(out);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), text);
  }
  return { out, baseUrl: "https://example.test/mill/" };
}
const document = (body, head = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const insertFetch = (expression) => `async function load() { const response = await fetch(${expression}); panel.innerHTML = await response.text(); }`;

test("bare fragments accept extensionless HTML, not binary, comments, text or wrapped documents", () => {
  expect(CHECKS.bareFragment(siteFixture({ hours: '<!-- <html> -->\n<section>Open Sunday</section>' })).pass).toBe(true);
  for (const body of ["", "plain text", "<!-- <section>fake</section> -->", "\0<section>binary</section>", document("Open")]) {
    expect(CHECKS.bareFragment(siteFixture({ hours: body })).pass).toBe(false);
  }
  expect(CHECKS.bareFragment(siteFixture({ "hours.fragment.html": document("Wrapped") })).pass).toBe(false);
  expect(CHECKS.bareFragment(siteFixture({ "hours.fragment.html": "empty text" })).pass).toBe(false);
  expect(CHECKS.bareFragment(siteFixture({ hours: '<section>Open</section>', "empty-month.fragment.html": "" })).pass).toBe(true);
});

for (const [label, expression, target, declarations] of [
  ["literal", "'data/month.fragment.html'", "data/month.fragment.html", ""],
  ["template", "`data/month-${key()}.fragment.html`", "data/month-10.fragment.html", ""],
  ["concatenation", "'data/month-' + encodeURIComponent(choice.value) + '.fragment.html'", "data/month-10.fragment.html", ""],
  ["const alias", "file", "data/month-10.fragment.html", 'const file = `data/month-${key()}.fragment.html`;'],
  ["function returning extensionless path", "monthPath(1)", "data/month-10", 'const monthPath = (offset) => { return `data/month-${key(offset)}`; };'],
]) {
  test(`fragment links use including page, not script/fragment URL: ${label}`, () => {
    const ctx = siteFixture({
      "index.html": document('<script src="assets/home.js"></script>'),
      "assets/home.js": declarations + insertFetch(expression),
      [target]: '<a href="../events/october/">October</a>',
      "events/october/index.html": document("October"),
    });
    const result = CHECKS.addresses(ctx);
    expect(result.pass).toBe(false);
    expect(result.contexts).toEqual([{ page: "index.html", fragment: target, base: "https://example.test/mill/" }]);
    expect(result.failures[0]).toContain("outside /mill/");
  });
}

test("relative fragment links can be valid at insertion even when wrong at fragment URL", () => {
  const ctx = siteFixture({
    "catalogue/index.html": document(`<script>${insertFetch("'family/' + key + '.fragment.html'")}</script>`),
    "catalogue/family/beans.fragment.html": '<a href="varieties/beans/">Beans</a>',
    "catalogue/varieties/beans/index.html": document("Beans"),
  });
  expect(CHECKS.addresses(ctx).pass).toBe(true);
  expect(CHECKS.addresses(ctx).contexts.length).toBe(1);
});

test("shared scripts are checked in each including page's context, honoring base href", () => {
  const ctx = siteFixture({
    "index.html": document('<script src="assets/load.js"></script>'),
    "nested/index.html": document('<script src="/mill/assets/load.js"></script>'),
    "fixed/index.html": document('<script src="assets/load.js"></script>', '<base href="/mill/">'),
    "assets/load.js": insertFetch("'/mill/data/month.fragment.html'"),
    "data/month.fragment.html": '<a href="events/">Events</a>',
    "events/index.html": document("Events"),
  });
  const result = CHECKS.addresses(ctx);
  expect(result.contexts.length).toBe(3);
  expect(result.failures).toEqual(["nested/index.html ← data/month.fragment.html: events/ (no published target)"]);
});

test("HTML links decode entities, ignore comments/scripts, and verify targets", () => {
  const ctx = siteFixture({ "index.html": document('<a href=/mill/events/?q=a&amp;b=c>Events</a><!--<a href=/bad>--><script>const example = \'<a href="/bad">\';</script><a href="https://other.test/">External</a>'), "events/index.html": document("Events") });
  expect(CHECKS.addresses(ctx).pass).toBe(true);
  writeFileSync(join(ctx.out, "index.html"), document('<a href="missing/">Missing</a>'));
  expect(CHECKS.addresses(ctx).failures[0]).toContain("no published target");
});

test("unfetched fragments have no invented insertion context; unresolved fetches are visible", () => {
  const ctx = siteFixture({ "index.html": document(`<script>${insertFetch("chooseUrl()")}</script>`), "unused.fragment.html": '<a href="../outside/">Unknown consumer</a>' });
  const result = CHECKS.addresses(ctx);
  expect(result.pass).toBe(true);
  expect(result.contexts).toEqual([]);
  expect(result.coverage[0]).toContain("fetch(chooseUrl())");
});

test("hx-get fragments use their including document", () => {
  const ctx = siteFixture({ "index.html": document('<div hx-get="data/month.fragment.html"></div>'), "data/month.fragment.html": '<a href="/events/">Wrong prefix</a>' });
  expect(CHECKS.addresses(ctx).pass).toBe(false);
  expect(CHECKS.addresses(ctx).contexts.length).toBe(1);
});

function judgeWrapper(scripts, files = {}) {
  const round = join(root, `wrapper-${serial++}`), sample = join(round, "sample");
  mkdirSync(sample, { recursive: true });
  linkSync(binary, join(sample, "unify"));
  writeFileSync(join(sample, "package.json"), JSON.stringify({ private: true, scripts }));
  writeFileSync(join(sample, "REPORT.md"), '## Publish command\n```sh\nnpm run publish\n```\n');
  for (const [rel, value] of Object.entries(files)) {
    mkdirSync(dirname(join(sample, rel)), { recursive: true });
    writeFileSync(join(sample, rel), value);
  }
  const out = join(round, "judge.json");
  Bun.spawnSync({ cmd: ["bun", "ratification/scripts/judge-round.mjs", round, "--out", out], cwd: REPO, stdout: "pipe", stderr: "pipe" });
  return { sample, round, judged: JSON.parse(readFileSync(out, "utf8")).samples[0] };
}

test("npm publish runs preprocessing and lifecycle scripts in a copy before strict diagnostics", () => {
  const { sample, round, judged } = judgeWrapper({
    prepublish: "mkdir -p site",
    compile: "cp template.html site/index.html",
    publish: 'npm run compile && ./unify build --output="public site"',
    postpublish: "test -f 'public site/index.html'",
  }, { "template.html": html });
  expect(judged.chosenCommand).toBe("npm run publish");
  expect(judged.buildCommand).toBe('./unify build --output="public site"');
  expect(judged.preparation.exit).toBe(0);
  expect(judged.run.exit).toBe(0);
  expect(judged.run.executed).toContain('--output="public site" --dry-run --strict');
  expect(judged.outputDir).toBe("public site");
  expect(existsSync(join(round, ".judge/sample/public site/index.html"))).toBe(true);
  expect(existsSync(join(sample, "site"))).toBe(false);
  expect(existsSync(join(sample, "public site"))).toBe(false);
});

test("failed npm preprocessing or lifecycle scripts cannot get a strict-build pass", () => {
  for (const scripts of [
    { publish: "false && ./unify build" },
    { publish: "./unify build", postpublish: "false" },
  ]) {
    const { judged } = judgeWrapper(scripts, { "site/index.html": html });
    expect(judged.preparation.exit).not.toBe(0);
    expect(judged.run.exit).not.toBe(0);
    expect(judged.run.refused).toContain("npm publish script failed");
  }
});

test("npm wrapper resolution rejects cycles, missing scripts, multiple builds and dry runs", () => {
  for (const [scripts, reason] of [
    [{ publish: "npm run publish" }, "cyclic"],
    [{ publish: "npm run absent" }, "missing npm script"],
    [{ publish: "./unify build && ./unify build" }, "2 Unify builds"],
    [{ publish: "./unify build --dry-run" }, "only dry-run"],
    [{ publish: "cd nested && ./unify build" }, "changes directory"],
    [{ publish: "echo ./unify build" }, "0 Unify builds"],
  ]) {
    const { judged } = judgeWrapper(scripts);
    expect(judged.chosenCommand).toBeNull();
    expect(judged.run.refused).toContain(reason);
  }
});

test("main landmarks: exactly one per page, redirects aside, templates ignored", () => {
  const one = '<header>H</header><main><h1>Title</h1></main>';
  expect(CHECKS.mainLandmarks(siteFixture({ "index.html": document(one), "notes/index.html": document(`${one}<template><main>inert</main></template>`) }), {}).pass).toBe(true);
  expect(CHECKS.mainLandmarks(siteFixture({ "index.html": document(one), "old/index.html": document("", '<meta http-equiv="refresh" content="0; url=../">') }), {}).pass).toBe(true);
  const none = CHECKS.mainLandmarks(siteFixture({ "index.html": document(one), "visit/index.html": document("<h1>Visit</h1>") }), {});
  expect(none.pass).toBe(false);
  expect(none.failures).toEqual(["visit/index.html: 0 <main> elements"]);
  expect(CHECKS.mainLandmarks(siteFixture({ "index.html": document(`${one}<main>second</main>`) }), {}).failures).toEqual(["index.html: 2 <main> elements"]);
  expect(CHECKS.mainLandmarks(siteFixture({ "robots.txt": "" }), {}).pass).toBe(false);
});

test("main landmarks: a skip link must come before the main and land on it or inside it", () => {
  const check = (body) => CHECKS.mainLandmarks(siteFixture({ "index.html": document(body) }), { skipLink: true });
  expect(check('<a href="#content">Skip to content</a><main id="content">Text</main>').pass).toBe(true);
  expect(check('<a href="#top">Skip</a><main><h1 id="top">Title</h1></main>').pass).toBe(true);
  for (const body of [
    '<main id="content">Text</main>',
    '<a href="#content">Skip</a><main id="article">Text</main>',
    '<a href="#">Skip</a><main>Text</main>',
    '<a href="#nav">Skip</a><nav id="nav"></nav><main>Text</main>',
    '<main id="content">Text</main><a href="#content">Back to top</a>',
  ]) expect(check(body).failures).toEqual(["index.html: no link before its <main> jumps to it"]);
});

test("main landmarks: the names pages give their main must be their own", () => {
  const page = (main) => document(`<header>H</header>${main}`);
  const named = { "index.html": page('<main aria-label="Home">a</main>'), "visit/index.html": page('<main aria-labelledby="t"><h1 id="t">Visit <em>us</em></h1></main>'), "guides/oak/index.html": page("<main>c</main>") };
  expect(CHECKS.mainLandmarks(siteFixture(named), { labelled: 2 }).pass).toBe(true);
  expect(CHECKS.mainLandmarks(siteFixture(named), { labelled: 3 }).failures).toEqual(["2 distinct <main> names (needs 3)"]);
  const same = { "index.html": page('<main aria-label="Alderfen">a</main>'), "visit/index.html": page('<main aria-label="alderfen">b</main>'), "x/index.html": page('<main aria-labelledby="gone">c</main>') };
  expect(CHECKS.mainLandmarks(siteFixture(same), { labelled: 2 }).failures).toEqual(["1 distinct <main> names (needs 2)"]);
});

test("main landmarks: listed files sit outside the main, and markup that names none is noted", () => {
  const outside = ["home-wide.png"];
  const above = CHECKS.mainLandmarks(siteFixture({ "index.html": document('<div style="background-image:url(images/home-wide.png)"></div><main>Text</main>') }), { outside });
  expect(above.pass).toBe(true);
  expect(above.coverage).toEqual([]);
  expect(CHECKS.mainLandmarks(siteFixture({ "index.html": document('<main><img src="/a/images/home-wide.png" alt="">Text</main>') }), { outside }).failures).toEqual(["index.html: home-wide.png is inside <main>"]);
  const unseen = CHECKS.mainLandmarks(siteFixture({ "index.html": document('<div class="banner"></div><main>Text</main>') }), { outside });
  expect(unseen.pass).toBe(true);
  expect(unseen.coverage.length).toBe(1);
});

test("JSON listing: entries are the exact public addresses of published pages", () => {
  const pages = { "notes/first/index.html": document("First"), "notes/second/index.html": document("Second"), "notes/data": "not a page" };
  const check = (entries, params = { path: "notes.json", min: 2 }) => CHECKS.jsonListing(siteFixture({ ...pages, "notes.json": typeof entries === "string" ? entries : JSON.stringify(entries) }), params);
  const entry = (slug, more = {}) => ({ title: slug, date: "2026-03-01", url: `https://example.test/mill/notes/${slug}/`, ...more });
  expect(check([entry("first"), entry("second")]).pass).toBe(true);
  expect(check([entry("first")]).pass).toBe(false);
  for (const [bad, why] of [
    [entry("first", { url: "https://example.test/mill/notes/first" }), "no published page at exactly that address"],
    [entry("first", { url: "https://example.test/mill/notes/first.html" }), "(.html)"],
    [entry("first", { url: "https://example.test/notes/first/" }), "outside https://example.test/mill/"],
    [entry("first", { url: "/mill/notes/first/" }), "is not a full address"],
    [entry("first", { url: "https://example.test/mill/notes/third/" }), "no published page"],
    [entry("first", { url: "https://example.test/mill/notes/data" }), "no published page"],
    [entry("first", { title: " " }), "no title"],
    [entry("second"), "listed twice"],
  ]) {
    const result = check([bad, entry("second")]);
    expect(result.pass).toBe(false);
    expect(result.failures.join("\n")).toContain(why);
  }
  expect(check("{").detail).toContain("is not JSON");
  expect(check({ notes: [] }).detail).toContain("not a JSON array");
  expect(CHECKS.jsonListing(siteFixture(pages), { path: "notes.json" }).detail).toBe("no notes.json");
});

test("retrospective: asked only of runs that exit 0 without an error, pass or fail", () => {
  expect(finishedCleanly({ exit: 0 }, null)).toBe(true);
  expect(finishedCleanly({ exit: 0 }, "provider error")).toBe(false);
  expect(finishedCleanly({ exit: 1 }, null)).toBe(false);
  expect(finishedCleanly({ exit: 124, timedOut: true }, null)).toBe(false);
  expect(finishedCleanly({ exit: null, signal: "SIGKILL" }, null)).toBe(false);
});

test("retrospective: the reply is the stream's text parts, and the session is the run's own", () => {
  const event = (type, data) => JSON.stringify({ type, timestamp: 1, sessionID: "ses_1", ...data });
  const stream = [
    event("step_start", { part: {} }),
    event("text", { part: { type: "text", text: "It went smoothly.\n" } }),
    event("tool_use", { part: { tool: "read", state: { input: {} } } }),
    "not json",
    event("text", { part: { type: "text", text: "I lost time on the feed." } }),
    event("text", { part: { type: "text", text: "  " } }),
    event("step_finish", { part: { cost: 0 } }),
  ].join("\n");
  expect(replyOf(stream)).toBe("It went smoothly.\n\nI lost time on the feed.");
  expect(sessionOf(stream)).toBe("ses_1");
  expect(replyOf(event("step_finish", { part: {} }))).toBe("");
  expect(sessionOf("plain text\n")).toBeNull();
  // Output that is not an event stream is the reply as written.
  expect(replyOf("A plain answer.\nOn two lines.\n")).toBe("A plain answer.\nOn two lines.");
});

test("direct strict judging runs generators in a copy and preserves original evidence", () => {
  const round = join(root, "direct-generator-copy"), sample = join(round, "sample");
  mkdirSync(join(sample, "site"), { recursive: true });
  linkSync(binary, join(sample, "unify"));
  writeFileSync(join(sample, "site/index.html"), html);
  writeFileSync(join(sample, "site/_generate.mjs"), 'import { writeFileSync } from "node:fs"; writeFileSync("../generated-marker.txt", "changed");');
  writeFileSync(join(sample, "REPORT.md"), '## Publish command\n```sh\n./unify build --generate _generate.mjs\n```\n');
  const out = join(round, "judged.json");
  run(["bun", "ratification/scripts/judge-round.mjs", round, "--out", out]);
  const judged = JSON.parse(readFileSync(out, "utf8")).samples[0];
  expect(judged.run.exit, JSON.stringify(judged.run)).toBe(0);
  expect(existsSync(join(sample, "generated-marker.txt"))).toBe(false);
  expect(existsSync(join(round, ".judge/sample/generated-marker.txt"))).toBe(true);
});

test("runner's canonical binary replaces an agent-modified executable only in the judge copy", () => {
  const round = join(root, "canonical-binary"), sample = join(round, "sample");
  mkdirSync(join(sample, "site"), { recursive: true });
  writeFileSync(join(sample, "unify"), "agent-modified binary");
  writeFileSync(join(sample, "site/index.html"), html);
  writeFileSync(join(sample, "REPORT.md"), '## Publish command\n```sh\n./unify build\n```\n');
  const config = join(round, "config.json"), out = join(round, "judged.json");
  writeFileSync(config, JSON.stringify({ binary }));
  run(["bun", "ratification/scripts/judge-round.mjs", round, "--config", config, "--out", out]);
  expect(JSON.parse(readFileSync(out, "utf8")).samples[0].run.exit).toBe(0);
  expect(readFileSync(join(sample, "unify"), "utf8")).toBe("agent-modified binary");
});
