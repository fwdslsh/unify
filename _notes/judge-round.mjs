#!/usr/bin/env bun
/**
 * judge-round.mjs — the standing instrument for judging a ratification round.
 * Version 1.0.0. Runs under bun or node (>=18). Zero dependencies.
 *
 *   bun _notes/judge-round.mjs <round-dir> [--config judge.json]
 *   bun _notes/judge-round.mjs --self-test
 *
 * <round-dir> contains sample subdirectories (haiku-1, sonnet-1, …), each with
 * REPORT.md, the authored site, usually dist/, and the round's own `unify`
 * binary. Samples are treated as read-only evidence: nothing is ever written
 * into a sample directory, and every build runs with `--dry-run` appended
 * ("no writes at all, anywhere" — build.js's own contract). The one file this
 * tool writes is `judge-results.json` in the round directory itself.
 *
 * Why this exists: every false verdict in twenty rounds came from improvised
 * judging, never from the samples. The three most recent, each encoded here as
 * behaviour plus a self-test:
 *
 *  1. A `grep -oE '\.\/unify build[^`"|]*'` truncated a command at its own
 *     quoted --base-url value and judged the sample with the amputated half
 *     (exit 2, "needs a value"). → Commands are extracted with a quote-aware
 *     scanner from fenced code blocks, whole, and every candidate is recorded
 *     so a wrong pick is visible in the output.
 *  2. A backslash line-continuation split another sample's command in two and
 *     produced a spurious exit 2. → Continuations are joined before scanning.
 *  3. A domain-level grep for leaked private data matched a *public* address
 *     the samples had invented (5/6 "leak" that was 0/6 for the real values).
 *     → The privacy check greps for the exact private strings only — from
 *     config, or derived from the seed file's named fields — never a domain,
 *     never a pattern.
 *
 * Two older traps are also structural here: the build is judged IN PLACE with
 * the sample's own command (never re-run with -o elsewhere, which manufactured
 * false failures twice), and the primitive sweep reads the site SOURCE tree,
 * not the sandbox (rules.md quotes `{{ }}` as a counter-example, so sweeping
 * the whole sandbox false-positives on every clean sample).
 *
 * Config file (--config, JSON; every key optional):
 *   marker           regex counted across the build output   (default "Fernhollow keeps")
 *   privateValues    exact private strings to grep for; overrides seed derivation
 *   seedFile         per-sample seed to derive them from     (default "varieties.json")
 *   privateFields    keys whose string values are private    (default ["keeper_contact"])
 *   baseUrl          deploy address for URL resolution       (default: the command's own --base-url)
 *   diagnosticLines  stderr lines kept per sample            (default 12)
 *   timeoutMs        per-build timeout                       (default 240000)
 *   primitives       {label: literal-or-/regex/} swept over the source tree
 *   sweepExclude     top-level names skipped by the sweep ("X*" = prefix match)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

const VERSION = "1.0.0";

const DEFAULTS = {
  marker: "Fernhollow keeps",
  privateValues: null,
  seedFile: "varieties.json",
  privateFields: ["keeper_contact"],
  baseUrl: null,
  diagnosticLines: 12,
  timeoutMs: 240000,
  primitives: { include: "<include", "slot-fill": 'slot="', "data-layout": "data-layout" },
  sweepExclude: ["rules.md", "REPORT.md", "BRIEF*", "PROMPT*", "unify", "judge-results.json", "drafts", "node_modules"],
};

// ---------------------------------------------------------------- extraction

/**
 * Fenced code blocks (``` or ~~~) with their content lines and 1-based line
 * numbers. Inline code in prose is deliberately not scanned: reports quote the
 * rules doc's `node gen.mjs && unify build` in running text, and those quotes
 * are not the sample's command.
 */
function fencedBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(```+|~~~+)/);
    if (m && !open) {
      open = { fence: m[1][0], openLine: i + 1, lines: [] };
    } else if (m && open && m[1][0] === open.fence) {
      blocks.push(open);
      open = null;
    } else if (open) {
      open.lines.push({ text: lines[i], line: i + 1 });
    }
  }
  if (open) blocks.push(open); // unterminated fence: judge what is there
  return { blocks, lines };
}

/** Join backslash line-continuations into logical lines (shell semantics). */
function logicalLines(blockLines) {
  const out = [];
  let buf = null;
  for (const { text, line } of blockLines) {
    const cont = /\\\s*$/.test(text);
    const body = cont ? text.replace(/\\\s*$/, " ") : text;
    if (buf) {
      buf.text += body;
    } else {
      buf = { text: body, line };
    }
    if (!cont) {
      out.push(buf);
      buf = null;
    }
  }
  if (buf) out.push({ text: buf.text.replace(/\\\s*$/, ""), line: buf.line, dangling: true });
  return out;
}

/**
 * Quote-aware scan of one logical shell line. Tokens carry their character
 * positions so a command can be sliced out of the raw line exactly as written
 * — quotes, glob patterns and all. Control operators (&& || ; | & and
 * redirects) become their own tokens and terminate a command's extent.
 */
function scanShellLine(line) {
  const tokens = [];
  let cur = null;
  let state = "n"; // n = normal, s = single-quoted, d = double-quoted
  let substitution = false; // $ or ` reachable by the shell (not single-quoted)
  const push = (end) => {
    if (cur) {
      tokens.push({ text: cur.text, start: cur.start, end });
      cur = null;
    }
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (state === "s") {
      if (c === "'") state = "n";
      cur.text += c;
      continue;
    }
    if (state === "d") {
      if (c === '"') state = "n";
      else if (c === "\\" && i + 1 < line.length) {
        cur.text += c + line[i + 1];
        i++;
        continue;
      } else if (c === "$" || c === "`") substitution = true;
      cur.text += c;
      continue;
    }
    if (/\s/.test(c)) {
      push(i);
      continue;
    }
    if (c === "#" && !cur) {
      tokens.push({ text: "#", start: i, end: line.length, op: true });
      break;
    }
    if (/[&|;<>]/.test(c)) {
      // `2>&1`: an unseparated digit run directly before a redirect is part of
      // the redirect word, not a stray positional argument for the command.
      let opStart = i;
      if (cur && /^\d+$/.test(cur.text) && (c === ">" || c === "<")) {
        opStart = cur.start;
        cur = null;
      } else {
        push(i);
      }
      let j = i;
      while (j < line.length && /[&|;<>0-9]/.test(line[j])) j++;
      tokens.push({ text: line.slice(opStart, j), start: opStart, end: j, op: true });
      i = j - 1;
      continue;
    }
    if (!cur) cur = { text: "", start: i };
    if (c === "'") {
      state = "s";
      cur.text += c;
      continue;
    }
    if (c === '"') {
      state = "d";
      cur.text += c;
      continue;
    }
    if (c === "\\" && i + 1 < line.length) {
      cur.text += c + line[i + 1];
      i++;
      continue;
    }
    if (c === "$" || c === "`") substitution = true;
    cur.text += c;
  }
  push(line.length);
  return { tokens, balanced: state === "n", substitution };
}

const isUnifyToken = (t) => t === "unify" || t === "./unify" || t.endsWith("/unify");

/**
 * Every `unify build` invocation in REPORT.md's fenced blocks, whole:
 * continuations joined, quoted arguments intact, any `foo && ` prefix and any
 * ` && bar` / redirect suffix cut at top-level operators only. All candidates
 * are returned; the caller records them all so a wrong pick stays visible.
 */
function extractCandidates(reportText) {
  const { blocks, lines } = fencedBlocks(reportText);
  const candidates = [];
  for (const block of blocks) {
    // "Exact publish command" section detection: any line in the 12 lines
    // above the opening fence naming the publish command.
    let inPublishSection = false;
    for (let i = block.openLine - 2; i >= Math.max(0, block.openLine - 13); i--) {
      if (/(publish|exact)[^\n]{0,40}command/i.test(lines[i] ?? "")) {
        inPublishSection = true;
        break;
      }
    }
    for (const logical of logicalLines(block.lines)) {
      const { tokens, balanced } = scanShellLine(logical.text);
      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].op || !isUnifyToken(tokens[i].text)) continue;
        if (tokens[i + 1].op || tokens[i + 1].text !== "build") continue;
        let end = logical.text.length;
        for (let j = i + 2; j < tokens.length; j++) {
          if (tokens[j].op) {
            end = tokens[j].start;
            break;
          }
        }
        const command = logical.text.slice(tokens[i].start, end).trim();
        candidates.push({
          line: logical.line,
          raw: logical.text.trim(),
          command,
          complete: balanced && !logical.dangling,
          inPublishSection,
          // shell substitution reachable within the COMMAND slice itself —
          // an env-dependent or side-effecting command is not judged, only shown
          substitution: scanShellLine(command).substitution,
        });
        break; // one candidate per logical line
      }
    }
  }
  return candidates;
}

