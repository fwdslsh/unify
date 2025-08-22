/**
 * Simplified DOM Cascade Area Matching Tests (US-001)
 * Basic tests to validate core functionality
 */

import { describe, it, expect } from "bun:test";
import { AreaMatcher } from "../../../src/core/cascade/area-matcher.js";
import { DOMParser } from "../../../src/io/dom-parser.js";

describe("DOM Cascade Area Matching - Core (US-001)", () => {
  it("should create AreaMatcher and DOMParser instances", () => {
    const matcher = new AreaMatcher();
    const parser = new DOMParser();
    
    expect(matcher).toBeInstanceOf(AreaMatcher);
    expect(parser).toBeInstanceOf(DOMParser);
  });

  it("should parse simple HTML content", () => {
    const parser = new DOMParser();
    const html = '<div class="unify-hero">Test content</div>';
    
    const doc = parser.parse(html);
    
    expect(doc).toBeDefined();
    expect(doc.html).toBe(html);
  });

  it("should find elements by class name", () => {
    const parser = new DOMParser();
    const html = '<div class="unify-hero">Hero content</div>';
    
    const doc = parser.parse(html);
    const elements = doc.getElementsByClassName("unify-hero");
    
    expect(elements).toHaveLength(1);
    expect(elements[0].classList.contains("unify-hero")).toBe(true);
  });

  it("should identify unify elements", () => {
    const parser = new DOMParser();
    const html = `
      <div class="unify-hero">Hero</div>
      <div class="regular-class">Regular</div>
      <div class="unify-nav">Nav</div>
    `;
    
    const doc = parser.parse(html);
    const unifyElements = doc.getUnifyElements();
    
    expect(unifyElements).toHaveLength(2);
    expect(unifyElements[0].classList.contains("unify-hero")).toBe(true);
    expect(unifyElements[1].classList.contains("unify-nav")).toBe(true);
  });

  it("should perform basic area matching", () => {
    const matcher = new AreaMatcher();
    const parser = new DOMParser();
    
    const layoutHtml = '<div class="unify-hero">Default hero</div>';
    const pageHtml = '<div class="unify-hero">Custom hero</div>';
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = matcher.matchAreas(layoutDoc, pageDoc);
    
    expect(result).toBeDefined();
    expect(result.matches).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("should validate area uniqueness", () => {
    const matcher = new AreaMatcher();
    const parser = new DOMParser();
    
    const html = '<div class="unify-hero">Single hero</div>';
    const doc = parser.parse(html);
    
    const result = matcher.validateAreaUniqueness(doc);
    
    expect(result.isValid).toBe(true);
    expect(result.duplicates).toHaveLength(0);
  });

  it("should find area classes correctly", () => {
    const matcher = new AreaMatcher();
    const parser = new DOMParser();
    
    const html = `
      <div class="unify-hero">Hero</div>
      <div class="regular-class">Regular</div>
    `;
    
    const doc = parser.parse(html);
    const result = matcher.findAreaClasses(doc);
    
    expect(result.areaClasses).toContain("unify-hero");
    expect(result.nonUnifyClasses).toContain("regular-class");
  });
});