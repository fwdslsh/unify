/**
 * `chrome.js` — the overlay `unify dev` adds to every HTML document it serves
 * (conformance-spec §27.7): a built page, or the source preview of a layout or
 * an include. It says which source file is on screen, links to the files
 * around it (its layout, its includes, the preview index, the audit view), and
 * on a layout or include preview carries the §27.7 selector — the GET form
 * that picks the page (and, for an include, the layout) to compose it with.
 * Diagnostics the build would report for the file are listed behind an amber
 * count.
 *
 * Pure: the same input renders the same string, and nothing here touches the
 * filesystem or the network. The result is one root element with its own
 * `<style>` and `<script>`, inserted before `</body>`, and it is immune to the
 * site's own CSS by construction: every rule is scoped under the root's id and
 * every element starts from `all: initial`. It exists in no published file.
 *
 * The script reads `?chrome=on|off|partials` and `?collapsed=` from the URL,
 * remembers either whenever it is present (localStorage `unify.chrome`,
 * `unify.collapsed`), and resolves: URL, else stored, else `on` / expanded —
 * except that `partials` collapses the chrome on a built page without storing
 * anything, so the overlay stays out of the way of the site itself and
 * reappears in full on the next layout or include.
 */

const ID = "unify-chrome";

/**
 * @param {object} args
 * @param {"page"|"layout"|"fragment"} args.kind
 * @param {string} args.rel - the source path shown
 * @param {{path: string, layout: string|null, includes: string[]}|null} args.record - a page's record; null for previews
 * @param {{source: string, path: string}[]} args.reaching - built pages that use a layout/fragment
 * @param {string[]} args.layouts - layout rels a fragment may be shown in
 * @param {{page: string|null, layout: string|null}} args.selection - the current `?page=` / `?layout=`
 * @param {string[]} args.problems - formatted diagnostics for this file
 * @param {string} args.previewPath - "/_unify/preview/"
 * @param {string} args.auditPath - "/_unify/"
 * @returns {string} HTML for insertion immediately before `</body>`
 */
export function renderChrome({ kind, rel, record = null, reaching = [], layouts = [], selection = {}, problems = [], previewPath = "/_unify/preview/", auditPath = "/_unify/" }) {
  const sel = { page: selection?.page ?? null, layout: selection?.layout ?? null };
  const href = (path) => previewPath + String(path ?? "").split("/").map(encodeURIComponent).join("/");
  const label = kind === "fragment" ? "include" : kind;
  const n = problems.length;

  const head = [
    `<span class="uc-mark" aria-hidden="true">/</span>`,
    `<span class="uc-kind">${esc(label)}</span>`,
    `<span class="uc-path">${esc(rel)}</span>`,
    n ? `<button type="button" class="uc-btn uc-warn" id="${ID}-problems-btn" aria-expanded="false" aria-controls="${ID}-problems" title="what the build would report for this file">${n} problem${n === 1 ? "" : "s"}</button>` : "",
    `<span class="uc-end"><a class="uc-link" href="${esc(previewPath)}" title="every layout, include and page">index</a>`,
    `<a class="uc-link" href="${esc(auditPath)}" title="the audit view">audit</a>`,
    `<button type="button" class="uc-btn uc-icon uc-hide" aria-label="Collapse the unify chrome (Esc)" title="collapse (Esc)">&times;</button></span>`,
  ].join("");

  let body = "";
  if (kind === "page") {
    const includes = record?.includes ?? [];
    const layout = record?.layout
      ? `layout: <a class="uc-link" href="${esc(href(record.layout))}">${esc(record.layout)}</a>`
      : `<span class="uc-muted">no layout</span>`;
    const inc = includes.length
      ? `<button type="button" class="uc-btn uc-text" aria-expanded="false" aria-controls="${ID}-includes">includes: ${includes.length}</button>`
      : `<span class="uc-muted">no includes</span>`;
    const list = includes.length
      ? `<ul class="uc-list" id="${ID}-includes" hidden>${includes.map((i) => `<li><a class="uc-link" href="${esc(href(i))}">${esc(i)}</a></li>`).join("")}</ul>`
      : "";
    body = `<div class="uc-row uc-meta">${layout}<span class="uc-dot" aria-hidden="true">·</span>${inc}</div>${list}`;
  } else {
    const empty = kind === "layout" ? "No page — the layout's own defaults" : "No page — the include's own defaults";
    const extra = sel.page && !reaching.some((p) => p.source === sel.page) ? [{ source: sel.page }] : [];
    const pageOpts = [opt("", reaching.length ? empty : `${empty} (no built page uses this ${label})`, !sel.page)]
      .concat(reaching.concat(extra).map((p) => opt(p.source, p.source, p.source === sel.page))).join("");
    let fields = `<label class="uc-field"><span>page</span><select name="page" class="uc-select">${pageOpts}</select></label>`;
    if (kind === "fragment") {
      const all = sel.layout && !layouts.includes(sel.layout) ? layouts.concat(sel.layout) : layouts;
      const layoutOpts = [opt("", "Default layout", !sel.layout)].concat(all.map((l) => opt(l, l, l === sel.layout))).join("");
      fields += `<label class="uc-field"><span>layout</span><select name="layout" class="uc-select">${layoutOpts}</select></label>`;
    }
    body = `<form class="uc-row uc-form" method="get">${fields}<noscript><button class="uc-btn">apply</button></noscript></form>`;
  }

  const panel = n
    ? `<div class="uc-problems" id="${ID}-problems" hidden>${problems.map((p) => `<div class="uc-pre">${esc(p)}</div>`).join("")}</div>`
    : "";

  return `<div id="${ID}" data-kind="${esc(kind)}" data-state="open">${STYLE}` +
    `<button type="button" class="uc-show" aria-label="Show the unify chrome" title="unify">/</button>` +
    `<div class="uc-card" role="region" aria-label="unify"><div class="uc-row uc-head">${head}</div>${body}${panel}</div>` +
    `<script>${SCRIPT}</script></div>`;
}

