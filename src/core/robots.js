/**
 * `robots.js` — conformance-spec §23, robots consistency.
 *
 * The short module, and deliberately so. unify never writes a `robots.txt`,
 * never rewrites one, and never decides what a site should block — product-spec
 * §6.3.3 is explicit about the last. What is left is exactly one obligation:
 * a `Sitemap:` line is a promise that a crawler can fetch that URL, and a
 * promise the site itself breaks is a fault unify can see without judging
 * anything.
 *
 * Everything else an eager implementation would check is defined to be inert:
 *
 *   - `Disallow: /admin/` on a site with no `/admin/` is ordinary and
 *     defensive. Blocking a path that does not exist yet is what an author
 *     should do, and reporting it would be inventing the policy §6.3.3 forbids.
 *   - A malformed line and an unknown field are *required* to be ignored by
 *     RFC 9309 §2.2.1, so failing a publish over one would contradict the
 *     standard this check exists to serve.
 *   - A missing `Sitemap:` line is the author's choice, even when unify
 *     generated a sitemap. Requiring it would be deciding policy in the other
 *     direction.
 *
 * Each of those is reportable by the evaluation command, which is where a
 * judgement belongs (§23.4).
 */

import { CHECK_SPELLING } from "./diagnostics.js";
import { resolveReference, stripBaseUrl } from "./references.js";
import { isSkippedUrl } from "./urls.js";

/** The one path the Robots Exclusion Protocol gives meaning to (§23.1). */
export const ROBOTS_PATH = "robots.txt";

/** The output paths §21 generates, when it is asked to (§21.4 splits at the caps). */
const GENERATED_SITEMAP = /^sitemap(-\d+)?\.xml$/;

/**
 * §23.2 — read RFC 9309 records out of a `robots.txt`.
 *
 * A line is a comment, blank, or `field: value`; field names are
 * case-insensitive. Anything else is returned as-is with a null field, because
 * §23.4 needs the caller to be able to see an unparseable line without that
 * fact meaning anything.
 * @param {string} text
 * @returns {{field: string|null, value: string, line: number}[]}
 */
function parseRobots(text) {
  return text.split(/\r\n|[\r\n]/).map((raw, i) => {
    const line = i + 1;
    const withoutComment = raw.replace(/#.*$/, "").trim();
    if (withoutComment === "") return { field: null, value: "", line };
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(withoutComment);
    if (!m) return { field: null, value: withoutComment, line };
    return { field: m[1].toLowerCase(), value: m[2].trim(), line };
  });
}

/**
 * §23.3 — every `Sitemap:` value that names a location this site emits must
 * resolve to a file it emits.
 *
 * "Names a location this site emits" is §12's own test, reused rather than
 * re-derived: strip the `--base-url` prefix when there is one, and a value left
 * root-relative or relative is internal. A value on another origin is skipped,
 * because verifying it needs the network and network access is an explicit
 * audit operation. `base` may be null — a root-relative value is internal by
 * inspection, and §23.1 says why this section is not gated on the flag.
 *
 * THE DIAGNOSTIC QUOTES THE AUTHOR'S OWN LINE. §14.1 defines `in:` as the
 * offending *source text*, and §12 satisfies that by printing the stripped
 * value because §11.3 rewrote the author's root-relative URL into the
 * absolutized one — there, stripped IS what the author typed. §23.1 guarantees
 * the opposite for this file: not one byte of it is rewritten, so the stripped
 * form is a string that appears nowhere the author can grep, handed to them
 * under "check the path spelling". Resolution still runs on the stripped value;
 * only the report shows the authored one.
 *
 * @param {object} args
 * @param {string} args.text - the emitted robots.txt
 * @param {string} args.file - the source path to attribute a problem to
 * @param {Set<string>} args.emittedPaths
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {import('./diagnostics.js').Reporter} args.reporter
 */
export function checkRobots({ text, file, emittedPaths, base, reporter }) {
  for (const record of parseRobots(text)) {
    if (record.field !== "sitemap" || record.value === "") continue;
    const stripped = base ? stripBaseUrl(record.value, base) : record.value;
    if (isSkippedUrl(stripped)) continue; // another origin — not checkable offline
    const resolved = resolveReference(stripped, ROBOTS_PATH);
    if (resolved === null || emittedPaths.has(resolved)) continue;
    // §21.1 generates a sitemap only when --base-url supplied the site's
    // address, so without it `Sitemap: /sitemap.xml` names a file this build
    // was not asked to produce. That is not a broken reference — the author's
    // line is right for the deployed site, and nothing they wrote changed —
    // and blocking on it broke `unify build` and `unify dev` for a correct
    // site, under a fix line pointing at a spelling that was already right.
    // §21.1's own compatibility principle, applied in the other direction.
    if (base === null && GENERATED_SITEMAP.test(resolved)) continue;
    reporter.problem({
      file,
      line: record.line,
      message: `${record.value} does not resolve to any emitted file`,
      context: record.value,
      fixes: [CHECK_SPELLING],
    });
  }
}
