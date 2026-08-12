/**
 * Debug createElement method issues
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { UnifyProcessor } from '../../../src/core/html-processor.js';

describe('UnifyProcessor - createElement Debug', () => {
	let processor;

	beforeEach(() => {
		processor = new UnifyProcessor('./src', './dist');
	});

	test('should create meta element successfully', () => {
		const metaEl = processor.createElement('meta');
		console.log('Meta element:', metaEl);
		console.log('Meta tagName:', metaEl?.tagName);
		console.log('Meta nodeName:', metaEl?.nodeName);
		expect(metaEl).not.toBeNull();
		expect(metaEl.tagName.toLowerCase()).toBe('meta');
	});

	test('should create link element successfully', () => {
		const linkEl = processor.createElement('link');
		console.log('Link element:', linkEl);
		console.log('Link tagName:', linkEl?.tagName);
		expect(linkEl).not.toBeNull();
		expect(linkEl.tagName.toLowerCase()).toBe('link');
	});

	test('should create script element successfully', () => {
		const scriptEl = processor.createElement('script');
		console.log('Script element:', scriptEl);
		console.log('Script tagName:', scriptEl?.tagName);
		expect(scriptEl).not.toBeNull();
		expect(scriptEl.tagName.toLowerCase()).toBe('script');
	});

	test('should create title element successfully', () => {
		const titleEl = processor.createElement('title');
		console.log('Title element:', titleEl);
		console.log('Title tagName:', titleEl?.tagName);
		expect(titleEl).not.toBeNull();
		expect(titleEl.tagName.toLowerCase()).toBe('title');
	});
});