function opt(value, text, selected) {
  return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(text)}</option>`;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// One nested block scoped under the root's id, every element reset from
// `all: initial`: the site's `*`, `pre`, `select`, `a`, `button` rules lose on
// specificity whatever they say.
const STYLE = `<style>#${ID}{--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--bg:rgba(22,22,27,.8);--fg:#f2f2f5;--mute:#a9a9b3;--line:rgba(255,255,255,.14);--hover:rgba(255,255,255,.1);--link:#9fcbff;--amber:#f6c349;--shadow:0 6px 24px rgba(0,0,0,.28);
&,*:not(style,script,noscript){all:initial;box-sizing:border-box;font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg)}
position:fixed;right:12px;bottom:12px;z-index:2147483647;display:block;max-width:calc(100vw - 24px);direction:ltr;text-align:left;
@media (prefers-color-scheme:dark){--bg:rgba(248,248,251,.86);--fg:#15151a;--mute:#5d5d69;--line:rgba(0,0,0,.12);--hover:rgba(0,0,0,.07);--link:#0f5cc0;--amber:#f2b63a;--shadow:0 6px 24px rgba(0,0,0,.22)}
[hidden],&[data-state=closed] .uc-card,&[data-state=open] .uc-show{display:none!important}
.uc-card,.uc-show{display:block;background:var(--bg);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);box-shadow:var(--shadow),0 0 0 1px var(--line);transition:opacity .15s}
.uc-show{width:36px;height:36px;margin-left:auto;border-radius:50%;cursor:pointer;font:600 17px/36px var(--mono);text-align:center;opacity:.75;&:hover{opacity:1}}
.uc-card{width:max-content;max-width:min(720px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;border-radius:10px;padding:6px 8px}
.uc-row{display:flex;align-items:center;gap:4px 8px;min-height:32px}
.uc-end{display:inline-flex;gap:8px;margin-left:auto;padding-left:8px}
@media (max-width:560px){.uc-row{flex-wrap:wrap}}
.uc-meta,.uc-form,.uc-list,.uc-problems{border-top:1px solid var(--line);margin-top:4px;padding-top:4px}
.uc-mark{font:700 15px/1 var(--mono);padding:0 2px}
.uc-kind{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:3px 7px}
.uc-path{font:12px/1.35 var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;min-width:6ch}
.uc-muted,.uc-dot,.uc-field>span{color:var(--mute)}
.uc-link,.uc-btn{display:inline-flex;align-items:center;min-height:32px;padding:0 8px;border-radius:6px;cursor:pointer;color:var(--link);text-decoration:none;white-space:nowrap;&:hover{background:var(--hover);text-decoration:underline}}
.uc-btn{color:var(--fg)}
.uc-text{padding:0 4px}
.uc-icon{justify-content:center;min-width:32px;padding:0;font-size:18px;color:var(--mute);&:hover{text-decoration:none;color:var(--fg)}}
.uc-warn{&,&:hover{background:var(--amber);color:#231a00;font-weight:600;min-height:26px;padding:0 9px;border-radius:999px;text-decoration:none}&[aria-expanded=true]{box-shadow:inset 0 0 0 2px var(--fg)}}
.uc-list{display:flex;flex-wrap:wrap;gap:0 4px;padding-left:4px;.uc-link{min-height:28px;font:11px/1 var(--mono)}}
.uc-field{display:inline-flex;align-items:center;gap:6px;min-height:32px;flex:1 1 180px;min-width:0}
.uc-select{display:block;appearance:auto;-webkit-appearance:menulist;flex:1 1 auto;min-width:0;width:auto;max-width:100%;min-height:32px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--hover);color:var(--fg);cursor:pointer;font-family:var(--mono);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
option{font:12px var(--mono);color:#111;background:#fff}
.uc-problems{display:block;max-height:40vh;overflow:auto;margin-top:6px;padding-top:6px}
.uc-pre{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font:11.5px/1.45 var(--mono);padding:6px 8px;margin:0 0 6px;border-left:3px solid var(--amber);background:var(--hover);border-radius:0 6px 6px 0}
:focus-visible{outline:2px solid var(--link);outline-offset:1px}
@media (prefers-reduced-motion:reduce){*{transition:none}}}</style>`;

// Plain inline script: no libraries, tolerant of a blocked localStorage.
const SCRIPT = `(function(){var r=document.getElementById("${ID}");if(!r)return;
var q=new URLSearchParams(location.search),S={g:function(k){try{return localStorage.getItem(k)}catch(e){return null}},s:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
var c=q.get("chrome"),o=q.get("collapsed");
if(c!==null){c=c==="false"||c==="off"?"off":c==="partials"?"partials":"on";S.s("unify.chrome",c)}
if(o!==null){o=o==="false"||o==="0"||o==="no"?"false":"true";S.s("unify.collapsed",o)}
var mode=c||S.g("unify.chrome")||"on";if(mode==="off"){r.remove();return}
var col=o!==null?o==="true":mode==="partials"&&r.dataset.kind==="page"?true:S.g("unify.collapsed")==="true";
var card=r.querySelector(".uc-card"),show=r.querySelector(".uc-show");
function set(v,store){col=v;r.dataset.state=v?"closed":"open";if(store)S.s("unify.collapsed",String(v))}
set(col,false);
show.onclick=function(){set(false,true);var h=r.querySelector(".uc-hide");if(h)h.focus()};
r.querySelector(".uc-hide").onclick=function(){set(true,true);show.focus()};
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!col&&r.isConnected){set(true,true);show.focus()}});
r.querySelectorAll("[aria-controls]").forEach(function(b){var p=document.getElementById(b.getAttribute("aria-controls"));if(!p)return;b.onclick=function(){var open=b.getAttribute("aria-expanded")==="true";b.setAttribute("aria-expanded",String(!open));p.hidden=open}});
var f=r.querySelector("form");if(f){f.onsubmit=function(){f.querySelectorAll("select").forEach(function(s){if(!s.value)s.disabled=true})};f.querySelectorAll("select").forEach(function(s){s.onchange=function(){f.requestSubmit?f.requestSubmit():f.submit()}})}
})();`;
