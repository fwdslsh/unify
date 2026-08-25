/**
 * report.js — conformance-spec §31.1 (`--format json`), §31.2 (the
 * fingerprint), §31.4 (`--format sarif`).
 *
 * Nothing here decides anything: every value is read from a §20 record or a
 * §24 `Finding` that already exists. Product-spec §6.5.3's own condition on
 * this file is that a serializer is a MECHANICAL VIEW of what `audit` already
 * found, never a second analysis path — so if a future change needs this
 * module to compute something no other format already carries, that is the
 * signal the change belongs in audit.js instead, not here.
 */
import { createHash } from "node:crypto";
import pkg from "../../package.json" with { type: "json" };

export const SCHEMA_VERSION = 1;

/**
 * §31.2 — the ONE datum that distinguishes a finding from its siblings on the
 * same page, kept in one place because getting it wrong is silent in two
 * opposite directions: too coarse and two distinct faults share a
 * fingerprint (a CI suppression hides a real regression that lands on top of
 * a suppressed one); too fine — anything that shifts across an unrelated
 * edit, like a line number or an array index — and one fault's fingerprint
 * changes across runs (a suppression that should still match doesn't).
 *
 * The value itself is captured where the fault is FOUND — audit.js's `add()`
 * calls pass it as `distinguisher` — because only the predicate that raised a
 * finding knows which of a page's several possible faults of that id this
 * one is. (Named `distinguisher`, not `subject`, so it cannot be misread as
 * "the JSON-LD subject object" — an unrelated, pre-existing term this very
 * file's neighbour, audit.js, already uses for something else.) This table
 * is the map from finding id to WHICH value that is, for every id in
 * §24.4/§26.3's catalogue plus this section's own `external-unreachable`;
 * `report.js`'s `fingerprint()` below just reads `finding.distinguisher` —
 * the map lives here, as prose, so the two can be read side by side and
 * audited against each other.
 *
 * `""` — §31.2's own stated default — is the distinguisher for every id that
 * occurs at MOST ONCE per page, because there is nothing on that page to set
 * it apart from. Every id below with a non-"" entry is one `auditManifest`
 * can raise more than once for a single `file`:
 *
 *   id-duplicate            the repeated id itself (§31.2 names this one)
 *   metadata-conflict       the field name (§31.2 names this one too)
 *   jsonld-url-unprefixed   the unprefixed value (§31.2's third example)
 *   fragment-missing        `${target}#${id}` — the pair the link named,
 *                           since two distinct missing fragments on one page
 *                           are two distinct faults
 *   metadata-in-body        `${tag}:${key}` — which stray element this is
 *   jsonld-invalid          the block's own `raw` text — an array INDEX was
 *                           rejected here: inserting a new block above an
 *                           existing invalid one would shift its index and
 *                           silently retire a suppression that named a fault
 *                           which had not changed at all, which is exactly
 *                           the failure §31.2 exists to prevent. `raw` is the
 *                           author's own bytes and does not move.
 *   jsonld-headline-mismatch the block's `headline` value
 *   jsonld-url-mismatch     the block's `url` value
 *   jsonld-lang-mismatch    the block's `inLanguage` value
 *   jsonld-entity-conflict  the shared `@id` (mirrors §24.4's own "one finding
 *                           per @id")
 *   date-unusable           the field name, `datePublished` or `dateModified`
 *                           (mirrors §24.4's own "one finding per field")
 *   robots-sitemap-missing  the exempted `Sitemap:` value — not page-scoped
 *                           at all (`file` is the source `robots.txt`), so
 *                           more than one exempted line in one file needs the
 *                           same separation
 *   external-unreachable    the off-origin URL itself (§31.3 names this one:
 *                           "one finding per distinct URL")
 *
 * Every other id in the catalogue fires at most once per page by
 * construction (a single `if`/one call to `add` per record, never inside a
 * loop over something page-local that could repeat), so `""` is correct and
 * complete for them — there is no sibling on the same page to distinguish
 * from, which is the condition §31.2 states for the default.
 *
 * This block is documentation, not code: `fingerprint()` below just reads
 * `finding.distinguisher`, uniformly, for every id. Keeping the mapping as a
 * second runtime table (an id → distinguisher-getter registry) here would
 * let this file and audit.js's `add()` calls disagree about a rule that has
 * exactly one legitimate location — where the finding is raised, because
 * only that predicate knows what actually varies. A registry here would be
 * the "second reading" product-spec §6.1 forbids, one level down from a page.
 */

