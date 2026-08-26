import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
const R = "/tmp/ratify/round-29";
const BASE = "https://bellwick.example/workshop/";
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const S of ["h1","h2","h3","h4","h5","s1"]) {
  const dist = join(R, S, "dist");
  const htmlFiles = walk(dist).filter((p) => p.endsWith(".html"));
  let v2 = "MISSING";
  const feedPath = join(dist, "feed.xml");
  let postPages = [];
  if (existsSync(feedPath)) {
    const feed = readFileSync(feedPath, "utf8");
    const entries = [...feed.matchAll(/<entry\b/g)].length;
    const updated = [...feed.matchAll(/<updated>([^<]*)<\/updated>/g)].map((m) => m[1]);
    const timed = updated.filter((u) => /T\d\d:\d\d/.test(u)).length;
    v2 = `entries=${entries},timed=${timed}/${updated.length}:${entries >= 4 && timed === updated.length ? "PASS" : "FAIL"}`;
    const entryBlocks = [...feed.matchAll(/<entry\b[\s\S]*?<\/entry>/g)].map((m) => m[0]);
    const hrefs = entryBlocks.flatMap((b) => [...b.matchAll(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/g)].map((m) => m[1]));
    postPages = hrefs.map((h) => {
      let p = h.replace(BASE, "");
      if (p.endsWith("/")) p += "index.html";
      else if (!p.endsWith(".html")) p += "/index.html";
      return join(dist, p);
    });
  }
  const existing = postPages.filter((p) => existsSync(p));
  let v3ok = 0, v4ok = 0;
  for (const p of existing) {
    const t = readFileSync(p, "utf8");
    const ld = [...t.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (ld.some((m) => /"@type"\s*:\s*"(Article|BlogPosting)"/.test(m[1]))) v3ok++;
    const og = [...t.matchAll(/property="og:image"[^>]*content="([^"]+)"|content="([^"]+)"[^>]*property="og:image"/g)]
      .map((m) => m[1] ?? m[2]);
    if (og.length && og.every((u) => u.startsWith(BASE))) v4ok++;
  }
  let htmlLinks = [];
  for (const p of htmlFiles) {
    const t = readFileSync(p, "utf8");
    for (const m of t.matchAll(/href="([^"]+)"/g)) {
      const u = m[1];
      if (/^(https?:)?\/\//.test(u) && !u.startsWith(BASE)) continue;
      if (u.split("#")[0].split("?")[0].endsWith(".html")) htmlLinks.push(`${p.slice(dist.length)}:${u}`);
    }
  }
  console.log(`${S}: V2[${v2}] feedposts=${existing.length}/${postPages.length} V3=${v3ok}/${existing.length} V4=${v4ok}/${existing.length} V5[.html hrefs=${htmlLinks.length}]${htmlLinks.length ? " " + htmlLinks.slice(0,3).join(" ") : ""}`);
}
