// Resolve every sample's fetch target against the REAL deploy address and check the
// file exists in its dist/. This is the round's verdict: the build cannot check these,
// so the experimenter must.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://fernhollow.pages.dev/library/";
const ROUND = "/tmp/ratify/round20";

const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

for (const sample of readdirSync(ROUND).sort()) {
  const dist = join(ROUND, sample, "dist");
  if (!existsSync(dist)) { console.log(`${sample}: no dist`); continue; }
  const files = walk(dist);

  // every page that fetches, and the literal it fetches
  const hits = [];
  for (const f of files) {
    if (!/\.(html|js)$/.test(f)) continue;
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)) hits.push({ f, url: m[1] });
    for (const m of text.matchAll(/fetch\(\s*`\$\{(\w+)\}([^`]*)`/g)) {
      const varName = m[1];
      const vm = text.match(new RegExp(`${varName}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`));
      hits.push({ f, url: (vm ? vm[1] : `\${${varName}}`) + m[2], viaVar: varName });
    }
    for (const m of text.matchAll(/hx-get="([^"]+)"/g)) hits.push({ f, url: m[1] });
  }

  if (!hits.length) { console.log(`${sample}: NO FETCH (inlined)`); continue; }

  console.log(`${sample}:`);
  for (const { f, url, viaVar } of hits) {
    // the page the fetch runs from, as a deployed URL
    const rel = f.slice(dist.length);
    const pageUrl = new URL(rel.replace(/\/index\.html$/, "/").replace(/^\//, ""), BASE);
    let resolved;
    try { resolved = new URL(url.replace(/\$\{[^}]+\}/g, "SLUG"), pageUrl); } catch { resolved = null; }
    if (!resolved) { console.log(`   ${url} -> UNRESOLVABLE`); continue; }

    const inBase = resolved.pathname.startsWith("/library/");
    // map back to a file in dist to see if it actually exists
    const p = resolved.pathname.replace(/^\/library/, "");
    const candidates = [join(dist, p), join(dist, p, "index.html")];
    const exists = candidates.some((c) => c.includes("SLUG") ? true : existsSync(c));
    const verdict = !inBase ? "404 — ESCAPES THE BASE PATH" : exists ? "ok" : "404 — no such file";
    console.log(`   from ${rel}`);
    console.log(`     fetch ${JSON.stringify(url)}${viaVar ? ` (via ${viaVar})` : ""}`);
    console.log(`     -> ${resolved.href}  ${verdict}`);
  }
}
