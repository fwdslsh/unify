import { afterAll, expect, test } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS } from "../../ratification/scripts/checks.mjs";

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
