/**
 * §11.1b — a link may name a Markdown page by its source path.
 * URL-16.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const md = (title, body) => `---\ntitle: ${title}\ndescription: ${title} page.\n---\n# ${title}\n\n${body}\n`;
const LAYOUT =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>· S</title></head><body><include src="/_includes/nav.html"></include><main><slot></slot></main></body></html>\n';

const SITE = {
  "site/_layout.html": LAYOUT,
  // Root-relative from an include, and a relative link in the include means the file beside the include.
  "site/_includes/nav.html": '<nav><a href="/guide/start.md">start</a> <a href="/index.md">home</a></nav>\n',
  "site/index.md": md("Home", "[guide](guide/start.md#next) [again](./guide/start.md?x=1) [html](guide/api.html)"),
  "site/guide/start.md": md("Start", "[home](../index.md) [sibling](api.md)\n\n## Next"),
  "site/guide/api.md": md("Api", "The api."),
};

const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const read = (...p) => readFileSync(join(...p), "utf8");

test("URL-16 — a .md source link becomes the .html link, keeps its spelling, and gets §11.2/§11.3 like any link written .html", async () => {
  const tmp = mkTmp();
  writeTree(tmp, SITE);

  const plain = await runCli(["build", "--strict"], tmp);
  if (plain.exit !== 0) throw new Error(`a site linking its Markdown by source path builds: exit ${plain.exit}\n${plain.stdout}${plain.stderr}`);
  const home = hrefs(read(tmp, "dist", "index.html"));
  for (const want of ["/guide/start.html", "/index.html", "guide/start.html#next", "./guide/start.html?x=1", "guide/api.html"]) {
    if (!home.includes(want)) throw new Error(`index.html carries ${want}: ${home.join(" ")}`);
  }
  const start = hrefs(read(tmp, "dist", "guide", "start.html"));
  for (const want of ["../index.html", "api.html"]) {
    if (!start.includes(want)) throw new Error(`guide/start.html carries ${want} (relative stays relative): ${start.join(" ")}`);
  }

  const pretty = await runCli(["build", "-o", "pretty", "--pretty-urls", "--base-url", "https://x.example/r/", "--strict"], tmp);
  if (pretty.exit !== 0) throw new Error(`pretty + base-url: exit ${pretty.exit}\n${pretty.stdout}${pretty.stderr}`);
  const p = hrefs(read(tmp, "pretty", "index.html"));
  for (const want of ["/r/guide/start/", "/r/", "/r/guide/start/#next", "/r/guide/start/?x=1", "/r/guide/api/"]) {
    if (!p.includes(want)) throw new Error(`pretty index.html carries ${want}: ${p.join(" ")}`);
  }
  if (p.some((h) => h.includes(".md"))) throw new Error(`no .md link survives: ${p.join(" ")}`);
  covers("URL-16");
}, TEST_MS);

test("URL-16 — a .md link naming nothing the build emitted as Markdown still fails §12: a typo, an excluded page, and an .html page of the same name", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "site/_layout.html": LAYOUT,
    "site/_includes/nav.html": "<nav>n</nav>\n",
    "site/index.md": md("Home", "[typo](nope.md) [held](_draft.md) [other](about.md)"),
    "site/_draft.md": md("Draft", "held back"),
    "site/about.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>About</title><meta name="description" content="About page."></head><body><h1>About</h1></body></html>\n',
  });
  const r = await runCli(["build"], tmp);
  if (r.exit !== 1) throw new Error(`expected exit 1, got ${r.exit}\n${r.stdout}${r.stderr}`);
  const out = r.stdout + r.stderr;
  for (const spelling of ["nope.md", "_draft.md", "about.md"]) {
    if (!out.includes(`${spelling} does not resolve to any emitted file`)) throw new Error(`${spelling} must fail loudly:\n${out}`);
  }
  covers("URL-16");
}, TEST_MS);
