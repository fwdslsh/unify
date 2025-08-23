import { describe, test, expect, beforeEach } from 'bun:test';
import { AreaMatcher } from '../../../src/core/cascade/area-matcher.js';

describe('AreaMatcher Configuration', () => {
  let areaMatcher;

  beforeEach(() => {
    areaMatcher = new AreaMatcher();
  });

  test('should_use_default_unify_prefix_when_no_configuration_provided', () => {
    // Default configuration test - existing functionality
    const result = areaMatcher._getAreaPrefix();
    expect(result).toBe('unify-');
  });

  test('should_use_custom_area_prefix_when_configuration_provided', () => {
    const config = {
      dom_cascade: {
        area_prefix: 'custom-'
      }
    };
    
    const customAreaMatcher = new AreaMatcher(config);
    const result = customAreaMatcher._getAreaPrefix();
    expect(result).toBe('custom-');
  });

  test('should_match_areas_with_custom_prefix_when_custom_configuration_used', () => {
    const config = {
      dom_cascade: {
        area_prefix: 'app-'
      }
    };
    
    const customAreaMatcher = new AreaMatcher(config);
    
    // Test that area matching uses the custom prefix
    const hostElement = { 
      classList: ['app-hero', 'other-class'],
      tagName: 'div'
    };
    
    const pageElement = {
      classList: ['app-hero'],
      tagName: 'section'
    };
    
    const result = customAreaMatcher._hasAreaClass(hostElement, 'app-');
    expect(result).toBe(true);
  });

  test('should_not_match_default_prefix_when_custom_prefix_configured', () => {
    const config = {
      dom_cascade: {
        area_prefix: 'custom-'
      }
    };
    
    const customAreaMatcher = new AreaMatcher(config);
    
    // Element with default prefix should not match when custom prefix is configured
    const element = { 
      classList: ['unify-hero'],
      tagName: 'div'
    };
    
    const result = customAreaMatcher._hasAreaClass(element, 'custom-');
    expect(result).toBe(false);
  });

  test('should_handle_empty_configuration_gracefully_when_invalid_config_provided', () => {
    const emptyConfig = {};
    const matcher = new AreaMatcher(emptyConfig);
    
    // Should fall back to default
    const result = matcher._getAreaPrefix();
    expect(result).toBe('unify-');
  });
});