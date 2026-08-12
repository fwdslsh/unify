/**
 * Unit Tests for AttributeMerger Class - DOM Cascade Components
 * Tests DOM attribute merging functionality per DOM Cascade v1 specification
 * Addresses ISSUE-005: DOM Cascade Components Untested (Scenario 5)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { AttributeMerger } from '../../../../src/core/cascade/attribute-merger.js';

describe('AttributeMerger', () => {
  let attributeMerger;

  beforeEach(() => {
    attributeMerger = new AttributeMerger();
  });

  describe('AttributeMerger Initialization', () => {
    test('should_create_attribute_merger_with_simplified_configuration', () => {
      expect(attributeMerger).toBeDefined();
    });
  });

  describe('Basic Attribute Merging', () => {
    test('should_merge_attributes_from_host_and_page_elements', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',
          class: 'host-class',
          title: 'Host Title'
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class',
          title: 'Page Title',
          role: 'main'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged).toBeDefined();
      expect(merged.id).toBe('host-id'); // Host ID wins
      expect(merged.class).toBe('host-class page-class'); // Class union
      expect(merged.title).toBe('Page Title'); // Page wins for other attributes
      expect(merged.role).toBe('main'); // Page attribute added
    });

    test('should_handle_elements_with_no_attributes', () => {
      const hostElement = {};
      const pageElement = {};

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged).toBeDefined();
      expect(Object.keys(merged)).toHaveLength(0);
    });

    test('should_handle_null_or_undefined_elements', () => {
      expect(() => {
        attributeMerger.mergeAttributes(null, null);
      }).not.toThrow();

      expect(() => {
        attributeMerger.mergeAttributes(undefined, undefined);
      }).not.toThrow();

      const result = attributeMerger.mergeAttributes(null, null);
      expect(result).toBeDefined();
      expect(Object.keys(result)).toHaveLength(0);
    });

    test('should_handle_mixed_null_and_valid_elements', () => {
      const validElement = {
        attributes: { title: 'Valid Title' }
      };

      const result1 = attributeMerger.mergeAttributes(validElement, null);
      expect(result1.title).toBe('Valid Title');

      const result2 = attributeMerger.mergeAttributes(null, validElement);
      expect(result2.title).toBe('Valid Title');
    });
  });

  describe('ID Attribute Merging Rules', () => {
    test('should_preserve_host_id_when_both_elements_have_ids', () => {
      const hostElement = {
        attributes: { id: 'host-id' }
      };

      const pageElement = {
        attributes: { id: 'page-id' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id'); // Host ID wins
    });

    test('should_use_page_id_when_host_has_no_id', () => {
      const hostElement = {
        attributes: { class: 'host-class' }
      };

      const pageElement = {
        attributes: { id: 'page-id' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('page-id'); // Use page ID when host lacks one
    });

    test('should_use_page_id_when_host_id_is_empty_string', () => {
      const hostElement = {
        attributes: { id: '' }
      };

      const pageElement = {
        attributes: { id: 'page-id' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('page-id'); // Empty string is falsy, so page ID is used
    });

    test('should_handle_missing_id_from_both_elements', () => {
      const hostElement = {
        attributes: { class: 'host-class' }
      };

      const pageElement = {
        attributes: { class: 'page-class' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBeUndefined(); // No id attribute in result
    });
  });

  describe('Class Attribute Union Rules', () => {
    test('should_create_union_of_host_and_page_classes', () => {
      const hostElement = {
        attributes: { class: 'host-class-1 host-class-2' }
      };

      const pageElement = {
        attributes: { class: 'page-class-1 page-class-2' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toContain('host-class-1');
      expect(merged.class).toContain('host-class-2');
      expect(merged.class).toContain('page-class-1');
      expect(merged.class).toContain('page-class-2');
    });

    test('should_deduplicate_common_classes_in_union', () => {
      const hostElement = {
        attributes: { class: 'common-class host-class' }
      };

      const pageElement = {
        attributes: { class: 'common-class page-class' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toBe('common-class host-class page-class');
      
      // Verify deduplication - should only appear once
      const classArray = merged.class.split(' ');
      const commonClassCount = classArray.filter(cls => cls === 'common-class').length;
      expect(commonClassCount).toBe(1);
    });

    test('should_handle_empty_class_attributes', () => {
      const hostElement = {
        attributes: { class: '' }
      };

      const pageElement = {
        attributes: { class: 'page-class' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toBe('page-class');
    });

    test('should_handle_whitespace_in_class_attributes', () => {
      const hostElement = {
        attributes: { class: '  host-class-1   host-class-2  ' }
      };

      const pageElement = {
        attributes: { class: '  page-class  ' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      const classes = merged.class.split(' ').filter(Boolean);
      expect(classes).toContain('host-class-1');
      expect(classes).toContain('host-class-2');
      expect(classes).toContain('page-class');
      expect(classes).toHaveLength(3);
    });

    test('should_preserve_class_order_host_first_then_page', () => {
      const hostElement = {
        attributes: { class: 'host-1 host-2' }
      };

      const pageElement = {
        attributes: { class: 'page-1 page-2' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toBe('host-1 host-2 page-1 page-2');
    });

    test('should_handle_missing_class_from_host_element', () => {
      const hostElement = {
        attributes: { id: 'host-id' }
      };

      const pageElement = {
        attributes: { class: 'page-class' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toBe('page-class');
    });

    test('should_handle_missing_class_from_page_element', () => {
      const hostElement = {
        attributes: { class: 'host-class' }
      };

      const pageElement = {
        attributes: { id: 'page-id' }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.class).toBe('host-class');
    });
  });

  describe('Page Wins Rule for Other Attributes', () => {
    test('should_let_page_attributes_override_host_attributes', () => {
      const hostElement = {
        attributes: {
          title: 'Host Title',
          role: 'host-role',
          style: 'color: red;'
        }
      };

      const pageElement = {
        attributes: {
          title: 'Page Title',
          role: 'page-role',
          style: 'color: blue;'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.title).toBe('Page Title');
      expect(merged.role).toBe('page-role');
      expect(merged.style).toBe('color: blue;');
    });

    test('should_add_page_only_attributes_to_merged_result', () => {
      const hostElement = {
        attributes: { id: 'host-id' }
      };

      const pageElement = {
        attributes: {
          'data-custom': 'page-data',
          'aria-label': 'Page Label',
          'tabindex': '0'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id'); // Host attribute preserved
      expect(merged['data-custom']).toBe('page-data'); // Page attribute added
      expect(merged['aria-label']).toBe('Page Label'); // Page attribute added
      expect(merged.tabindex).toBe('0'); // Page attribute added
    });

    test('should_preserve_host_only_attributes_when_page_lacks_them', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',
          title: 'Host Title',
          'data-host': 'host-data'
        }
      };

      const pageElement = {
        attributes: {
          role: 'page-role'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id'); // Host ID preserved
      expect(merged.title).toBe('Host Title'); // Host title preserved
      expect(merged['data-host']).toBe('host-data'); // Host data preserved
      expect(merged.role).toBe('page-role'); // Page role added
    });
  });

  describe('Data-Unify Attribute Removal', () => {
    test('should_remove_data_unify_attributes_from_merged_result', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',
          'data-unify': '/path/to/layout.html'
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class',
          'data-unify': '/path/to/another.html'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');
      expect(merged.class).toBe('page-class');
      expect(merged['data-unify']).toBeUndefined(); // Must be removed
    });

    test('should_remove_data_unify_even_when_only_one_element_has_it', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',
          'data-unify': '/layout.html'
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');
      expect(merged.class).toBe('page-class');
      expect(merged['data-unify']).toBeUndefined(); // Must be removed
    });

    test('should_preserve_other_data_attributes_while_removing_data_unify', () => {
      const hostElement = {
        attributes: {
          'data-unify': '/layout.html',
          'data-custom': 'custom-value'
        }
      };

      const pageElement = {
        attributes: {
          'data-page': 'page-value'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged['data-unify']).toBeUndefined(); // Removed
      expect(merged['data-custom']).toBe('custom-value'); // Preserved
      expect(merged['data-page']).toBe('page-value'); // Added
    });
  });

  describe('Different Element Implementation Support', () => {
    test('should_handle_elements_with_iterable_attributes', () => {
      // Create a proper iterable attributes collection
      const attributesList = [
        { name: 'id', value: 'host-id' },
        { name: 'class', value: 'host-class' }
      ];
      
      const hostElement = {
        attributes: {
          [Symbol.iterator]: function* () {
            for (const attr of attributesList) {
              yield attr;
            }
          }
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class',
          title: 'Page Title'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');
      expect(merged.class).toBe('host-class page-class');
      expect(merged.title).toBe('Page Title');
    });

    test('should_handle_elements_with_getAttribute_method', () => {
      const hostElement = {
        getAttribute: (name) => {
          const attrs = {
            id: 'host-id',
            class: 'host-class',
            title: 'Host Title'
          };
          return attrs[name] || null;
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class',
          role: 'main'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');
      expect(merged.class).toBe('host-class page-class');
      expect(merged.title).toBe('Host Title'); // From host via getAttribute
      expect(merged.role).toBe('main'); // From page
    });

    test('should_handle_mixed_attribute_implementations', () => {
      const hostElement = {
        getAttribute: (name) => {
          if (name === 'id') return 'host-id';
          if (name === 'data-unify') return '/layout.html';
          return null;
        }
      };

      const pageElement = {
        attributes: {
          class: 'page-class',
          title: 'Page Title'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id'); // From host getAttribute
      expect(merged.class).toBe('page-class'); // From page attributes
      expect(merged.title).toBe('Page Title'); // From page attributes
      expect(merged['data-unify']).toBeUndefined(); // Removed despite being from host
    });

    test('should_filter_null_and_undefined_attribute_values', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',
          class: null,
          title: undefined,
          role: 'button'
        }
      };

      const pageElement = {
        attributes: {
          style: 'color: blue;'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');
      expect(merged.class).toBeUndefined(); // null filtered out
      expect(merged.title).toBeUndefined(); // undefined filtered out
      expect(merged.role).toBe('button');
      expect(merged.style).toBe('color: blue;');
    });
  });

  describe('DOM Cascade v1 Specification Compliance', () => {
    test('should_implement_page_wins_except_id_and_class_rule', () => {
      const hostElement = {
        attributes: {
          id: 'host-id',          // Host wins
          class: 'host-class',    // Union
          title: 'Host Title',    // Page wins
          role: 'host-role'       // Page wins
        }
      };

      const pageElement = {
        attributes: {
          id: 'page-id',          // Host wins (ignored)
          class: 'page-class',    // Union
          title: 'Page Title',    // Page wins
          role: 'page-role'       // Page wins
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('host-id');              // Host ID wins
      expect(merged.class).toBe('host-class page-class'); // Class union
      expect(merged.title).toBe('Page Title');        // Page wins
      expect(merged.role).toBe('page-role');          // Page wins
    });

    test('should_remove_processing_directives_per_specification', () => {
      const hostElement = {
        attributes: {
          id: 'content',
          'data-unify': '/layouts/base.html' // Processing directive
        }
      };

      const pageElement = {
        attributes: {
          class: 'content-area',
          'data-unify': '/layouts/page.html' // Processing directive
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('content');
      expect(merged.class).toBe('content-area');
      expect(merged['data-unify']).toBeUndefined(); // Processing directive removed
    });

    test('should_maintain_attribute_stability_for_composition', () => {
      // ID stability is critical for DOM Cascade composition
      const hostElement = {
        attributes: {
          id: 'stable-id',
          class: 'layout-area'
        }
      };

      const pageElement = {
        attributes: {
          id: 'dynamic-id', // Should not override stable host ID
          class: 'page-content'
        }
      };

      const merged = attributeMerger.mergeAttributes(hostElement, pageElement);

      expect(merged.id).toBe('stable-id'); // Maintains stability
      expect(merged.class).toBe('layout-area page-content'); // Combines classes
    });
  });
});