/** Prefer the publish-command section, then completeness, then length. */
function chooseCandidate(candidates) {
  if (candidates.length === 0) return { chosen: null, reason: "no fenced `unify build` command found" };
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = (c.complete ? 2000 : 0) + (c.inPublishSection ? 1000 : 0) + c.command.length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  const why = [];
  if (best.inPublishSection) why.push("in the publish-command section");
  why.push(best.complete ? "complete" : "INCOMPLETE (unbalanced quoting)");
  if (candidates.length > 1) why.push(`longest of ${candidates.length} candidates`);
  return { chosen: best, reason: why.join(", ") };
}

/** Value of a --name/-x option in a scanned command, unquoted; null if absent. */
function optionValue(command, names) {
  const { tokens } = scanShellLine(command);
  const unquote = (t) => {
    const m = t.match(/^(['"])([\s\S]*)\1$/);
    return m ? m[2] : t;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    for (const name of names) {
      if (t === name && tokens[i + 1] && !tokens[i + 1].op) return unquote(tokens[i + 1].text);
      if (t.startsWith(`${name}=`)) return unquote(t.slice(name.length + 1));
    }
  }
  return null;
}

// ------------------------------------------------------------------ running

/**
 * Judge in place: the sample's own command, in the sample's own directory,
 * with --dry-run --strict appended (deduplicated). Output is captured in
 * memory — never redirected into the sample.
 */
function runBuild(sampleDir, command, timeoutMs) {
  let executed = command;
  if (/^unify\s/.test(executed) && existsSync(join(sampleDir, "unify"))) executed = `./${executed}`;
  if (!/(^|\s)--dry-run(\s|$)/.test(executed)) executed += " --dry-run";
  if (!/(^|\s)--strict(\s|$)/.test(executed)) executed += " --strict";
  const res = spawnSync("bash", ["-c", executed], {
    cwd: sampleDir,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    executed,
    exit: res.status,
    signal: res.signal ?? null,
    error: res.error ? String(res.error.message ?? res.error) : null,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/** Diagnostic lines are `FILE[:LINE]: severity: …`; continuations are indented. */
function parseDiagnostics(stderr, stdout, keep) {
  const errLines = stderr.split("\n").filter((l) => l !== "");
  const top = errLines.filter((l) => !/^\s/.test(l));
  const problems = top.filter((l) => /: problem: /.test(l)).length;
  const advisories = top.filter((l) => /: advisory: /.test(l)).length;
  const outLines = stdout.split("\n");
  return {
    problems,
    advisories,
    diagnostics: errLines.slice(0, keep),
    stderrLines: errLines.length,
    servingFrom: outLines.find((l) => l.startsWith("serving from ")) ?? null,
    wouldPublish: outLines.filter((l) => /^would publish /.test(l)).at(-1) ?? null,
  };
}

// ----------------------------------------------------------------- analyses

function walkFiles(dir, out = [], rel = "") {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) walkFiles(abs, out, r);
    else out.push(r);
  }
  return out;
}

function readText(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  if (buf.length > 8 * 1024 * 1024) return null;
  if (buf.subarray(0, 8000).includes(0)) return null; // binary
  return buf.toString("utf8");
}

function countSubstring(text, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

/** Marker occurrences across the build output (content-loss check). */
function countMarkers(outAbs, markerRegexSource) {
  if (!existsSync(outAbs)) return { present: false, total: 0, files: 0 };
  const re = new RegExp(markerRegexSource, "g");
  let total = 0;
  let files = 0;
  for (const rel of walkFiles(outAbs)) {
    const text = readText(join(outAbs, rel));
    if (text === null) continue;
    const n = [...text.matchAll(re)].length;
    if (n > 0) {
      files++;
      total += n;
    }
  }
  return { present: true, total, files };
}

/** All string values under the named keys, anywhere in a JSON tree. */
function collectFieldValues(node, fields, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectFieldValues(item, fields, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (fields.includes(k) && typeof v === "string" && v !== "") out.add(v);
      else collectFieldValues(v, fields, out);
    }
  }
}

/**
 * Privacy: exact private strings only — never a domain, never a pattern. A
 * domain grep once matched a public address the samples had invented and
 * briefly turned a 0/6 into a 5/6.
 */
function checkPrivacy(sampleDir, outAbs, config) {
  let values = config.privateValues;
  let source = "config.privateValues";
  if (!values) {
    const seedPath = join(sampleDir, config.seedFile);
    if (!existsSync(seedPath)) return { source: `no ${config.seedFile} and no privateValues — skipped`, valuesChecked: 0, totalHits: 0, distinctLeaked: 0, perValue: {} };
    try {
      const seed = JSON.parse(readFileSync(seedPath, "utf8"));
      const set = new Set();
      collectFieldValues(seed, config.privateFields, set);
      values = [...set].sort();
      source = `seed ${config.seedFile} fields [${config.privateFields.join(", ")}]`;
    } catch (err) {
      return { source: `unreadable ${config.seedFile}: ${err.message}`, valuesChecked: 0, totalHits: 0, distinctLeaked: 0, perValue: {} };
    }
  }
  const counts = new Map(values.map((v) => [v, 0]));
  if (existsSync(outAbs)) {
    for (const rel of walkFiles(outAbs)) {
      const text = readText(join(outAbs, rel));
      if (text === null) continue;
      for (const v of values) counts.set(v, counts.get(v) + countSubstring(text, v));
    }
  }
  const perValue = {};
  let totalHits = 0;
  let distinctLeaked = 0;
  for (const v of [...counts.keys()].sort()) {
    perValue[v] = counts.get(v);
    totalHits += counts.get(v);
    if (counts.get(v) > 0) distinctLeaked++;
  }
  return { source, valuesChecked: values.length, totalHits, distinctLeaked, perValue };
}

/**
 * Client-side URL resolution (folded in from _notes/resolve-r20.mjs): every
 * fetch()/hx-get target in the build output, one-hop variable resolution
 * included, resolved against its page's deployed URL under the base address.
 * The build cannot check these (§11 rewrites only HTML's own URL attributes),
 * so the judge must.
 */
function resolveClientUrls(outAbs, baseUrl) {
  if (!baseUrl) return { base: null, note: "no base URL (none in config, none in the command) — skipped", resolutions: [], dynamicFetches: [] };
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return { base: baseUrl, note: "base URL unparsable — skipped", resolutions: [], dynamicFetches: [] };
  }
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  if (!existsSync(outAbs)) return { base: base.href, note: "no build output directory", resolutions: [], dynamicFetches: [] };

  const hits = [];
  const dynamicByFile = new Map(); // fetch(expr) with a non-literal target — visible, not checkable
  for (const rel of walkFiles(outAbs)) {
    if (!/\.(html|js|mjs)$/.test(rel)) continue;
    const text = readText(join(outAbs, rel));
    if (text === null) continue;
    const callsites = [...text.matchAll(/\bfetch\s*\(/g)].length;
    let extracted = 0;
    for (const m of text.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      if (!m[1].includes("${")) {
        hits.push({ rel, url: m[1] });
        extracted++;
      }
    }
    for (const m of text.matchAll(/fetch\(\s*`\$\{(\w+)\}([^`]*)`/g)) {
      const vm = text.match(new RegExp(`${m[1]}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`));
      hits.push({ rel, url: (vm ? vm[1] : `\${${m[1]}}`) + m[2], via: m[1] });
      extracted++;
    }
    if (callsites > extracted) dynamicByFile.set(rel, callsites - extracted);
    for (const m of text.matchAll(/hx-get\s*=\s*"([^"]+)"/g)) hits.push({ rel, url: m[1] });
    for (const m of text.matchAll(/hx-get\s*=\s*'([^']+)'/g)) hits.push({ rel, url: m[1] });
  }
  const dynamicFetches = [...dynamicByFile.entries()].sort().map(([file, count]) => ({ file, count }));

  const dedup = new Map();
  for (const { rel, url, via } of hits) {
    const pageUrl = new URL(rel.replace(/(^|\/)index\.html$/, "$1"), base);
    let resolved = null;
    try {
      resolved = new URL(url.replace(/\$\{[^}]+\}/g, "SLUG"), pageUrl);
    } catch {
      /* unresolvable */
    }
    let verdict;
    if (!resolved) verdict = "UNRESOLVABLE";
    else if (resolved.origin !== base.origin) verdict = "external origin — not checked";
    else if (!resolved.pathname.startsWith(basePath)) verdict = "404 — ESCAPES THE BASE PATH";
    else {
      const p = resolved.pathname.slice(basePath.length);
      const candidates = [join(outAbs, p), join(outAbs, p, "index.html")];
      const exists = p.includes("SLUG") || candidates.some((c) => existsSync(c));
      verdict = exists ? "ok" : "404 — no such file";
    }
    const key = `${url}\u0000${resolved ? resolved.href : ""}\u0000${verdict}`;
    const entry = dedup.get(key);
    if (entry) {
      entry.count++;
    } else {
      dedup.set(key, {
        url,
        via: via ?? null,
        resolved: resolved ? resolved.href : null,
        verdict,
        from: rel, // first file, in walk order (sorted) — deterministic
        fromIsScript: /\.(js|mjs)$/.test(rel),
        count: 1,
      });
    }
  }
  const resolutions = [...dedup.values()].sort((a, b) =>
    a.url === b.url ? (a.resolved ?? "") < (b.resolved ?? "") ? -1 : 1 : a.url < b.url ? -1 : 1,
  );
  const note = resolutions.length === 0 && dynamicFetches.length === 0 ? "no fetch()/hx-get targets in the output" : null;
  return { base: base.href, note, resolutions, dynamicFetches };
}

/**
 * Primitive sweep over the sample's site SOURCE tree — never the whole
 * sandbox: rules.md quotes `{{ }}` and harness files quote commands, so a
 * sandbox-wide grep convicts every clean sample.
 */
function sweepPrimitives(sampleDir, sourceRoot, outputDir, config) {
  const rootAbs = isAbsolute(sourceRoot) ? sourceRoot : join(sampleDir, sourceRoot);
  if (!existsSync(rootAbs)) return { sourceRoot, note: "source root not found", counts: {} };
  // Harness files live at the top of the sandbox; exclusions apply to the
  // source root's TOP-LEVEL names only (plus dot-entries anywhere), so an
  // authored subdirectory that happens to share a name is never skipped.
  const excludedTop = (name) =>
    name === outputDir ||
    name === config.seedFile ||
    config.sweepExclude.some((pat) => (pat.endsWith("*") ? name.startsWith(pat.slice(0, -1)) : name === pat));
  const files = walkFiles(rootAbs).filter((rel) => {
    const segs = rel.split("/");
    return !segs.some((s) => s.startsWith(".")) && !excludedTop(segs[0]);
  });

  const patterns = Object.entries(config.primitives).sort(([a], [b]) => (a < b ? -1 : 1));
  const counts = {};
  for (const [label] of patterns) counts[label] = { total: 0, files: 0 };
  counts["_layout.html files"] = { total: 0, files: 0 };
  counts["marker"] = { total: 0, files: 0 };
  const markerRe = new RegExp(config.marker, "g");

  for (const rel of files) {
    if (basename(rel) === "_layout.html") {
      counts["_layout.html files"].total++;
      counts["_layout.html files"].files++;
    }
    const text = readText(join(rootAbs, rel));
    if (text === null) continue;
    for (const [label, pattern] of patterns) {
      const isRe = pattern.length > 2 && pattern.startsWith("/") && pattern.endsWith("/");
      const n = isRe ? [...text.matchAll(new RegExp(pattern.slice(1, -1), "g"))].length : countSubstring(text, pattern);
      if (n > 0) {
        counts[label].total += n;
        counts[label].files++;
      }
    }
    const mk = [...text.matchAll(markerRe)].length;
    if (mk > 0) {
      counts["marker"].total += mk;
      counts["marker"].files++;
    }
  }
  return { sourceRoot, filesSwept: files.length, counts };
}

// ------------------------------------------------------------------- output

function judgeSample(roundDir, name, config) {
  const sampleDir = join(roundDir, name);
  const reportPath = join(sampleDir, "REPORT.md");
  const result = { sample: name };

  const reportText = readFileSync(reportPath, "utf8");
  const candidates = extractCandidates(reportText);
  const { chosen, reason } = chooseCandidate(candidates);
  result.candidates = candidates.map((c) => ({
    line: c.line,
    command: c.command,
    complete: c.complete,
    inPublishSection: c.inPublishSection,
    chosen: c === chosen,
  }));
  result.chosenCommand = chosen ? chosen.command : null;
  result.chosenReason = reason;

  if (chosen && chosen.substitution) {
    result.run = { executed: null, exit: null, refused: "command contains $/\\` shell substitution — refusing to execute" };
  } else if (chosen) {
    const run = runBuild(sampleDir, chosen.command, config.timeoutMs);
    const parsed = parseDiagnostics(run.stderr, run.stdout, config.diagnosticLines);
    result.run = {
      executed: run.executed,
      exit: run.exit,
      signal: run.signal,
      error: run.error,
      problems: parsed.problems,
      advisories: parsed.advisories,
      diagnostics: parsed.diagnostics,
      stderrLines: parsed.stderrLines,
      servingFrom: parsed.servingFrom,
      wouldPublish: parsed.wouldPublish,
    };
  } else {
    result.run = { executed: null, exit: null, refused: reason };
  }

  const command = chosen ? chosen.command : "";
  const outputDir = optionValue(command, ["--output", "-o"]) ?? "dist";
  const sourceRoot = optionValue(command, ["--source", "-s"]) ?? (existsSync(join(sampleDir, "src")) ? "src" : ".");
  const baseUrl = config.baseUrl ?? optionValue(command, ["--base-url"]);
  const outAbs = isAbsolute(outputDir) ? outputDir : join(sampleDir, outputDir);

  result.outputDir = outputDir;
  result.markers = { pattern: config.marker, ...countMarkers(outAbs, config.marker) };
  result.privacy = checkPrivacy(sampleDir, outAbs, config);
  result.urls = resolveClientUrls(outAbs, baseUrl);
  result.primitives = sweepPrimitives(sampleDir, sourceRoot, outputDir, config);
  return result;
}

function pad(s, w) {
  s = String(s);
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function printHuman(roundDir, results, config) {
  const p = (s) => process.stdout.write(`${s}\n`);
  p(`judge-round v${VERSION} — ${roundDir}`);
  p(`marker: /${config.marker}/   privacy: exact values only   builds: in place, --dry-run --strict appended`);
  p("");
  const header = ["sample", "exit", "prob", "adv", "markers", "privacy", "urls", "command (as chosen)"];
  const rows = results.map((r) => {
    const urls = r.urls.resolutions;
    const ok = urls.filter((u) => u.verdict === "ok").length;
    const bad = urls.length - ok;
    const dyn = (r.urls.dynamicFetches ?? []).reduce((a, d) => a + d.count, 0);
    let cell = urls.length === 0 ? (dyn > 0 ? "" : "none") : bad === 0 ? `${ok} ok` : `${ok} ok, ${bad} BAD`;
    if (dyn > 0) cell = cell === "" ? `${dyn} dyn` : `${cell}, ${dyn} dyn`;
    return [
      r.sample,
      r.run.exit === null ? "—" : String(r.run.exit),
      r.run.problems ?? "—",
      r.run.advisories ?? "—",
      r.markers.present ? String(r.markers.total) : "no-dist",
      `${r.privacy.totalHits} hit${r.privacy.totalHits === 1 ? "" : "s"}`,
      cell,
      r.chosenCommand ?? `(${r.chosenReason})`,
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  p(header.map((h, i) => pad(h, widths[i])).join("  "));
  for (const row of rows) p(row.map((cell, i) => pad(cell, widths[i])).join("  "));

  for (const r of results) {
    p("");
    p(`-- ${r.sample}`);
    for (const c of r.candidates) {
      p(`   candidate L${c.line}${c.chosen ? " [chosen]" : ""}${c.complete ? "" : " [INCOMPLETE]"}${c.inPublishSection ? " [publish-section]" : ""}: ${c.command}`);
    }
    if (r.candidates.length === 0) p(`   no candidates: ${r.chosenReason}`);
    if (r.run.refused) p(`   NOT RUN: ${r.run.refused}`);
    if (r.run.executed) p(`   ran: ${r.run.executed}`);
    if (r.run.error) p(`   spawn error: ${r.run.error}`);
    if (r.run.signal) p(`   killed by signal ${r.run.signal} (timeout?)`);
    if (r.run.servingFrom) p(`   ${r.run.servingFrom}`);
    if (r.run.wouldPublish) p(`   ${r.run.wouldPublish}`);
    for (const d of r.run.diagnostics ?? []) p(`   | ${d}`);
    if ((r.run.stderrLines ?? 0) > (r.run.diagnostics?.length ?? 0)) p(`   | … ${r.run.stderrLines - r.run.diagnostics.length} more stderr lines`);
    p(`   markers in ${r.outputDir}/: ${r.markers.present ? `${r.markers.total} across ${r.markers.files} files` : "no output directory"}`);
    p(`   privacy (${r.privacy.source}): ${r.privacy.totalHits} hits, ${r.privacy.distinctLeaked}/${r.privacy.valuesChecked} values leaked`);
    for (const [v, n] of Object.entries(r.privacy.perValue)) if (n > 0) p(`     ${v}: ${n}`);
    if (r.urls.note) p(`   urls: ${r.urls.note}`);
    else p(`   urls (base ${r.urls.base}):`);
    for (const u of r.urls.resolutions) {
      p(`     ${JSON.stringify(u.url)}${u.via ? ` (via ${u.via})` : ""} from ${u.from}${u.count > 1 ? ` (+${u.count - 1} more)` : ""}`);
      p(`       -> ${u.resolved ?? "—"}  ${u.verdict}${u.fromIsScript ? "  [in an external script: relative fetches actually resolve against each including page]" : ""}`);
    }
    for (const d of r.urls.dynamicFetches ?? []) {
      p(`     fetch(non-literal) ×${d.count} in ${d.file} — target computed at runtime (e.g. link.href); read the file before concluding anything`);
    }
    const prim = r.primitives.counts ?? {};
    const primStr = Object.entries(prim)
      .map(([k, v]) => `${k}=${v.total}`)
      .join("  ");
    p(`   primitives in ${r.primitives.sourceRoot}/ (${r.primitives.filesSwept ?? 0} files): ${primStr || r.primitives.note}`);
  }
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  let failures = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    process.stdout.write(`${ok ? "ok" : "FAIL"}  ${name}\n`);
    if (!ok) {
      process.stdout.write(`      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}\n`);
      failures++;
    }
  };

  // 1. The quoted-URL truncation (round 20 haiku-2 / round 19 haiku-5 shape).
  const quoted = extractCandidates('**Exact command line:**\n```bash\n./unify build --base-url "https://fernhollow.pages.dev/library/" --pretty-urls\n```\n');
  check("quoted --base-url survives whole", quoted[0]?.command, './unify build --base-url "https://fernhollow.pages.dev/library/" --pretty-urls');

  // 2. The backslash line-continuation split (round 20 sonnet-1 shape).
  const cont = extractCandidates("## 2. Publish command and verification\n\n```\n./unify build --source src --output dist --pretty-urls \\\n  --base-url https://fernhollow.pages.dev/library/ --clean\n```\n");
  check("continuation joins into one command", cont[0]?.command, "./unify build --source src --output dist --pretty-urls    --base-url https://fernhollow.pages.dev/library/ --clean");
  check("continuation candidate marked publish-section", cont[0]?.inPublishSection, true);

  // 3. Single-quoted glob argument (round 19 haiku-2 shape).
  const glob = extractCandidates("```\n./unify build --base-url https://x.example/a/ --pretty-urls --exclude '_*'\n```\n");
  check("single-quoted glob survives", glob[0]?.command, "./unify build --base-url https://x.example/a/ --pretty-urls --exclude '_*'");

  // 4. A && prefix is cut at the operator, never executed with the build.
  const chained = extractCandidates("```\nnode _scripts/gen.mjs && ./unify build --pretty-urls && echo done\n```\n");
  check("&&-chain yields only the unify command", chained[0]?.command, "./unify build --pretty-urls");

  // 5. Inline code in prose is not a candidate (the rules-doc quote trap).
  const prose = extractCandidates("The rules say `node _scripts/gen.mjs && unify build` here.\n");
  check("inline code ignored", prose.length, 0);

  // 6. Publish-section preference beats a longer stray command elsewhere.
  const two = extractCandidates(
    "```\n./unify build --pretty-urls --base-url https://x.example/a/ --clean --exclude drafts\n```\n\n**Exact publish command:**\n```\n./unify build --pretty-urls --base-url https://x.example/a/\n```\n",
  );
  check("publish-section candidate wins", chooseCandidate(two).chosen?.command, "./unify build --pretty-urls --base-url https://x.example/a/");

  // 7. Option-value parsing, quoted and =-joined.
  check("optionValue -o", optionValue("./unify build -o out --strict", ["--output", "-o"]), "out");
  check('optionValue --base-url quoted', optionValue('./unify build --base-url "https://x.example/a/"', ["--base-url"]), "https://x.example/a/");
  check("optionValue --output=x", optionValue("./unify build --output=public", ["--output", "-o"]), "public");

  process.stdout.write(failures === 0 ? "self-test: all passed\n" : `self-test: ${failures} FAILED\n`);
  return failures === 0 ? 0 : 1;
}

// -------------------------------------------------------------------- main

function main(argv) {
  if (argv[0] === "--self-test") return selfTest();
  const roundArg = argv.find((a) => !a.startsWith("--"));
  if (!roundArg) {
    process.stderr.write("usage: judge-round.mjs <round-dir> [--config judge.json] | --self-test\n");
    return 2;
  }
  const roundDir = resolve(roundArg);
  if (!existsSync(roundDir) || !statSync(roundDir).isDirectory()) {
    process.stderr.write(`not a directory: ${roundDir}\n`);
    return 2;
  }

  const config = { ...DEFAULTS };
  const ci = argv.indexOf("--config");
  if (ci !== -1) {
    const path = argv[ci + 1];
    if (!path || !existsSync(path)) {
      process.stderr.write(`--config: file not found: ${path}\n`);
      return 2;
    }
    Object.assign(config, JSON.parse(readFileSync(path, "utf8")));
  }
  try {
    new RegExp(config.marker);
  } catch (err) {
    process.stderr.write(`config.marker is not a valid regex: ${err.message}\n`);
    return 2;
  }

  const samples = readdirSync(roundDir)
    .filter((name) => {
      const dir = join(roundDir, name);
      try {
        return !name.startsWith(".") && statSync(dir).isDirectory() && existsSync(join(dir, "REPORT.md"));
      } catch {
        return false;
      }
    })
    .sort();
  if (samples.length === 0) {
    process.stderr.write(`no sample directories with a REPORT.md under ${roundDir}\n`);
    return 2;
  }

  const results = samples.map((name) => judgeSample(roundDir, name, config));
  printHuman(roundDir, results, config);

  const json = {
    tool: "judge-round.mjs",
    version: VERSION,
    roundDir,
    config: {
      marker: config.marker,
      privateValues: config.privateValues ? `${config.privateValues.length} configured values` : `derived per sample from ${config.seedFile} fields [${config.privateFields.join(", ")}]`,
      baseUrl: config.baseUrl ?? "per-sample, from the chosen command's --base-url",
      diagnosticLines: config.diagnosticLines,
      primitives: config.primitives,
    },
    samples: results,
  };
  const jsonPath = join(roundDir, "judge-results.json");
  writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(`\nresults written: ${jsonPath}\n`);

  const unjudged = results.filter((r) => r.run.exit === null);
  if (unjudged.length > 0) {
    process.stdout.write(`WARNING: ${unjudged.length} sample(s) could not be judged: ${unjudged.map((r) => r.sample).join(", ")}\n`);
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
