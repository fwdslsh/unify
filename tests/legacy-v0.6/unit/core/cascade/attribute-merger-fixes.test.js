/**
 * Attribute Merger Fixes Test - TDD for attribute precedence issues
 * Tests specific issues found in fixtures integration analysis
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { AttributeMerger } from '../../../../src/core/cascade/attribute-merger.js';

describe('AttributeMerger - Fix Integration Issues', () => {
	let merger;

	beforeEach(() => {
		merger = new AttributeMerger();
	});

	test('should implement page-wins precedence for data attributes', () => {
		// Simulate layout element (host)
		const layoutElement = {
			getAttribute: (name) => {
				const attrs = {
					'class': 'unify-hero',
					'id': 'hero-section',
					'data-theme': 'dark',
					'data-priority': '1'
				};
				return attrs[name] || null;
			}
		};

		// Simulate page element  
		const pageElement = {
			getAttribute: (name) => {
				const attrs = {
					'data-custom': 'page-value',
					'data-theme': 'light',
					'data-priority': '2'
				};
				return attrs[name] || null;
			}
		};

		const merged = merger.mergeAttributes(layoutElement, pageElement);

		// Page should win for data attributes
		expect(merged['data-theme']).toBe('light'); // page wins over layout 'dark'
		expect(merged['data-priority']).toBe('2'); // page wins over layout '1'
		expect(merged['data-custom']).toBe('page-value'); // page only
		
		// Host attributes should be preserved when page doesn't override
		expect(merged['class']).toBe('unify-hero'); // host only
		expect(merged['id']).toBe('hero-section'); // host only
	});

	test('should handle mixed attribute formats with proper extraction', () => {
		// Element with attributes collection (like DOM element)
		const hostElement = {
			attributes: [
				{ name: 'class', value: 'host-class' },
				{ name: 'data-layout', value: 'sidebar' },
				{ name: 'data-version', value: '1.0' }
			]
		};

		// Element with getAttribute method
		const pageElement = {
			getAttribute: (name) => {
				const attrs = {
					'data-custom': 'page-custom',
					'data-version': '2.0',
					'style': 'color: red;'
				};
				return attrs[name] || null;
			}
		};

		const merged = merger.mergeAttributes(hostElement, pageElement);

		// Should extract from both formats
		expect(merged['class']).toBe('host-class');
		expect(merged['data-layout']).toBe('sidebar'); // from host
		expect(merged['data-version']).toBe('2.0'); // page wins over host '1.0'
		expect(merged['data-custom']).toBe('page-custom'); // page only
		expect(merged['style']).toBe('color: red;'); // page only
	});

	test('should handle class union correctly', () => {
		const hostElement = {
			attributes: [
				{ name: 'class', value: 'host-class unify-hero' }
			]
		};

		const pageElement = {
			getAttribute: (name) => {
				return name === 'class' ? 'page-class unify-hero custom-style' : null;
			}
		};

		const merged = merger.mergeAttributes(hostElement, pageElement);

		// Should union classes without duplicates
		const classes = merged['class'].split(' ');
		expect(classes).toContain('host-class');
		expect(classes).toContain('page-class');
		expect(classes).toContain('unify-hero');
		expect(classes).toContain('custom-style');
		
		// Should not have duplicates
		const uniqueClasses = [...new Set(classes)];
		expect(classes.length).toBe(uniqueClasses.length);
	});

	test('should preserve host ID over page ID for stability', () => {
		const hostElement = {
			attributes: [
				{ name: 'id', value: 'hero-section' }
			]
		};

		const pageElement = {
			getAttribute: (name) => {
				return name === 'id' ? 'page-hero' : null;
			}
		};

		const merged = merger.mergeAttributes(hostElement, pageElement);

		// Host ID should win for stability
		expect(merged['id']).toBe('hero-section');
	});

	test('should use page ID when host has no ID', () => {
		const hostElement = {
			attributes: []
		};

		const pageElement = {
			getAttribute: (name) => {
				return name === 'id' ? 'page-hero' : null;
			}
		};

		const merged = merger.mergeAttributes(hostElement, pageElement);

		// Should use page ID when host has none
		expect(merged['id']).toBe('page-hero');
	});

	test('should remove data-unify attributes from final output', () => {
		const hostElement = {
			attributes: [
				{ name: 'data-unify', value: '/path/to/layout.html' },
				{ name: 'class', value: 'host-class' }
			]
		};

		const pageElement = {
			getAttribute: (name) => {
				const attrs = {
					'data-unify': '/path/to/other.html',
					'data-custom': 'page-value'
				};
				return attrs[name] || null;
			}
		};

		const merged = merger.mergeAttributes(hostElement, pageElement);

		// data-unify should be removed
		expect(merged['data-unify']).toBeUndefined();
		
		// Other attributes should remain
		expect(merged['class']).toBe('host-class');
		expect(merged['data-custom']).toBe('page-value');
	});
});