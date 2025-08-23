/**
 * Unit Tests: Link Normalizer
 * Tests for US-018: Link Normalization for Pretty URLs
 * 
 * TDD Phase: RED - Creating failing tests first
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { LinkNormalizer } from '../../../src/core/link-normalizer.js';

describe('LinkNormalizer', () => {
  let normalizer;
  let enabledNormalizer;

  beforeEach(() => {
    normalizer = new LinkNormalizer({ prettyUrls: false });
    enabledNormalizer = new LinkNormalizer({ prettyUrls: true });
  });

  describe('Core Transformation Logic', () => {
    test('should_transform_html_links_to_pretty_urls_when_enabled', () => {
      expect(enabledNormalizer.transformLink('about.html')).toBe('/about/');
      expect(enabledNormalizer.transformLink('blog/post.html')).toBe('/blog/post/');
      expect(enabledNormalizer.transformLink('/contact.html')).toBe('/contact/');
    });

    test('should_convert_index_html_to_root_path', () => {
      expect(enabledNormalizer.transformLink('index.html')).toBe('/');
      expect(enabledNormalizer.transformLink('/index.html')).toBe('/');
      expect(enabledNormalizer.transformLink('blog/index.html')).toBe('/blog/');
      expect(enabledNormalizer.transformLink('/blog/index.html')).toBe('/blog/');
    });

    test('should_not_transform_when_pretty_urls_disabled', () => {
      expect(normalizer.transformLink('about.html')).toBe('about.html');
      expect(normalizer.transformLink('blog/post.html')).toBe('blog/post.html');
      expect(normalizer.transformLink('index.html')).toBe('index.html');
    });
  });

  describe('Query Parameters and Fragments', () => {
    test('should_preserve_query_parameters_in_transformed_links', () => {
      expect(enabledNormalizer.transformLink('about.html?ref=nav')).toBe('/about/?ref=nav');
      expect(enabledNormalizer.transformLink('blog/post.html?id=123&view=full')).toBe('/blog/post/?id=123&view=full');
      expect(enabledNormalizer.transformLink('search.html?q=test')).toBe('/search/?q=test');
    });

    test('should_preserve_fragments_in_transformed_links', () => {
      expect(enabledNormalizer.transformLink('about.html#contact')).toBe('/about/#contact');
      expect(enabledNormalizer.transformLink('docs/api.html#methods')).toBe('/docs/api/#methods');
      expect(enabledNormalizer.transformLink('guide.html#getting-started')).toBe('/guide/#getting-started');
    });

    test('should_preserve_both_query_and_fragment', () => {
      expect(enabledNormalizer.transformLink('search.html?q=test#results')).toBe('/search/?q=test#results');
      expect(enabledNormalizer.transformLink('docs.html?page=2#section-3')).toBe('/docs/?page=2#section-3');
    });

    test('should_preserve_complex_query_parameters', () => {
      expect(enabledNormalizer.transformLink('api.html?filter[category]=tech&sort=date')).toBe('/api/?filter[category]=tech&sort=date');
      expect(enabledNormalizer.transformLink('search.html?q=hello%20world&limit=10')).toBe('/search/?q=hello%20world&limit=10');
    });
  });

  describe('Link Type Detection', () => {
    test('should_not_transform_external_links', () => {
      expect(enabledNormalizer.transformLink('https://example.com/page.html')).toBe('https://example.com/page.html');
      expect(enabledNormalizer.transformLink('http://test.org/about.html')).toBe('http://test.org/about.html');
      expect(enabledNormalizer.transformLink('//cdn.example.com/file.html')).toBe('//cdn.example.com/file.html');
      expect(enabledNormalizer.transformLink('ftp://files.example.com/doc.html')).toBe('ftp://files.example.com/doc.html');
    });

    test('should_not_transform_protocol_links', () => {
      expect(enabledNormalizer.transformLink('mailto:test@example.com')).toBe('mailto:test@example.com');
      expect(enabledNormalizer.transformLink('tel:+1234567890')).toBe('tel:+1234567890');
      expect(enabledNormalizer.transformLink('javascript:void(0)')).toBe('javascript:void(0)');
      expect(enabledNormalizer.transformLink('data:text/html,<h1>Test</h1>')).toBe('data:text/html,<h1>Test</h1>');
    });

    test('should_not_transform_non_html_files', () => {
      expect(enabledNormalizer.transformLink('document.pdf')).toBe('document.pdf');
      expect(enabledNormalizer.transformLink('image.jpg')).toBe('image.jpg');
      expect(enabledNormalizer.transformLink('style.css')).toBe('style.css');
      expect(enabledNormalizer.transformLink('script.js')).toBe('script.js');
      expect(enabledNormalizer.transformLink('data.json')).toBe('data.json');
      expect(enabledNormalizer.transformLink('archive.zip')).toBe('archive.zip');
    });

    test('should_not_transform_anchor_links', () => {
      expect(enabledNormalizer.transformLink('#section')).toBe('#section');
      expect(enabledNormalizer.transformLink('#top')).toBe('#top');
      expect(enabledNormalizer.transformLink('#')).toBe('#');
    });

    test('should_detect_html_files_case_insensitively', () => {
      expect(enabledNormalizer.transformLink('page.HTML')).toBe('/page/');
      expect(enabledNormalizer.transformLink('about.Html')).toBe('/about/');
      expect(enabledNormalizer.transformLink('contact.HTM')).toBe('/contact/');
      expect(enabledNormalizer.transformLink('index.htm')).toBe('/');
    });
  });

  describe('Path Handling', () => {
    test('should_handle_relative_paths_correctly', () => {
      expect(enabledNormalizer.transformLink('./about.html')).toBe('./about/');
      expect(enabledNormalizer.transformLink('../blog/post.html')).toBe('../blog/post/');
      expect(enabledNormalizer.transformLink('../../index.html')).toBe('../../');
      expect(enabledNormalizer.transformLink('./index.html')).toBe('./');
    });

    test('should_handle_complex_file_structures', () => {
      expect(enabledNormalizer.transformLink('docs/api/methods.html')).toBe('/docs/api/methods/');
      expect(enabledNormalizer.transformLink('/products/category/item.html')).toBe('/products/category/item/');
      expect(enabledNormalizer.transformLink('blog/2023/12/post.html')).toBe('/blog/2023/12/post/');
    });

    test('should_handle_paths_with_dots', () => {
      expect(enabledNormalizer.transformLink('v2.0/docs.html')).toBe('/v2.0/docs/');
      expect(enabledNormalizer.transformLink('jquery-3.6.0/documentation.html')).toBe('/jquery-3.6.0/documentation/');
    });

    test('should_normalize_multiple_slashes', () => {
      expect(enabledNormalizer.transformLink('//docs//api.html')).toBe('/docs/api/');
      expect(enabledNormalizer.transformLink('/blog///post.html')).toBe('/blog/post/');
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_empty_and_invalid_links', () => {
      expect(enabledNormalizer.transformLink('')).toBe('');
      expect(enabledNormalizer.transformLink(null)).toBe('');
      expect(enabledNormalizer.transformLink(undefined)).toBe('');
    });

    test('should_handle_whitespace_in_links', () => {
      expect(enabledNormalizer.transformLink(' about.html ')).toBe('/about/');
      expect(enabledNormalizer.transformLink('\\tcontact.html\\n')).toBe('/contact/');
    });

    test('should_handle_unicode_in_links', () => {
      expect(enabledNormalizer.transformLink('über-uns.html')).toBe('/über-uns/');
      expect(enabledNormalizer.transformLink('测试.html')).toBe('/测试/');
      expect(enabledNormalizer.transformLink('café.html')).toBe('/café/');
    });

    test('should_handle_special_characters', () => {
      expect(enabledNormalizer.transformLink('page-with-dashes.html')).toBe('/page-with-dashes/');
      expect(enabledNormalizer.transformLink('page_with_underscores.html')).toBe('/page_with_underscores/');
      expect(enabledNormalizer.transformLink('page%20encoded.html')).toBe('/page%20encoded/');
    });

    test('should_handle_only_html_extension', () => {
      expect(enabledNormalizer.transformLink('.html')).toBe('/');
      expect(enabledNormalizer.transformLink('/.html')).toBe('/');
    });
  });

  describe('Option Handling', () => {
    test('should_handle_missing_options_gracefully', () => {
      const defaultNormalizer = new LinkNormalizer();
      expect(defaultNormalizer.transformLink('about.html')).toBe('about.html');
      expect(defaultNormalizer.transformLink('index.html')).toBe('index.html');
    });

    test('should_handle_null_options', () => {
      const nullNormalizer = new LinkNormalizer(null);
      expect(nullNormalizer.transformLink('about.html')).toBe('about.html');
    });

    test('should_handle_partial_options', () => {
      const partialNormalizer = new LinkNormalizer({ prettyUrls: true, someOtherOption: 'test' });
      expect(partialNormalizer.transformLink('about.html')).toBe('/about/');
    });
  });

  describe('shouldTransform Method', () => {
    test('should_correctly_identify_transformable_links', () => {
      expect(enabledNormalizer.shouldTransform('about.html')).toBe(true);
      expect(enabledNormalizer.shouldTransform('blog/post.html')).toBe(true);
      expect(enabledNormalizer.shouldTransform('index.html')).toBe(true);
    });

    test('should_correctly_identify_non_transformable_links', () => {
      expect(enabledNormalizer.shouldTransform('https://example.com')).toBe(false);
      expect(enabledNormalizer.shouldTransform('document.pdf')).toBe(false);
      expect(enabledNormalizer.shouldTransform('mailto:test@example.com')).toBe(false);
      expect(enabledNormalizer.shouldTransform('#section')).toBe(false);
    });

    test('should_respect_prettyUrls_option_in_shouldTransform', () => {
      expect(enabledNormalizer.shouldTransform('about.html')).toBe(true);
      expect(normalizer.shouldTransform('about.html')).toBe(false);
    });
  });

  describe('preserveParameters Method', () => {
    test('should_extract_and_preserve_query_parameters', () => {
      const originalHref = 'about.html?ref=nav&source=menu';
      const transformedHref = '/about/';
      const result = enabledNormalizer.preserveParameters(originalHref, transformedHref);
      expect(result).toBe('/about/?ref=nav&source=menu');
    });

    test('should_extract_and_preserve_fragments', () => {
      const originalHref = 'docs.html#getting-started';
      const transformedHref = '/docs/';
      const result = enabledNormalizer.preserveParameters(originalHref, transformedHref);
      expect(result).toBe('/docs/#getting-started');
    });

    test('should_preserve_both_query_and_fragment', () => {
      const originalHref = 'search.html?q=test&page=2#results';
      const transformedHref = '/search/';
      const result = enabledNormalizer.preserveParameters(originalHref, transformedHref);
      expect(result).toBe('/search/?q=test&page=2#results');
    });

    test('should_return_transformed_href_when_no_parameters', () => {
      const originalHref = 'about.html';
      const transformedHref = '/about/';
      const result = enabledNormalizer.preserveParameters(originalHref, transformedHref);
      expect(result).toBe('/about/');
    });
  });

  describe('normalizeToPath Method', () => {
    test('should_convert_html_files_to_directory_paths', () => {
      expect(enabledNormalizer.normalizeToPath('about.html')).toBe('/about/');
      expect(enabledNormalizer.normalizeToPath('blog/post.html')).toBe('/blog/post/');
    });

    test('should_convert_index_html_to_parent_directory', () => {
      expect(enabledNormalizer.normalizeToPath('index.html')).toBe('/');
      expect(enabledNormalizer.normalizeToPath('blog/index.html')).toBe('/blog/');
    });

    test('should_handle_paths_without_leading_slash', () => {
      expect(enabledNormalizer.normalizeToPath('docs/guide.html')).toBe('/docs/guide/');
      expect(enabledNormalizer.normalizeToPath('api.html')).toBe('/api/');
    });
  });
});