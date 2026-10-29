import { SaxesParser } from "saxes";

const ATOM = "http://www.w3.org/2005/Atom";
const XML = "http://www.w3.org/XML/1998/namespace";

function parseFeed(xml) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let root;
  parser.on("opentag", (tag) => {
    const node = { ...tag, children: [], text: "", parent: stack.at(-1) };
    if (node.parent) node.parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  const text = (value) => { if (stack.length) stack.at(-1).text += value; };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => stack.pop());
  parser.write(xml).close(); // malformed XML throws; no external resources are loaded
  return root;
}

const children = (node, name) => node.children.filter((n) => n.uri === ATOM && n.local === name);
const textOf = (node) => node.text + node.children.map(textOf).join("");
const attribute = (node, name, uri = "") => Object.values(node.attributes).find((a) => a.local === name && a.uri === uri)?.value;

/** A full timestamp with seconds and an explicit zone, not a day-only date. */
function timestamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi, s, , oh = "0", om = "0"] = m;
  const year = Number(y);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= days[Number(mo) - 1]
    && Number(h) < 24 && Number(mi) < 60 && Number(s) < 60 && Number(oh) < 24 && Number(om) < 60;
}

function baseOf(node, fallback) {
  const base = node.parent ? baseOf(node.parent, fallback) : fallback;
  const declared = attribute(node, "base", XML);
  return declared === undefined ? base : new URL(declared, base).href;
}

/** Check the entry facts promised by the publishing brief, independently of unify. */
export function checkAtomFeed(xml, { minEntries, baseUrl }) {
  let feed;
  try { feed = parseFeed(xml); }
  catch (e) { return { pass: false, detail: `invalid feed XML: ${e.message}` }; }
  if (feed?.local !== "feed" || feed.uri !== ATOM) return { pass: false, detail: "no Atom feed root" };
  const entries = children(feed, "entry");
  const bad = [];
  entries.forEach((entry, i) => {
    const updated = children(entry, "updated");
    if (updated.length !== 1 || !timestamp(textOf(updated[0]).trim())) bad.push(`entry ${i + 1}: missing or invalid updated timestamp`);
    const titles = children(entry, "title");
    if (titles.length !== 1 || !textOf(titles[0]).trim()) bad.push(`entry ${i + 1}: missing or empty title`);
    const linked = children(entry, "link").some((link) => {
      const rel = attribute(link, "rel") ?? "alternate";
      const href = attribute(link, "href");
      if (rel !== "alternate" || !href?.trim()) return false;
      try {
        const url = new URL(href, baseOf(link, baseUrl && new URL("feed.xml", baseUrl).href));
        return ["http:", "https:"].includes(url.protocol);
      } catch { return false; }
    });
    if (!linked) bad.push(`entry ${i + 1}: no usable alternate link`);
  });
  return {
    pass: entries.length >= minEntries && bad.length === 0,
    detail: `${entries.length} entries (needs ${minEntries})${bad.length ? `; ${bad.slice(0, 4).join("; ")}${bad.length > 4 ? `; … ${bad.length - 4} more` : ""}` : ", each with a timestamp, title and link"}`,
  };
}
