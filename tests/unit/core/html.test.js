/**
 * Unit tests for src/core/html.js (Tier 3 — developer scaffolding, no
 * conformance authority; testing-strategy §2). These exist to pin the
 * tokenizer's offset bookkeeping directly, at a grain the fixture-driven
 * conformance harness (tests/conformance/**) never inspects (it only ever
 * sees final output text, never intermediate node offsets).
 */
import { describe, expect, test } from "bun:test";
import {
  applyEdits, contentSpan, findAll, findFirst, getAttr, hasAttr, innerText,
  isBlank, isElement, isInside, lineOf, parse, rawSpan, removeAttrEdit,
  spanWithAttrRemoved, tokens,
} from "../../../src/core/html.js";

describe("parse: doctype", () => {
  test("captured separately from the tree, not as a node", () => {
    const { doctype, root } = parse("<!doctype html>\n<html></html>");
    expect(doctype.raw).toBe("<!doctype html>");
    expect(doctype.start).toBe(0);
    expect(doctype.end).toBe(15);
    expect(root.children.some((c) => c.type === "bogus")).toBe(false);
  });

  test("absent when there is none", () => {
    const { doctype } = parse("<p>hi</p>");
    expect(doctype).toBeNull();
  });
});

describe("parse: elements and offsets", () => {
  test("simple element start/end/openTagEnd/content span", () => {
    const text = "<p>hi</p>";
    const { root } = parse(text);
    const p = root.children[0];
    expect(p.type).toBe("element");
    expect(p.tag).toBe("p");
    expect(p.start).toBe(0);
    expect(p.openTagEnd).toBe(3);
    expect(p.endTagStart).toBe(5);
    expect(p.endTagEnd).toBe(9);
    expect(p.end).toBe(9);
    expect(rawSpan(text, p)).toBe("<p>hi</p>");
    expect(contentSpan(p)).toEqual([3, 5]);
    expect(innerText(text, p)).toBe("hi");
  });

  test("void element has no end tag and no content span", () => {
    const text = '<img src="x.png">';
    const { root } = parse(text);
    const img = root.children[0];
    expect(img.void).toBe(true);
    expect(img.endTagStart).toBeNull();
    expect(img.end).toBe(text.length);
    expect(contentSpan(img)).toEqual([img.openTagEnd, img.openTagEnd]);
  });

  test("self-closing non-void element (the stated <div/> deviation)", () => {
    const { root } = parse("<div/><p>after</p>");
    const div = root.children[0];
    expect(div.selfClosing).toBe(true);
    expect(div.children.length).toBe(0);
    const p = root.children[1];
    expect(p.tag).toBe("p");
  });

  test("nested elements and parent links", () => {
    const text = "<div><span>x</span></div>";
    const { root } = parse(text);
    const div = root.children[0];
    const span = div.children[0];
    expect(span.tag).toBe("span");
    expect(span.parent).toBe(div);
    expect(div.parent.type).toBe("root");
  });

  test("mismatched end tag closes intermediates too, deterministically", () => {
    // <div><span>text</div> — </div> closes span (no end tag) then div.
    const text = "<div><span>text</div>";
    const { root } = parse(text);
    const div = root.children[0];
    expect(div.tag).toBe("div");
    expect(div.endTagStart).toBe(15);
    const span = div.children[0];
    expect(span.tag).toBe("span");
    expect(span.endTagStart).toBeNull();
    expect(span.end).toBe(15); // ends where the outer </div> was found
  });

  test("stray end tag with no matching open element", () => {
    const { root } = parse("<p>hi</span></p>");
    const p = root.children[0];
    const stray = p.children.find((c) => c.type === "stray-endtag");
    expect(stray).toBeDefined();
    expect(stray.tag).toBe("span");
  });

  test("unclosed element at EOF gets end = text.length", () => {
    const text = "<div><p>open";
    const { root } = parse(text);
    const div = root.children[0];
    expect(div.end).toBe(text.length);
  });

  test("raw-text elements (title/script/style/textarea) are not tokenized inside", () => {
    const text = "<title>a &lt; b</title>";
    const { root } = parse(text);
    const title = root.children[0];
    expect(title.children.length).toBe(1);
    expect(title.children[0].type).toBe("text");
    expect(title.children[0].data).toBe("a &lt; b"); // no entity decoding
  });

  test("raw-text element content is captured verbatim even with embedded '<'", () => {
    const text = "<script>if (a < b) { x() }</script>";
    const { root } = parse(text);
    const script = root.children[0];
    expect(script.children[0].data).toBe("if (a < b) { x() }");
  });

  test("comments preserved verbatim, not treated as markup", () => {
    const text = "<!-- a <div> comment --><p>x</p>";
    const { root } = parse(text);
    expect(root.children[0].type).toBe("comment");
    expect(root.children[0].data).toBe(" a <div> comment ");
  });
});

