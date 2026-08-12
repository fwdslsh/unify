/**
 * Head Merger CSS Order Tests - DOM Cascade v1 Compliance
 * 
 * Tests that CSS files are ordered correctly: layout → components → page
 * and that deduplication works properly.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HeadMerger } from '../../../src/core/cascade/head-merger.js';

describe('HeadMerger CSS Order', () => {
  let headMerger;

  beforeEach(() => {
    headMerger = new HeadMerger();
  });

  /**
   * Test for Issue 3: Head merging CSS order and deduplication
   */
  test('should_order_css_files_layout_components_page_with_deduplication', () => {
    // Layout head (should come first)
    const layoutHead = {
      title: 'Layout Title',
      meta: [
        { charset: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
      ],
      links: [
        { rel: 'stylesheet', href: '/layout.css' },
        { rel: 'stylesheet', href: '/shared.css' } // Shared CSS from layout
      ],
      scripts: [
        { src: '/layout.js' }
      ],
      styles: []
    };

    // Component head (should come after layout, before page)
    const componentHeads = [
      {
        title: null, // Components don't override title
        meta: [
          { name: 'analytics-version', content: '2.1.0' },
          { property: 'og:type', content: 'article' }
        ],
        links: [
          { rel: 'stylesheet', href: '/analytics.css' },
          { rel: 'stylesheet', href: '/shared.css' } // Duplicate - should be deduplicated
        ],
        scripts: [
          { src: '/analytics.js' }
        ],
        styles: []
      }
    ];

    // Page head (should come last)
    const pageHead = {
      title: 'Page Title Wins',
      meta: [
        { name: 'description', content: 'Page description' },
        { name: 'author', content: 'Page Author' }
      ],
      links: [
        { rel: 'stylesheet', href: '/page.css' }
      ],
      scripts: [
        { src: '/page.js' }
      ],
      styles: []
    };

    // Merge in correct order: layout → components → page using mergeWithComponents
    const mergedHead = headMerger.mergeWithComponents(layoutHead, componentHeads, pageHead);

    // Verify title (page wins)
    expect(mergedHead.title).toBe('Page Title Wins');

    // Verify meta elements (all present)
    const metaNames = mergedHead.meta.map(m => m.name || m.property).filter(Boolean);
    expect(metaNames).toContain('viewport');
    expect(metaNames).toContain('analytics-version');
    expect(metaNames).toContain('description');
    expect(metaNames).toContain('author');

    // Verify CSS order: layout → components → page
    const cssHrefs = mergedHead.links.filter(l => l.rel === 'stylesheet').map(l => l.href);
    
    expect(cssHrefs).toEqual([
      '/layout.css',    // Layout first
      '/shared.css',    // Shared CSS (deduplicated)
      '/analytics.css', // Component CSS
      '/page.css'       // Page CSS last
    ]);

    // Verify no duplicates
    const uniqueHrefs = [...new Set(cssHrefs)];
    expect(cssHrefs.length).toBe(uniqueHrefs.length);
  });

  /**
   * Test CSS deduplication specifically
   */
  test('should_deduplicate_css_files_while_preserving_order', () => {
    const head1 = {
      links: [
        { rel: 'stylesheet', href: '/shared.css' },
        { rel: 'stylesheet', href: '/first.css' }
      ]
    };

    const head2 = {
      links: [
        { rel: 'stylesheet', href: '/shared.css' }, // Duplicate
        { rel: 'stylesheet', href: '/second.css' }
      ]
    };

    const merged = headMerger.merge(head1, head2);

    const cssHrefs = merged.links.filter(l => l.rel === 'stylesheet').map(l => l.href);
    
    // Should preserve order but remove duplicates
    expect(cssHrefs).toEqual([
      '/shared.css',  // First occurrence preserved
      '/first.css',
      '/second.css'
    ]);
  });

  /**
   * Test meta element merging and deduplication
   */
  test('should_merge_meta_elements_from_all_sources', () => {
    const layoutHead = {
      meta: [
        { charset: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
      ]
    };

    const pageHead = {
      meta: [
        { name: 'description', content: 'Page description' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' } // Duplicate
      ]
    };

    const merged = headMerger.merge(layoutHead, pageHead);

    // Should have all unique meta elements
    expect(merged.meta).toHaveLength(3); // charset + viewport (deduplicated) + description
    
    const metaNames = merged.meta.map(m => m.name || m.charset).filter(Boolean);
    expect(metaNames).toContain('UTF-8'); // charset
    expect(metaNames).toContain('viewport');
    expect(metaNames).toContain('description');
  });
});