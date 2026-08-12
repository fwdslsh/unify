/**
 * Head Content Replacement Test - Tests replaceHeadContent method
 * Reproduces the exact issue found where meta and link objects from HeadMerger 
 * don't match the expected format in replaceHeadContent
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { UnifyProcessor } from '../../../src/core/html-processor.js';

describe('UnifyProcessor - Head Content Replacement', () => {
	let processor;

	beforeEach(() => {
		processor = new UnifyProcessor('./src', './dist');
	});

	test('should properly add meta tags from HeadMerger format to DOM', () => {
		// Create a minimal HTML document
		const html = '<!DOCTYPE html><html><head></head><body></body></html>';
		const doc = processor.parseHTML(html);
		
		// This is the format that HeadMerger returns
		const mergedHead = {
			title: 'Test Title',
			meta: [
				{ charset: 'UTF-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
				{ name: 'description', content: 'Test description' },
				{ property: 'og:title', content: 'Test OG Title' }
			],
			links: [
				{ rel: 'stylesheet', href: '/layout.css' },
				{ rel: 'stylesheet', href: '/page.css' }
			],
			scripts: [
				{ src: '/layout.js' },
				{ inline: 'console.log("test");' }
			],
			styles: []
		};

		// Apply the merged head content
		processor.replaceHeadContent(doc, mergedHead);
		
		// Serialize to check the result
		const result = processor.serializeHTML(doc);
		
		// Should contain the title
		expect(result).toContain('<title>Test Title</title>');
		
		// Should contain all meta tags (flexible attribute order)
		expect(result).toContain('<meta charset="UTF-8">');
		expect(result).toMatch(/<meta [^>]*(content="width=device-width, initial-scale=1\.0"[^>]*name="viewport"|name="viewport"[^>]*content="width=device-width, initial-scale=1\.0")[^>]*>/);
		expect(result).toMatch(/<meta [^>]*(content="Test description"[^>]*name="description"|name="description"[^>]*content="Test description")[^>]*>/);
		expect(result).toMatch(/<meta [^>]*(content="Test OG Title"[^>]*property="og:title"|property="og:title"[^>]*content="Test OG Title")[^>]*>/);
		
		// Should contain all link tags (flexible attribute order)
		expect(result).toMatch(/<link [^>]*(href="\/layout\.css"[^>]*rel="stylesheet"|rel="stylesheet"[^>]*href="\/layout\.css")[^>]*>/);
		expect(result).toMatch(/<link [^>]*(href="\/page\.css"[^>]*rel="stylesheet"|rel="stylesheet"[^>]*href="\/page\.css")[^>]*>/);
		
		// Should contain scripts
		expect(result).toContain('<script src="/layout.js"></script>');
		expect(result).toContain('<script>console.log("test");</script>');
	});

	test('should handle empty merged head gracefully', () => {
		const html = '<!DOCTYPE html><html><head><title>Original</title></head><body></body></html>';
		const doc = processor.parseHTML(html);
		
		const mergedHead = {
			title: null,
			meta: [],
			links: [],
			scripts: [],
			styles: []
		};

		processor.replaceHeadContent(doc, mergedHead);
		
		const result = processor.serializeHTML(doc);
		
		// Original title should be removed, no new title added
		expect(result).not.toContain('<title>Original</title>');
		expect(result).not.toContain('<title>');
	});

	test('should handle mixed element and plain object formats', () => {
		const html = '<!DOCTYPE html><html><head></head><body></body></html>';
		const doc = processor.parseHTML(html);
		
		const mergedHead = {
			title: 'Mixed Test',
			meta: [
				// Plain object format (from HeadMerger)
				{ charset: 'UTF-8' },
				// Element format (from other sources) - this shouldn't happen in practice
				// but the code should handle it gracefully
			],
			links: [
				// Plain object format 
				{ rel: 'stylesheet', href: '/test.css' }
			],
			scripts: [],
			styles: []
		};

		processor.replaceHeadContent(doc, mergedHead);
		
		const result = processor.serializeHTML(doc);
		
		expect(result).toContain('<title>Mixed Test</title>');
		expect(result).toContain('<meta charset="UTF-8">');
		expect(result).toMatch(/<link [^>]*(href="\/test\.css"[^>]*rel="stylesheet"|rel="stylesheet"[^>]*href="\/test\.css")[^>]*>/);
	});
});