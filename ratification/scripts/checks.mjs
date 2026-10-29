/**
 * checks.mjs — the named checks a brief's `brief.json` lists, each scoring one sample.
 *
 * Every check reads the sample's site as a FRESH build of its own publish command
 * (run-round.mjs makes it, in a copy, inside the same isolation the agent had) and
 * returns `{ pass, detail }`. A check decides one fact a person could verify by hand
 * from the emitted files; anything that needs judgement belongs in the round's triage,
 * not here. `brief.json` may mark a check `"scored": false` to report it without
 * counting it toward the sample's pass.
 *
 * ctx: { out, site, command, judge, baseUrl, events, exec(command) }
 *   out          absolute path of the fresh build's output directory
 *   site         absolute path of the copy the build ran in
 *   command      the sample's publish command, as its REPORT.md states it
 *   judge        the sample's record from judge-round.mjs
 *   baseUrl      the address the brief says the site is served from
 *   events       the agent's OpenCode event stream (`opencode run --format json`)
 *   exec(cmd)    run a shell command in the copy, isolated → { exit, stdout, stderr }
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TEXT = /\.(html|css|js|mjs|json|xml|txt|md|svg|webmanifest)$/i;

function walk(dir, rel = "", out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(abs).isDirectory()) walk(abs, r, out);
    else out.push(r);
  }
  return out;
}

const pages = (out) => walk(out).filter((r) => r.endsWith(".html") && !r.endsWith(".fragment.html"))
  .map((rel) => ({ rel, text: readFileSync(join(out, rel), "utf8") }));

/** Every `<tag …>` start tag's attributes, as objects. */
function tags(text, name) {
  return [...text.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) => {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3];
    return attrs;
  });
}

const metas = (text, key, value) => tags(text, "meta").filter((m) => (m[key] ?? "").toLowerCase() === value).map((m) => m.content ?? "");

/** Pages that declare a publication date: the posts, notes or entries a brief asks for. */
const posts = (out) => pages(out).filter((p) => metas(p.text, "name", "date").length || metas(p.text, "property", "article:published_time").length);

const list = (items, n = 4) => items.slice(0, n).join("; ") + (items.length > n ? `; … ${items.length - n} more` : "");
const missing = (out) => (existsSync(out) ? null : { pass: false, detail: "no build output" });

