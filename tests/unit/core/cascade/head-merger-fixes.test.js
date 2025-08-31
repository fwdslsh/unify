/**
 * Head Merger Fixes Test - TDD for head merging issues
 * Tests specific issues found in fixtures integration analysis
 */

import { describe, test, expect } from 'bun:test';
import { HeadMerger } from '../../../../src/core/cascade/head-merger.js';
import { HTMLRewriterUtils } from '../../../../src/core/html-rewriter-utils.js';

describe('HeadMerger - Fix Integration Issues', () => {
	const headMerger = new HeadMerger();

	test('should merge title from page over layout', () => {
		const layoutHead = {
			title: 'Layout Title',
			meta: [],
			links: [],
			scripts: [],
			styles: []
		};
		
		const pageHead = {
			title: 'Page Title Wins',
			meta: [],
			links: [],
			scripts: [],
			styles: []
		};

		const merged = headMerger.merge(layoutHead, pageHead);
		
		expect(merged.title).toBe('Page Title Wins');
	});

	test('should merge meta tags from both layout and page with page-wins precedence', () => {
		const layoutHead = {
			title: null,
			meta: [
				{ charset: 'UTF-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
				{ name: 'description', content: 'Layout description' },
				{ name: 'analytics-version', content: '2.1.0' },
				{ property: 'og:type', content: 'article' }
			],
			links: [],
			scripts: [],
			styles: []
		};
		
		const pageHead = {
			title: 'Page Title Wins',
			meta: [
				{ name: 'description', content: 'Page description overrides layout' },
				{ name: 'author', content: 'Page Author' },
				{ property: 'og:title', content: 'Page OG Title' },
				{ property: 'og:description', content: 'Page OG Description' }
			],
			links: [],
			scripts: [],
			styles: []
		};

		const merged = headMerger.merge(layoutHead, pageHead);
		
		// Should have all meta tags (5 from layout + 3 from page = 8 total after deduplication)
		expect(merged.meta.length).toBe(8);
		
		// Check that page description wins over layout
		const descriptionMeta = merged.meta.find(m => m.name === 'description');
		expect(descriptionMeta?.content).toBe('Page description overrides layout');
		
		// Check other meta tags are present
		expect(merged.meta.find(m => m.charset === 'UTF-8')).toBeTruthy();
		expect(merged.meta.find(m => m.name === 'author')).toBeTruthy();
		expect(merged.meta.find(m => m.name === 'analytics-version')).toBeTruthy();
		expect(merged.meta.find(m => m.property === 'og:type')).toBeTruthy();
		expect(merged.meta.find(m => m.property === 'og:title')).toBeTruthy();
		expect(merged.meta.find(m => m.property === 'og:description')).toBeTruthy();
	});

	test('should deduplicate CSS links properly without duplicates', () => {
		const layoutHead = {
			title: null,
			meta: [],
			links: [
				{ rel: 'stylesheet', href: '/layout.css' },
				{ rel: 'stylesheet', href: '/shared.css' }
			],
			scripts: [],
			styles: []
		};
		
		const pageHead = {
			title: null,
			meta: [],
			links: [
				{ rel: 'stylesheet', href: '/shared.css' }, // This should not duplicate
				{ rel: 'stylesheet', href: '/page.css' }
			],
			scripts: [],
			styles: []
		};

		const merged = headMerger.merge(layoutHead, pageHead);
		
		// Should have no duplicate /shared.css
		const sharedCssLinks = merged.links.filter(link => link.href === '/shared.css');
		expect(sharedCssLinks.length).toBe(1);
		
		// Should have all unique CSS files
		expect(merged.links.length).toBe(3);
		expect(merged.links.find(l => l.href === '/layout.css')).toBeTruthy();
		expect(merged.links.find(l => l.href === '/shared.css')).toBeTruthy();
		expect(merged.links.find(l => l.href === '/page.css')).toBeTruthy();
	});

	test('should merge scripts from layout and page including external and inline', () => {
		const layoutHead = {
			title: null,
			meta: [],
			links: [],
			scripts: [
				{ src: '/layout.js' },
				{ inline: 'console.log(\'Layout inline script\');\nwindow.layoutLoaded = true;' }
			],
			styles: []
		};
		
		const pageHead = {
			title: null,
			meta: [],
			links: [],
			scripts: [
				{ src: '/page.js' },
				{ inline: 'console.log(\'Page inline script\');\nwindow.pageLoaded = true;' }
			],
			styles: []
		};

		const merged = headMerger.merge(layoutHead, pageHead);
		
		// Should have all scripts
		expect(merged.scripts.length).toBe(4);
		expect(merged.scripts.find(s => s.src === '/layout.js')).toBeTruthy();
		expect(merged.scripts.find(s => s.src === '/page.js')).toBeTruthy();
		expect(merged.scripts.find(s => s.inline?.includes('layoutLoaded'))).toBeTruthy();
		expect(merged.scripts.find(s => s.inline?.includes('pageLoaded'))).toBeTruthy();
	});

	test('should handle component-based merging with CSS cascade order', () => {
		const layoutHead = {
			title: 'Layout Title',
			meta: [
				{ name: 'analytics-version', content: '2.1.0' }
			],
			links: [
				{ rel: 'stylesheet', href: '/layout.css' },
				{ rel: 'stylesheet', href: '/shared.css' }
			],
			scripts: [
				{ src: '/layout.js' }
			],
			styles: []
		};

		const componentHeads = [{
			title: null,
			meta: [
				{ property: 'og:type', content: 'article' }
			],
			links: [
				{ rel: 'stylesheet', href: '/analytics.css' }
			],
			scripts: [
				{ src: '/analytics.js' }
			],
			styles: []
		}];
		
		const pageHead = {
			title: 'Page Title Wins',
			meta: [
				{ name: 'description', content: 'Page description' },
				{ property: 'og:title', content: 'Page OG Title' }
			],
			links: [
				{ rel: 'stylesheet', href: '/page.css' }
			],
			scripts: [
				{ src: '/page.js' }
			],
			styles: []
		};

		const merged = headMerger.mergeWithComponents(layoutHead, componentHeads, pageHead);
		
		// Title: page wins
		expect(merged.title).toBe('Page Title Wins');
		
		// Meta: all should be present
		expect(merged.meta.length).toBe(4);
		expect(merged.meta.find(m => m.name === 'analytics-version')).toBeTruthy();
		expect(merged.meta.find(m => m.property === 'og:type')).toBeTruthy();
		expect(merged.meta.find(m => m.name === 'description')).toBeTruthy();
		expect(merged.meta.find(m => m.property === 'og:title')).toBeTruthy();
		
		// Links: CSS cascade order should be layout → components → page
		expect(merged.links.length).toBe(4);
		const cssFiles = merged.links.map(l => l.href);
		expect(cssFiles).toEqual(['/layout.css', '/shared.css', '/analytics.css', '/page.css']);
		
		// Scripts: all should be present
		expect(merged.scripts.length).toBe(3);
		expect(merged.scripts.find(s => s.src === '/layout.js')).toBeTruthy();
		expect(merged.scripts.find(s => s.src === '/analytics.js')).toBeTruthy();
		expect(merged.scripts.find(s => s.src === '/page.js')).toBeTruthy();
	});

	test('should generate properly formatted HTML output', () => {
		const headContent = {
			title: 'Page Title Wins',
			meta: [
				{ charset: 'UTF-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
			],
			links: [
				{ rel: 'stylesheet', href: '/layout.css' }
			],
			scripts: [
				{ src: '/layout.js' }
			],
			styles: []
		};

		const htmlOutput = headMerger.generateHeadHtml(headContent);
		
		// Should contain proper title
		expect(htmlOutput).toContain('<title>Page Title Wins</title>');
		
		// Should contain meta tags
		expect(htmlOutput).toContain('<meta charset="UTF-8">');
		expect(htmlOutput).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
		
		// Should contain links and scripts
		expect(htmlOutput).toContain('<link rel="stylesheet" href="/layout.css">');
		expect(htmlOutput).toContain('<script src="/layout.js"></script>');
		
		// Should have some formatting (though specific formatting is implementation detail)
		expect(htmlOutput.length).toBeGreaterThan(100);
	});
});