/**
 * Join fields for hashing with no separator-collision possible, regardless of
 * what any of them contain: each part is length-prefixed (`"<byte length in
 * UTF-8>:<bytes>"`, the netstring/Bencode-string convention), so the joined
 * string can be split back into exactly its parts by no other means than the
 * lengths that are already IN it — no choice of separator character has to be
 * proven absent from `id`/`file`/`distinguisher`, which is a strictly stronger
 * guarantee than "a separator that cannot occur in any of them" and needs no
 * assumption about what an author's own text (a URL, an `@id`, a field value)
 * might contain.
 * @param {string[]} parts
 * @returns {string}
 */
function canonicalJoin(parts) {
  return parts.map((p) => `${Buffer.byteLength(p, "utf8")}:${p}`).join("");
}

/**
 * §31.2 — a stable hex digest over `id` + source `file` + the one
 * distinguishing datum (`finding.distinguisher` — see the doc comment
 * above), and NOTHING else:
 * deliberately excluding line numbers, evidence text, and fix text, because
 * every one of those three can change while the fault they describe has not
 * — a diagnostic's line shifts when an unrelated edit lands above it (§14.1
 * says so explicitly), and evidence/fix are prose that may be reworded for
 * clarity at any time (§14.1 again: "the message after them is prose and is
 * not [contract]"). A fingerprint that hashed any of the three would silently
 * retire a CI suppression on the day a message improved, which defeats the
 * one thing a fingerprint is for: letting a CI system say "this is the same
 * finding I saw last week."
 * @param {import('./audit.js').Finding} finding
 * @returns {string} 64 lowercase hex characters (sha256)
 */
export function fingerprint(finding) {
  const distinguisher = finding.distinguisher ?? "";
  const joined = canonicalJoin([finding.id, finding.file, distinguisher]);
  return createHash("sha256").update(joined, "utf8").digest("hex");
}

/**
 * §31.1/§22 of the release brief — one `BuildDocument` reduced to the audit
 * JSON page shape, explicit key order: `source`, `generated`, `outputPath`,
 * `document` (the `DocumentSnapshot` whole — `path`, `url`, `html`, `head`,
 * `body`, in `document.js`'s own key order). `layout` provenance is
 * deliberately NOT in this object — it stays internal to audit's own fix
 * lines — and the private `analysis` half (visible text, ids, JSON-LD, link
 * graph…) is never serialized: findings already carry the diagnostic facts
 * external automation normally needs (§22's own words), and this is a build
 * artifact's page shape, not a mirror of the envelope.
 * @param {import('./manifest.js').BuildDocument} doc
 */
function serializePage(doc) {
  return {
    source: doc.source.path,
    generated: doc.source.generated === true,
    outputPath: doc.outputPath,
    document: doc.document,
  };
}

/**
 * The finding fields §31.1's document publishes — `distinguisher` is
 * deliberately excluded: it exists only to compute `fingerprint` above and is
 * not part of the documented JSON shape (contrast the spec's own worked
 * example, which lists exactly these seven keys plus `fingerprint`).
 * @param {import('./audit.js').Finding} f
 */
function serializeFinding(f) {
  return {
    id: f.id,
    severity: f.severity,
    file: f.file,
    // §33.4 — a machine consumer rendering its own report needs the same
    // fact the human report shows, and `file` must stay a plain path for
    // the consumers that resolve it. So it travels as its own key.
    generated: f.generated === true,
    outputPath: f.outputPath,
    url: f.url,
    evidence: f.evidence,
    fix: f.fix,
    fingerprint: fingerprint(f),
  };
}