export const CHECKS = {
  /** Every internal link is under the brief's address and names no `.html` file (404.html and fragments aside). */
  addresses(ctx) {
    if (missing(ctx.out)) return missing(ctx.out);
    const base = new URL(ctx.baseUrl);
    const bad = [];
    let seen = 0;
    for (const p of pages(ctx.out)) {
      const pageUrl = new URL(p.rel, base);
      for (const { href } of tags(p.text, "a")) {
        if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
        const url = new URL(href, pageUrl);
        if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href) && url.origin !== base.origin) continue;
        seen++;
        if (!url.pathname.startsWith(base.pathname)) bad.push(`${p.rel}: ${href} (outside ${base.pathname})`);
        else if (url.pathname.endsWith(".html") && !/(\/404|\.fragment)\.html$/.test(url.pathname)) bad.push(`${p.rel}: ${href} (.html)`);
      }
    }
    return bad.length ? { pass: false, detail: `${bad.length} of ${seen} links: ${list(bad)}` } : { pass: true, detail: `${seen} links, all extensionless under ${base.pathname}` };
  },

  /** Nothing named in `paths` is published, and no published text contains a string in `text`. */
  absent(ctx, { paths = [], text = [] }) {
    if (missing(ctx.out)) return missing(ctx.out);
    const bad = [];
    for (const rel of walk(ctx.out)) {
      for (const p of paths) if (rel === p || rel.startsWith(p) || rel.includes(`/${p}`)) bad.push(`published ${rel}`);
      if (text.length && TEXT.test(rel)) {
        const body = readFileSync(join(ctx.out, rel), "utf8");
        for (const t of text) if (body.includes(t)) bad.push(`${rel} contains "${t}"`);
      }
    }
    return bad.length ? { pass: false, detail: list(bad) } : { pass: true, detail: "none published" };
  },

  /** At least `min` pages (fragments and 404.html aside). */
  minPages(ctx, { min }) {
    if (missing(ctx.out)) return missing(ctx.out);
    const n = pages(ctx.out).filter((p) => p.rel !== "404.html").length;
    return { pass: n >= min, detail: `${n} pages (needs ${min})` };
  },

  /** `feed.xml` has at least `minEntries` entries, every `<updated>` carrying a time of day. */
  feed(ctx, { minEntries = 1 }) {
    const path = join(ctx.out, "feed.xml");
    if (!existsSync(path)) return { pass: false, detail: "no feed.xml" };
    const feed = readFileSync(path, "utf8");
    const entries = (feed.match(/<entry\b/g) ?? []).length;
    const updated = [...feed.matchAll(/<updated>([^<]*)<\/updated>/g)].map((m) => m[1]);
    const untimed = updated.filter((u) => !/T\d\d:\d\d/.test(u)).length;
    return { pass: entries >= minEntries && untimed === 0, detail: `${entries} entries (needs ${minEntries}), ${untimed} without a time` };
  },

  /** At least `min` dated pages, each with JSON-LD of type Article or BlogPosting. */
  postArticles(ctx, { min = 1 }) {
    if (missing(ctx.out)) return missing(ctx.out);
    const ps = posts(ctx.out);
    const bad = ps.filter((p) => ![...p.text.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].some((m) => {
      try {
        const nodes = [JSON.parse(m[1])].flat().flatMap((n) => [n, ...(n["@graph"] ?? [])]);
        return nodes.some((n) => [n["@type"]].flat().some((t) => t === "Article" || t === "BlogPosting"));
      } catch { return false; }
    })).map((p) => p.rel);
    return { pass: ps.length >= min && bad.length === 0, detail: `${ps.length} dated pages (needs ${min})${bad.length ? `; no Article JSON-LD: ${list(bad)}` : ""}` };
  },

  /** At least `min` dated pages, each with an `og:image` absolute under the address (and its size, with `dimensions`). */
  postShareCards(ctx, { min = 1, dimensions = false }) {
    if (missing(ctx.out)) return missing(ctx.out);
    const ps = posts(ctx.out);
    const bad = [];
    for (const p of ps) {
      const images = metas(p.text, "property", "og:image");
      if (!images.length) bad.push(`${p.rel} (no og:image)`);
      else if (!images.every((u) => u.startsWith(ctx.baseUrl))) bad.push(`${p.rel} (${images[0]} is not under ${ctx.baseUrl})`);
      else if (dimensions && !(metas(p.text, "property", "og:image:width").length && metas(p.text, "property", "og:image:height").length)) bad.push(`${p.rel} (no og:image:width/height)`);
    }
    return { pass: ps.length >= min && bad.length === 0, detail: `${ps.length} dated pages (needs ${min})${bad.length ? `; ${list(bad)}` : ""}` };
  },

  /** `unify audit --strict`, with the publish command's own options, exits 0. */
  auditStrict(ctx) {
    if (!ctx.command) return { pass: false, detail: "no publish command" };
    const argv = ctx.command.replace(/^(\.\/)?unify\b/, "./unify").split(/\s+/)
      .filter((t) => !["--clean", "--dry-run", "--save-config", "--audit", "--strict"].includes(t));
    const at = argv.indexOf("build");
    if (at === -1) argv.splice(1, 0, "audit");
    else argv[at] = "audit";
    const r = ctx.exec(`${argv.join(" ")} --strict`);
    const last = `${r.stdout}\n${r.stderr}`.trim().split("\n").filter(Boolean).slice(-2).join(" / ");
    return { pass: r.exit === 0, detail: `exit ${r.exit}: ${last}` };
  },

  /** The agent ran a shell command matching `pattern` at least once (read from its event stream). */
  ranCommand(ctx, { pattern }) {
    const re = new RegExp(pattern);
    const runs = new Set(); // by call id: a call can be reported more than once
    for (const line of (existsSync(ctx.events) ? readFileSync(ctx.events, "utf8") : "").split("\n")) {
      if (!line.includes('"tool_use"')) continue;
      try {
        const { part } = JSON.parse(line);
        if (part?.tool === "bash" && re.test(part.state?.input?.command ?? "")) runs.add(part.callID ?? part.id);
      } catch { /* a partial line */ }
    }
    return { pass: runs.size > 0, detail: `${runs.size} run${runs.size === 1 ? "" : "s"} matching /${pattern}/` };
  },

  /** No `<slot>` reached the published pages. */
  noSlots(ctx) {
    if (missing(ctx.out)) return missing(ctx.out);
    const bad = walk(ctx.out).filter((r) => r.endsWith(".html") && /<slot[\s>]/i.test(readFileSync(join(ctx.out, r), "utf8")));
    return bad.length ? { pass: false, detail: `<slot> in ${list(bad)}` } : { pass: true, detail: "none" };
  },

  /** At least one published `*.fragment.html`, none carrying `<html>`, `<head>` or `<body>`. */
  bareFragment(ctx) {
    if (missing(ctx.out)) return missing(ctx.out);
    const frags = walk(ctx.out).filter((r) => r.endsWith(".fragment.html"));
    const bad = frags.filter((r) => /<(html|head|body)[\s>]/i.test(readFileSync(join(ctx.out, r), "utf8")));
    return { pass: frags.length > 0 && bad.length === 0, detail: frags.length ? `${frags.length} fragment(s)${bad.length ? `; wrapped: ${list(bad)}` : ""}` : "no .fragment.html published" };
  },

  /** Every root-relative `url()` in published CSS — files, `<style>` and `style=` — is under the address. */
  cssUrls(ctx) {
    if (missing(ctx.out)) return missing(ctx.out);
    const prefix = new URL(ctx.baseUrl).pathname;
    const bad = [];
    for (const rel of walk(ctx.out)) {
      if (!/\.(css|html)$/.test(rel)) continue;
      const text = readFileSync(join(ctx.out, rel), "utf8");
      const css = rel.endsWith(".css") ? [text] : [...[...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]), ...tags(text, "[a-z][a-z0-9-]*").map((a) => a.style ?? "")];
      for (const block of css) {
        for (const m of block.matchAll(/url\(\s*['"]?([^'")\s]+)/g)) if (m[1].startsWith("/") && !m[1].startsWith("//") && !m[1].startsWith(prefix)) bad.push(`${rel}: url(${m[1]})`);
      }
    }
    return bad.length ? { pass: false, detail: list(bad) } : { pass: true, detail: `every root-relative url() is under ${prefix}` };
  },

  /** The judge resolved at least one fetch target in the built pages, and every one resolved. */
  clientFetches(ctx) {
    const u = ctx.judge?.urls ?? { resolutions: [], dynamicFetches: [] };
    const ok = u.resolutions.filter((r) => r.verdict === "ok").length;
    const dyn = (u.dynamicFetches ?? []).reduce((a, d) => a + d.count, 0);
    return { pass: u.resolutions.length > 0 && ok === u.resolutions.length, detail: `${ok} of ${u.resolutions.length} resolved, ${dyn} built at runtime${u.note ? ` (${u.note})` : ""}` };
  },

  /** None of the seed file's private values reached the output (the judge's exact-string check). */
  privacy(ctx) {
    const p = ctx.judge?.privacy;
    if (!p || p.valuesChecked === 0) return { pass: false, detail: p?.source ?? "not checked" };
    return { pass: p.distinctLeaked === 0, detail: `${p.distinctLeaked} of ${p.valuesChecked} private values published` };
  },
};