describe("parse: attributes", () => {
  test("quoted, bare, and empty values are distinct", () => {
    const { root } = parse('<input a="1" b c="">');
    const el = root.children[0];
    expect(getAttr(el, "a")).toBe("1");
    expect(getAttr(el, "b")).toBeNull(); // bare: present, no value
    expect(hasAttr(el, "b")).toBe(true);
    expect(getAttr(el, "c")).toBe(""); // explicit empty string
    expect(getAttr(el, "nope")).toBeNull(); // absent
  });

  test("attribute name lookup is case-insensitive", () => {
    const { root } = parse('<div DATA-Layout="none">');
    expect(getAttr(root.children[0], "data-layout")).toBe("none");
  });

  test("single-quoted and unquoted values", () => {
    const { root } = parse("<div a='x' b=y>");
    const el = root.children[0];
    expect(getAttr(el, "a")).toBe("x");
    expect(getAttr(el, "b")).toBe("y");
  });

  test("attribute spans are contiguous (no gaps, no overlaps)", () => {
    const text = '<p id="x" class="y" slot="z">body</p>';
    const { root } = parse(text);
    const el = root.children[0];
    expect(el.attrs.length).toBe(3);
    expect(el.attrs[0].start).toBe(2); // right after "<p"
    for (let i = 1; i < el.attrs.length; i++) {
      expect(el.attrs[i].start).toBe(el.attrs[i - 1].end);
    }
    expect(el.attrs[el.attrs.length - 1].end).toBe(el.attrsEnd);
  });

  test("removeAttrEdit cleanly removes one attribute, leaves the rest exact", () => {
    const text = '<p id="x" slot="footer" class="y">body</p>';
    const { root } = parse(text);
    const el = root.children[0];
    const edit = removeAttrEdit(el, "slot");
    const result = applyEdits(text, [edit]);
    expect(result).toBe('<p id="x" class="y">body</p>');
    const reparsed = parse(result).root.children[0];
    expect(hasAttr(reparsed, "slot")).toBe(false);
    expect(getAttr(reparsed, "id")).toBe("x");
    expect(getAttr(reparsed, "class")).toBe("y");
  });

  test("removeAttrEdit returns null when the attribute is absent", () => {
    const { root } = parse("<p>x</p>");
    expect(removeAttrEdit(root.children[0], "slot")).toBeNull();
  });

  test("spanWithAttrRemoved excises just the attribute, keeps children as written", () => {
    const text = '<em slot="x">the fill</em>';
    const { root } = parse(text);
    expect(spanWithAttrRemoved(text, root.children[0], "slot")).toBe("<em>the fill</em>");
  });

  test("spanWithAttrRemoved is a no-op raw span when the attribute is absent", () => {
    const text = "<em>plain</em>";
    const { root } = parse(text);
    expect(spanWithAttrRemoved(text, root.children[0], "slot")).toBe(text);
  });
});

describe("tokens / isBlank", () => {
  test("tokens splits on whitespace and drops empties", () => {
    expect(tokens("  a  b\tc ")).toEqual(["a", "b", "c"]);
    expect(tokens(null)).toEqual([]);
    expect(tokens("")).toEqual([]);
  });

  test("isBlank", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   \n\t")).toBe(true);
    expect(isBlank(" x ")).toBe(false);
  });
});

describe("walk / findAll / findFirst / isInside", () => {
  const text = `<body>
    <main><slot></slot></main>
    <template><slot name="x"></slot></template>
    <slot name="y"></slot>
  </body>`;

  test("findAll finds slots but does not descend into <template>", () => {
    const { root } = parse(text);
    const body = root.children[0];
    const slots = findAll(body, (n) => isElement(n, "slot"));
    expect(slots.length).toBe(2); // the bare one in <main>, and name="y" — NOT the one in <template>
    expect(slots.map((s) => getAttr(s, "name"))).toEqual([null, "y"]);
  });

  test("findFirst locates the first <main>", () => {
    const { root } = parse(text);
    const body = root.children[0];
    const main = findFirst(body, (n) => isElement(n, "main"));
    expect(main).not.toBeNull();
  });

  test("isInside detects template ancestry", () => {
    const { root } = parse(text);
    const body = root.children[0];
    const allSlotsIncludingTemplate = [];
    // manual walk (bypassing findAll's template skip) to fetch the inner one
    const template = findFirst(body, (n) => isElement(n, "template"));
    const innerSlot = template.children.find((n) => isElement(n, "slot"));
    expect(isInside(innerSlot, "template")).toBe(true);
    const outerSlot = findFirst(body, (n) => isElement(n, "slot"));
    expect(isInside(outerSlot, "template")).toBe(false);
  });
});

describe("lineOf", () => {
  test("1-based, counts newlines before index", () => {
    const text = "a\nb\nc";
    expect(lineOf(text, 0)).toBe(1);
    expect(lineOf(text, 2)).toBe(2);
    expect(lineOf(text, 4)).toBe(3);
  });
});

describe("applyEdits", () => {
  test("no edits returns the original text", () => {
    expect(applyEdits("abc", [])).toBe("abc");
  });

  test("multiple non-overlapping edits, order-independent input", () => {
    const text = "0123456789";
    const result = applyEdits(text, [
      { start: 6, end: 8, replacement: "X" },
      { start: 2, end: 4, replacement: "Y" },
    ]);
    expect(result).toBe("01Y45X89");
  });

  test("replacement text containing $-patterns survives byte-for-byte", () => {
    const text = "<em>Sale: $1 &amp; $&</em>";
    const result = applyEdits(text, [{ start: 0, end: 0, replacement: "" }]);
    expect(result).toBe(text);
    // Simulate a splice whose replacement itself contains $&, $1, $$, etc.
    const spliced = applyEdits("BEFORE[X]AFTER", [
      { start: 6, end: 9, replacement: "Sale: $1 &amp; $& $$ $' $`" },
    ]);
    expect(spliced).toBe("BEFORESale: $1 &amp; $& $$ $' $`AFTER");
  });

  test("throws on overlapping edits rather than silently corrupting", () => {
    expect(() => applyEdits("abcdef", [
      { start: 0, end: 3, replacement: "X" },
      { start: 2, end: 4, replacement: "Y" },
    ])).toThrow();
  });
});
