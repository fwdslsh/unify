/**
 * Unit tests for HeadMerger path normalization functionality
 * Tests the fix for component asset path resolution issues
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { HeadMerger } from '../../../../src/core/cascade/head-merger.js';

describe('HeadMerger - Path Normalization', () => {
  let headMerger;

  beforeEach(() => {
    headMerger = new HeadMerger();
  });

  describe('_normalizeAssetPath', () => {
    it('should normalize relative paths to absolute paths', () => {
      expect(headMerger._normalizeAssetPath('assets/styles.css')).toBe('/assets/styles.css');
      expect(headMerger._normalizeAssetPath('css/main.css')).toBe('/css/main.css');
      expect(headMerger._normalizeAssetPath('fonts/roboto.woff2')).toBe('/fonts/roboto.woff2');
    });

    it('should preserve absolute paths unchanged', () => {
      expect(headMerger._normalizeAssetPath('/assets/styles.css')).toBe('/assets/styles.css');
      expect(headMerger._normalizeAssetPath('/css/main.css')).toBe('/css/main.css');
      expect(headMerger._normalizeAssetPath('/fonts/roboto.woff2')).toBe('/fonts/roboto.woff2');
    });

    it('should preserve external URLs unchanged', () => {
      expect(headMerger._normalizeAssetPath('https://cdn.example.com/styles.css'))
        .toBe('https://cdn.example.com/styles.css');
      expect(headMerger._normalizeAssetPath('http://fonts.googleapis.com/css'))
        .toBe('http://fonts.googleapis.com/css');
      expect(headMerger._normalizeAssetPath('//cdn.jsdelivr.net/npm/bootstrap.css'))
        .toBe('//cdn.jsdelivr.net/npm/bootstrap.css');
    });

    it('should preserve data URLs unchanged', () => {
      const dataUrl = 'data:text/css;base64,LyogU29tZSBDU1MgKi8=';
      expect(headMerger._normalizeAssetPath(dataUrl)).toBe(dataUrl);
    });

    it('should handle empty or invalid inputs gracefully', () => {
      expect(headMerger._normalizeAssetPath('')).toBe('');
      expect(headMerger._normalizeAssetPath(null)).toBe(null);
      expect(headMerger._normalizeAssetPath(undefined)).toBe(undefined);
    });

    it('should preserve other protocols unchanged', () => {
      expect(headMerger._normalizeAssetPath('file:///local/path.css'))
        .toBe('file:///local/path.css');
      expect(headMerger._normalizeAssetPath('ftp://server.com/styles.css'))
        .toBe('ftp://server.com/styles.css');
    });
  });

  describe('_getLinkKey with path normalization', () => {
    it('should generate same key for relative and absolute paths to same resource', () => {
      const relativeLink = { rel: 'stylesheet', href: 'assets/nav.css' };
      const absoluteLink = { rel: 'stylesheet', href: '/assets/nav.css' };

      const relativeKey = headMerger._getLinkKey(relativeLink);
      const absoluteKey = headMerger._getLinkKey(absoluteLink);

      expect(relativeKey).toBe(absoluteKey);
      expect(relativeKey).toBe('stylesheet:/assets/nav.css');
    });

    it('should generate different keys for different resources', () => {
      const stylesLink = { rel: 'stylesheet', href: 'assets/styles.css' };
      const navLink = { rel: 'stylesheet', href: '/assets/nav.css' };

      const stylesKey = headMerger._getLinkKey(stylesLink);
      const navKey = headMerger._getLinkKey(navLink);

      expect(stylesKey).not.toBe(navKey);
      expect(stylesKey).toBe('stylesheet:/assets/styles.css');
      expect(navKey).toBe('stylesheet:/assets/nav.css');
    });

    it('should preserve external URL keys unchanged', () => {
      const externalLink = { rel: 'stylesheet', href: 'https://cdn.example.com/styles.css' };
      const key = headMerger._getLinkKey(externalLink);
      
      expect(key).toBe('stylesheet:https://cdn.example.com/styles.css');
    });

    it('should handle canonical and icon links without normalization', () => {
      const canonicalLink = { rel: 'canonical', href: 'https://example.com/page' };
      const iconLink = { rel: 'icon', href: '/favicon.ico' };

      expect(headMerger._getLinkKey(canonicalLink)).toBe('canonical');
      expect(headMerger._getLinkKey(iconLink)).toBe('icon');
    });
  });

  describe('link deduplication with path normalization', () => {
    it('should deduplicate relative and absolute paths to same CSS file', () => {
      const layoutLinks = [
        { rel: 'stylesheet', href: 'assets/styles.css' },
        { rel: 'stylesheet', href: 'assets/nav.css' }
      ];

      const pageLinks = [
        { rel: 'stylesheet', href: '/assets/nav.css' }, // Same as layout nav.css but absolute
        { rel: 'stylesheet', href: '/assets/components.css' }
      ];

      const merged = headMerger._mergeLinks(layoutLinks, pageLinks);

      // Should have 3 unique links: styles.css, nav.css (page wins), components.css
      expect(merged).toHaveLength(3);
      
      // Find the nav.css link - should be the absolute version from page (page wins rule)
      const navLink = merged.find(link => link.href === '/assets/nav.css');
      expect(navLink).toBeDefined();
      
      // Should not have the relative version
      const relativeNavLink = merged.find(link => link.href === 'assets/nav.css');
      expect(relativeNavLink).toBeUndefined();

      // Other links should be present
      expect(merged.find(link => link.href === 'assets/styles.css')).toBeDefined();
      expect(merged.find(link => link.href === '/assets/components.css')).toBeDefined();
    });

    it('should handle mixed external and local assets correctly', () => {
      const layoutLinks = [
        { rel: 'stylesheet', href: 'assets/local.css' },
        { rel: 'stylesheet', href: 'https://cdn.example.com/external.css' }
      ];

      const pageLinks = [
        { rel: 'stylesheet', href: '/assets/local.css' }, // Same local asset, different path format
        { rel: 'stylesheet', href: 'https://cdn.example.com/external.css' } // Same external asset
      ];

      const merged = headMerger._mergeLinks(layoutLinks, pageLinks);

      // Should deduplicate both local and external assets
      expect(merged).toHaveLength(2);
      
      // Page should win for both
      expect(merged.find(link => link.href === '/assets/local.css')).toBeDefined();
      expect(merged.find(link => link.href === 'https://cdn.example.com/external.css')).toBeDefined();
      
      // Layout versions should be replaced
      expect(merged.find(link => link.href === 'assets/local.css')).toBeUndefined();
    });

    it('should preserve multiple different stylesheets', () => {
      const layoutLinks = [
        { rel: 'stylesheet', href: 'assets/layout.css' },
        { rel: 'stylesheet', href: '/assets/shared.css' }
      ];

      const pageLinks = [
        { rel: 'stylesheet', href: '/assets/page.css' },
        { rel: 'stylesheet', href: 'assets/components.css' }
      ];

      const merged = headMerger._mergeLinks(layoutLinks, pageLinks);

      // All 4 should be present as they're different files
      expect(merged).toHaveLength(4);
      expect(merged.find(link => link.href === 'assets/layout.css')).toBeDefined();
      expect(merged.find(link => link.href === '/assets/shared.css')).toBeDefined();
      expect(merged.find(link => link.href === '/assets/page.css')).toBeDefined();
      expect(merged.find(link => link.href === 'assets/components.css')).toBeDefined();
    });
  });
});