/**
 * §31.1 — the document `--format json`/`--format sarif` both serialize.
 *
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents - §20's
 *   manifest, in manifest order; each envelope reduced to §31.1's audit page
 *   shape (`serializePage`, below) — `source`/`generated`/`outputPath` plus
 *   the `DocumentSnapshot` whole; the private `analysis` half is never
 *   serialized (§22 of the release brief)
 * @param {import('./audit.js').Finding[]} args.findings - §24.5's order
 *   (source path, then finding id); `auditManifest`'s own return already
 *   holds this order, and merging in `external-unreachable` findings must
 *   re-sort with the SAME comparator (`sortFindings`, exported by audit.js)
 *   rather than a second one that could disagree about ties
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {number} args.problemCount - §14 problems, deduplicated
 *   (`reporter.problemCount`) — diagnostics stay on stderr as prose (§31.1);
 *   this is only the count a JSON consumer needs to know they happened
 * @param {number} args.advisoryCount - §14 advisories, deduplicated
 * @returns {object}
 */
export function buildReport({ documents, findings, base, problemCount, advisoryCount }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    baseUrl: base ? `${base.origin}${base.pathPrefix}` : null,
    summary: {
      broken: findings.filter((f) => f.severity === "broken").length,
      incomplete: findings.filter((f) => f.severity === "incomplete").length,
      problems: problemCount,
      advisories: advisoryCount,
    },
    pages: documents.map(serializePage),
    findings: findings.map(serializeFinding),
  };
}

/**
 * §31.1 — `--format json`. Two-space indentation with a trailing newline,
 * the same fixed convention every other generated document uses
 * (sitemap.xml, catalog.json, search-corpus.json), so two builds of one tree
 * are byte-identical and so is one build run twice.
 * @param {object} report - `buildReport`'s return value
 * @returns {string}
 */
export function serializeJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** SARIF 2.1.0's two severities; product-spec §6.5.3 permits no third. */
const SARIF_LEVEL = { broken: "error", incomplete: "warning" };

/**
 * §31.4 — `--format sarif`: SARIF 2.1.0, mapped field for field from the
 * SAME finding list `serializeJson` already produced (`report.findings`,
 * i.e. `serializeFinding`'s output — this function reads no `Finding`
 * directly and computes no new value from one). The five mappings §31.4
 * names: `id`→`ruleId`, `file`→the artifact location, `evidence`→the
 * message, `fingerprint`→`partialFingerprints`, `severity`→`level`. Three
 * more of `serializeFinding`'s own fields carry over into SARIF's
 * extensibility points rather than being dropped: `fix` into `fixes`
 * (SARIF's own field for one concrete remedial action — not a new fact, the
 * same string `--format json` already carries under a different key) and
 * `outputPath`/`url` into `properties` (SARIF's documented free-form bag).
 * Nothing here is a derivation `--format json` does not already carry.
 *
 * `report.pages`, `report.summary`, and `report.baseUrl` have no SARIF home
 * and are not represented: SARIF is a log of results the way this section
 * defines it — "the same finding LIST" — not a mirror of the whole document.
 * @param {object} report - `buildReport`'s return value
 * @returns {string}
 */
export function serializeSarif(report) {
  const ruleIds = [...new Set(report.findings.map((f) => f.id))].sort();
  const doc = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "unify",
            informationUri: pkg.homepage,
            version: pkg.version,
            // id only — a rule's shortDescription/fullDescription would be
            // authored prose this module has no source for without inventing
            // one, which is exactly the "second analysis path" §31.4 forbids.
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.id,
          level: SARIF_LEVEL[f.severity],
          message: { text: f.evidence },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file } } }],
          partialFingerprints: { "unify/v1": f.fingerprint },
          // NOT a SARIF `fixes` array. SARIF 2.1.0 makes `artifactChanges`
          // REQUIRED on every fix object, and unify has no artifact change to
          // put there — its fix is a sentence, not a patch — so every emitted
          // document was rejected by every validator, including the code
          // scanning ingests this format exists for. §31.4 names five
          // mappings and `fix` is not among them; carrying it in
          // `properties` keeps the string without claiming a shape the
          // document cannot honour, which is what "a mechanical view of the
          // same findings" is supposed to mean.
          properties: { outputPath: f.outputPath, url: f.url, fix: f.fix },
        })),
      },
    ],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
