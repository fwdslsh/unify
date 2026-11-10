/** Interactive regression for the development chrome, using a real Chromium.
 * Install Playwright separately, then run `node tests/browser/dev-tools.mjs`.
 * UNIFY_PLAYWRIGHT_MODULE can name an existing Playwright installation;
 * UNIFY_QA_OUTPUT optionally saves desktop/mobile screenshots and the result.
 * This is intentionally separate from Bun unit tests: it needs a browser.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.UNIFY_PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = await mkdtemp(join(tmpdir(), "unify-browser-qa-"));
const output = process.env.UNIFY_QA_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const source = {
  "_layout.html": '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title> — QA</title><link rel="stylesheet" href="/style.css"></head><body><nav><a href="/index.html">Home</a> <a href="/about.html">About</a></nav><main><slot>Layout defaults</slot></main><button id="site-button">Site button</button></body></html>',
  "_includes/card.fragment.html": '<article><h2><slot name="title">Default card</slot></h2><slot>Default body</slot></article>',
  "_includes/broken.fragment.html": '<include src="/missing.fragment.html"></include>',
  "style.css": 'body{font:16px system-ui;margin:24px}main{min-height:110vh}button,select{font-size:24px;padding:20px}button::before{content:"SITE"}',
  "index.html": '<html><head><title>Home</title><meta name="description" content="The home page for QA"></head><body><h1>Home</h1><include src="/_includes/card.fragment.html"><span slot="title">Home card</span><p>Home body</p></include></body></html>',
  "about.html": '<html><head><title>About</title><meta name="description" content="The about page for QA"></head><body><h1>About</h1><include src="/_includes/card.fragment.html"><span slot="title">About card</span><p>About body</p></include></body></html>',
  "context/_layout.html": '<html lang="en"><head><title> — Context</title><style>body{font:16px system-ui;margin:24px}.grid > .context-card{color:rgb(0,128,0)}.context-card{margin:20px 0;min-height:80px}.spacer{height:950px}</style></head><body class="context-layout"><header>Context header</header><main class="grid"><slot>Context fallback</slot></main><aside><include src="/_includes/context-notice.fragment.html"><span slot="title">Layout notice</span></include></aside><footer>Context footer</footer></body></html>',
  "context/repeated.html": '<html><head><title>Repeated</title><meta name="description" content="Repeated includes"><style>.context-card{background:rgb(255,221,0)}</style></head><body class="page-theme"><h1>Repeated page</h1><include src="/_includes/context-card.fragment.html"><span slot="title">First instance</span></include><div class="spacer"></div><include src="/_includes/context-card.fragment.html"><span slot="title">Second instance</span></include></body></html>',
  "context/nested.html": '<html><head><title>Nested</title><meta name="description" content="Nested includes"></head><body><h1>Nested page</h1><include src="/_includes/context-wrapper.fragment.html"></include></body></html>',
  "_includes/context-card.fragment.html": '<article class="context-card"><h2><slot name="title">Default instance</slot></h2><p>Live original</p></article>',
  "_includes/context-notice.fragment.html": '<p class="context-notice"><slot name="title">Default notice</slot></p>',
  "_includes/context-wrapper.fragment.html": '<section class="grid"><include src="/_includes/context-card.fragment.html"><span slot="title">Nested instance</span></include></section>',
};
for (const [name, text] of Object.entries(source)) {
  await mkdir(dirname(join(fixture, "src", name)), { recursive: true });
  await writeFile(join(fixture, "src", name), text);
}
await mkdir(join(fixture, "theme", "_includes"), { recursive: true });
await writeFile(join(fixture, "theme", "inherited.html"), '<html><head><title>Inherited</title><meta name="description" content="Template page for QA"></head><body><h1>Inherited</h1><include src="/_includes/template.fragment.html"></include></body></html>');
await writeFile(join(fixture, "theme", "_includes", "template.fragment.html"), "<p>Template fragment</p>");
await mkdir(join(fixture, "_includes"), { recursive: true });
await writeFile(join(fixture, "_includes", "project.fragment.html"), "<p>Project-root fragment</p>");
let server, browser, logs = "";
const passed = [];
const check = (name) => { passed.push(name); console.log("PASS", name); };
try {
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  server = spawn(process.execPath, [join(root, "src/cli.js"), "dev", "--pretty-urls", "--base-url", "https://example.test/docs/", "--extends", "./theme", "-p", String(port)], { cwd: fixture, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  const deadline = Date.now() + 20000;
  let base;
  while (Date.now() < deadline) {
    base = logs.match(/serving (http:\/\/localhost:\d+)/)?.[1];
    if (base) {
      try { if ((await fetch(base + "/_unify/pages.json")).ok && (await (await fetch(base + "/_unify/pages.json")).json()).built) break; } catch {}
    }
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(base, "dev server started");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const goto = (path) => page.goto(base + path);
  const chrome = page.locator("#unify-chrome");
  const state = () => chrome.getAttribute("data-state");
  const visible = async () => assert(await chrome.isVisible());
  await goto("/docs/");
  await visible();
  assert.equal(await page.locator(".uc-hide").evaluate((e) => getComputedStyle(e, "::before").content), "none");
  assert.equal(await page.locator("#site-button").evaluate((e) => getComputedStyle(e, "::before").content), '"SITE"');
  check("site pseudo-elements do not leak into chrome; site styling is preserved");
  if (output) await page.screenshot({ path: join(output, "desktop.png") });
  await page.getByRole("link", { name: "About", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/docs/about/");
  assert.equal(await page.locator("h1").innerText(), "About");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily), "system-ui");
  check("base-url navigation and stylesheet load");
  for (const alias of ["/", "/index.html", "/docs", "/docs/index.html", "/about", "/about/index.html", "/docs/about/index.html", "/%61bout/", "/%64ocs/about/"]) {
    assert.equal((await goto(alias)).status(), 200);
    await visible();
  }
  check("root, directory, explicit index, encoded and base-url aliases carry chrome");
  await goto("/?chrome=on&collapsed=false");
  await page.getByRole("button", { name: "Collapse the unify chrome (Esc)", exact: true }).click();
  assert.equal(await state(), "closed");
  assert.equal(await page.evaluate(() => document.activeElement.className), "uc-show");
  await page.keyboard.press("Enter");
  assert.equal(await state(), "open");
  await page.keyboard.press("Escape");
  assert.equal(await state(), "closed");
  await goto("/_unify/preview/_layout.html");
  assert.equal(await state(), "closed");
  await page.getByRole("button", { name: "Show the unify chrome", exact: true }).click();
  await goto("/?chrome=partials");
  assert.equal(await state(), "closed");
  await goto("/_unify/preview/_layout.html");
  assert.equal(await state(), "open");
  check("keyboard focus, collapse persistence and partials mode");
  for (const off of ["/?chrome=off", "/_unify/preview/_layout.html?chrome=false", "/_unify/preview/about.html?chrome=off", "/_unify/preview?chrome=off"]) {
    await goto(off);
    assert.equal(await chrome.count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("unify.chrome")), "off");
    await goto("/about/");
    assert.equal(await chrome.count(), 0);
    await goto("/?chrome=on&collapsed=false");
    await visible();
  }
  check("off/false persist across built pages, previews and redirects; on restores chrome");
  await page.getByRole("button", { name: "includes: 1", exact: true }).click();
  await page.getByRole("link", { name: "_includes/card.fragment.html", exact: true }).click();
  assert.equal(await page.locator("article h2").innerText(), "Default card");
  await goto("/_unify/preview/_includes/card.fragment.html?chrome=on&collapsed=false&tag=a&tag=b&requestSubmit=x&appendChild=y&querySelectorAll=z#section");
  await page.locator("select[name=page]").selectOption("about.html");
  await page.waitForURL(/page=about.html/);
  assert.equal(await page.locator("article h2").innerText(), "About card");
  let url = new URL(page.url());
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.searchParams.get("chrome"), "on");
  assert.equal(url.searchParams.get("collapsed"), "false");
  assert.equal(url.searchParams.get("requestSubmit"), "x");
  assert.equal(url.searchParams.get("appendChild"), "y");
  assert.equal(url.searchParams.get("querySelectorAll"), "z");
  assert.equal(url.hash, "#section");
  await page.locator("select[name=layout]").selectOption("_layout.html");
  await page.waitForURL(/layout=_layout.html/);
  await page.getByRole("button", { name: "Isolated", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("view") === "isolated");
  await page.locator("select[name=page]").selectOption("");
  await page.waitForURL((u) => !u.searchParams.has("page"));
  assert.equal(await page.locator("article h2").innerText(), "Default card");
  assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), ["a", "b"]);
  check("include/page/layout selectors compose, clear defaults and preserve repeated queries and hashes");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator(".uc-card").boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(await page.locator(".uc-card").evaluate((e) => e.scrollWidth <= e.clientWidth), true);
    await page.mouse.wheel(0, 1000);
    const after = await page.locator(".uc-card").boundingBox();
    assert.equal(after.y, bounds.y);
    if (output) await page.screenshot({ path: join(output, `preview-${width}.png`) });
  }
  check("toolbar stays on-screen at mobile/tablet/desktop widths and during scroll");
  await goto("/_unify/preview/_includes/context-card.fragment.html?tag=a&tag=b#context");
  assert.equal(await chrome.getAttribute("data-view"), "isolated");
  await page.locator("select[name=page]").selectOption("context/repeated.html");
  await page.waitForURL((u) => u.searchParams.get("page") === "context/repeated.html");
  assert.equal(await chrome.getAttribute("data-view"), "context");
  assert.equal(await page.getByRole("button", { name: "In context", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".context-card").count(), 2);
  assert.equal(await page.locator("header").innerText(), "Context header");
  assert.equal(await page.locator("footer").innerText(), "Context footer");
  assert.equal(await page.locator("h1").innerText(), "Repeated page");
  assert.equal(await page.locator("body").getAttribute("class"), "context-layout page-theme");
  const cardStyle = await page.locator(".context-card").first().evaluate((e) => ({ color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor, parent: e.parentElement.tagName }));
  assert.deepEqual(cardStyle, { color: "rgb(0, 128, 0)", background: "rgb(255, 221, 0)", parent: "MAIN" });
  assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(new URL(page.url()).hash, "#context");
  check("selecting a page defaults to its complete context, preserving ancestor CSS, page head/body and repeated includes");
  const beforeLocate = await page.locator(".context-card").first().evaluate((e) => ({ width: e.offsetWidth, height: e.offsetHeight, parent: e.parentElement.tagName }));
  await page.getByRole("button", { name: "Locate include", exact: true }).click();
  assert.equal(await page.locator(".uc-locate-status").innerText(), "Include element 1 of 2");
  await page.getByRole("button", { name: "Locate include", exact: true }).click();
  assert.equal(await page.locator(".uc-locate-status").innerText(), "Include element 2 of 2");
  await page.waitForFunction(() => window.scrollY > 400);
  assert.deepEqual(await page.locator(".context-card").first().evaluate((e) => ({ width: e.offsetWidth, height: e.offsetHeight, parent: e.parentElement.tagName })), beforeLocate);
  check("Locate include scrolls through repeated elements without wrappers or geometry changes");
  if (output) await page.screenshot({ path: join(output, "context-repeated.png") });
  await page.getByRole("button", { name: "Isolated", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("view") === "isolated");
  assert.equal(await page.locator(".context-card").count(), 1);
  assert.equal(await page.locator(".context-card h2").innerText(), "First instance");
  assert.equal(await page.locator("header").count(), 0);
  assert.equal(new URL(page.url()).searchParams.getAll("view").length, 1);
  await page.locator("select[name=page]").selectOption("context/nested.html");
  await page.waitForURL((u) => u.searchParams.get("page") === "context/nested.html");
  assert.equal(await chrome.getAttribute("data-view"), "isolated"); // an explicit choice stays chosen
  await page.getByRole("button", { name: "In context", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("view") === "context");
  assert.equal(await page.locator(".context-card h2").innerText(), "Nested instance");
  assert.equal(await page.locator("h1").innerText(), "Nested page");
  await page.reload();
  assert.equal(await chrome.getAttribute("data-view"), "context");
  await writeFile(join(fixture, "src/_includes/context-card.fragment.html"), source["_includes/context-card.fragment.html"].replace("Live original", "Live context update"));
  await page.getByText("Live context update", { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".context-card h2").innerText(), "Nested instance");
  assert.equal(await page.locator("header").innerText(), "Context header");
  assert.equal(new URL(page.url()).searchParams.get("view"), "context");
  check("explicit view choice survives page changes and reloads; nested fills and live edits stay in full context");
  await page.locator("select[name=layout]").selectOption("_layout.html");
  await page.waitForURL((u) => u.searchParams.get("layout") === "_layout.html");
  assert.equal(await page.locator("nav").innerText(), "Home About");
  assert.equal(await page.locator(".context-card h2").innerText(), "Nested instance");
  await page.locator("select[name=page]").selectOption("");
  await page.waitForURL((u) => !u.searchParams.has("page"));
  assert.equal(await page.locator(".context-card").count(), 0);
  assert(await page.getByRole("button", { name: "Locate include", exact: true }).isDisabled());
  await page.getByRole("button", { name: "Place in main content", exact: true }).click();
  await page.waitForURL((u) => u.searchParams.get("placement") === "main");
  assert.equal(await page.locator(".context-card h2").innerText(), "Default instance");
  assert.match(await page.locator(".uc-note").innerText(), /Staged in main content/);
  assert.equal(await page.locator("nav").innerText(), "Home About");
  assert.equal(await page.locator(".uc-warn").count(), 0);
  if (output) await page.screenshot({ path: join(output, "context-staged.png") });
  await page.locator("select[name=layout]").selectOption("context/_layout.html");
  await page.waitForURL((u) => u.searchParams.get("layout") === "context/_layout.html");
  assert.equal(new URL(page.url()).searchParams.has("placement"), false);
  assert.equal(await page.locator(".context-card").count(), 0);
  check("layout overrides retain page content; layout-only placement is explicit, labeled and reset when context changes");
  await goto("/_unify/preview/_includes/context-notice.fragment.html?page=context/repeated.html");
  assert.equal(await page.locator(".context-notice").innerText(), "Layout notice");
  assert.equal(await page.locator("h1").innerText(), "Repeated page");
  await page.locator("select[name=layout]").selectOption("_layout.html");
  await page.waitForURL((u) => u.searchParams.get("layout") === "_layout.html");
  assert.equal(await page.locator(".context-notice").count(), 0);
  assert(await page.getByRole("button", { name: "Locate include", exact: true }).isDisabled());
  assert.match(await page.locator(".uc-note").innerText(), /No element from this include/);
  check("includes supplied by layouts use actual fills; removing their layout reports no locatable content");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator(".uc-card").boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(await page.locator(".uc-card").evaluate((e) => e.scrollWidth <= e.clientWidth), true);
    if (output) await page.screenshot({ path: join(output, `context-${width}.png`) });
  }
  await goto("/_unify/preview/_includes/broken.fragment.html?chrome=on");
  await page.getByRole("button", { name: /problem/ }).click();
  assert(await page.locator("#unify-chrome-problems").isVisible());
  assert.match(await page.locator("#unify-chrome-problems").innerText(), /missing.fragment.html/);
  check("preview diagnostics expand and name the failed dependency");
  await goto("/_unify/preview/_includes/project.fragment.html");
  assert(await page.getByText("Project-root fragment", { exact: true }).isVisible());
  await page.getByRole("link", { name: "index", exact: true }).click();
  await page.getByRole("link", { name: "inherited.html", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/docs/inherited/");
  assert.equal(await page.locator("h1").innerText(), "Inherited");
  await page.getByRole("button", { name: "includes: 1", exact: true }).click();
  assert(await page.getByText("_includes/template.fragment.html (source preview unavailable)", { exact: true }).isVisible());
  assert.equal(await page.locator('a[href="/_unify/preview/_includes/template.fragment.html"]').count(), 0);
  check("project-root sources preview; inherited pages are indexed while template-only dependencies stay unavailable");
  await goto("/_unify/preview/");
  await page.getByRole("link", { name: "about.html", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/docs/about/");
  await page.getByRole("link", { name: "audit", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/_unify/");
  await goto("/docs/");
  await writeFile(join(fixture, "src/index.html"), source["index.html"].replace("Home body", "Rebuilt body"));
  await page.getByText("Rebuilt body", { exact: true }).waitFor({ timeout: 20000 });
  check("index/audit navigation and successful rebuild SSE reload");
  const priorMap = await (await fetch(base + "/_unify/pages.json")).json();
  await goto("/_unify/");
  await writeFile(join(fixture, "src/index.html"), source["index.html"].replace("/_includes/card.fragment.html", "/missing.fragment.html"));
  await page.getByText(/missing.fragment.html/).first().waitFor({ timeout: 20000 });
  assert.deepEqual(await (await fetch(base + "/_unify/pages.json")).json(), priorMap);
  check("failed rebuild refreshes audit and retains published page map");
  const beforeDelete = logs.length;
  await rm(join(fixture, "src/about.html"));
  const deleteDeadline = Date.now() + 20000;
  while (!logs.slice(beforeDelete).includes("rebuild failed") && Date.now() < deleteDeadline) await new Promise((r) => setTimeout(r, 100));
  assert(logs.slice(beforeDelete).includes("rebuild failed"), "deletion triggered a failed rebuild");
  await goto("/_unify/preview/");
  await page.getByRole("link", { name: "about.html", exact: true }).click();
  // WCH-04 replaces a removed page with its build-error document during a
  // failed rebuild; the index must still link to that served address.
  assert.equal(await page.locator("h1").innerText(), "Build error");
  await visible();
  assert.equal(new URL(page.url()).pathname, "/docs/about/");
  check("index retains last-published page links after source deletion during a failed rebuild");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert(!(await readFile(join(fixture, "dist/index.html"), "utf8")).includes("unify-chrome"));
  assert(!(await readFile(join(fixture, "dist/context/repeated/index.html"), "utf8")).includes("data-unify-preview-target"));
  check("no browser script errors and chrome never written into published output");
  if (output) await writeFile(join(output, "result.json"), JSON.stringify({ passed, errors }, null, 2));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(fixture, { recursive: true, force: true });
}
