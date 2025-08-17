import { test, expect, describe } from 'bun:test';
import { BuildConfig, createBuildConfig } from '../../src/core/build-config.js';

describe('BuildConfig', () => {
  describe('Default Configuration', () => {
    test('should create BuildConfig with default values', () => {
      const config = new BuildConfig();
      
      expect(config.getIncludesDir()).toBe('_includes');
      expect(config.getLayoutsDir()).toBe(null); // Auto-discovery
      expect(config.getLayoutFilename()).toBe('layout.html');
      expect(config.getConfig().componentPattern).toBe('_*');
      expect(config.getConfig().layoutPattern).toBe('*layout.html|*layout.htm');
    });

    test('should create BuildConfig with custom options', () => {
      const options = {
        includesDir: 'components',
        layoutsDir: 'layouts',
        componentPattern: '*.component.*',
        layoutPattern: '*.layout.*',
        layoutFilename: 'default.layout.html'
      };
      
      const config = new BuildConfig(options);
      
      expect(config.getIncludesDir()).toBe('components');
      expect(config.getLayoutsDir()).toBe('layouts');
      expect(config.getLayoutFilename()).toBe('default.layout.html');
      expect(config.getConfig().componentPattern).toBe('*.component.*');
      expect(config.getConfig().layoutPattern).toBe('*.layout.*');
    });
  });

  describe('Pattern Matching', () => {
    test('should match underscore pattern by default', () => {
      const config = new BuildConfig();
      
      expect(config.isNonEmittingFile('_header.html')).toBe(true);
      expect(config.isNonEmittingFile('_sidebar.html')).toBe(true);
      expect(config.isNonEmittingFile('header.html')).toBe(false);
      expect(config.isNonEmittingFile('index.html')).toBe(false);
    });

    test('should match custom component pattern', () => {
      const config = new BuildConfig({
        componentPattern: '*.component.*'
      });
      
      expect(config.isNonEmittingFile('card.component.html')).toBe(true);
      expect(config.isNonEmittingFile('nav.component.html')).toBe(true);
      expect(config.isNonEmittingFile('_old-style.html')).toBe(false);
      expect(config.isNonEmittingFile('index.html')).toBe(false);
    });

    test('should match default layout pattern', () => {
      const config = new BuildConfig();
      
      expect(config.isLayoutFile('_layout.html')).toBe(true);
      expect(config.isLayoutFile('_blog.layout.html')).toBe(true);
      expect(config.isLayoutFile('_docs.layout.htm')).toBe(true);
      expect(config.isLayoutFile('layout.html')).toBe(true);
      expect(config.isLayoutFile('blog.layout.html')).toBe(true);
      expect(config.isLayoutFile('header.html')).toBe(false);
      expect(config.isLayoutFile('_component.html')).toBe(false);
    });

    test('should match custom layout pattern', () => {
      const config = new BuildConfig({
        layoutPattern: '*.layout.*|default.*'
      });
      
      expect(config.isLayoutFile('blog.layout.html')).toBe(true);
      expect(config.isLayoutFile('card.layout.htm')).toBe(true);
      expect(config.isLayoutFile('default.html')).toBe(true);
      expect(config.isLayoutFile('default.htm')).toBe(true);
      expect(config.isLayoutFile('_old-style.layout.html')).toBe(true); // This should match *.layout.*
      expect(config.isLayoutFile('header.html')).toBe(false);
      expect(config.isLayoutFile('component.html')).toBe(false);
    });
  });

  describe('Directory Methods', () => {
    test('should detect non-emitting directories with default pattern', () => {
      const config = new BuildConfig();
      
      expect(config.isNonEmittingDirectory('_includes')).toBe(true);
      expect(config.isNonEmittingDirectory('_layouts')).toBe(true);
      expect(config.isNonEmittingDirectory('pages/_partials')).toBe(true);
      expect(config.isNonEmittingDirectory('pages/blog')).toBe(false);
      expect(config.isNonEmittingDirectory('assets')).toBe(false);
    });

    test('should detect non-emitting directories with custom pattern', () => {
      const config = new BuildConfig({
        componentPattern: '*.component.*'
      });
      
      expect(config.isNonEmittingDirectory('_includes')).toBe(false);
      expect(config.isNonEmittingDirectory('components')).toBe(false);
      expect(config.isNonEmittingDirectory('card.component.html')).toBe(false); // Not a directory check
    });

    test('should get non-emitting directories list', () => {
      const config1 = new BuildConfig();
      expect(config1.getNonEmittingDirectories()).toEqual(['_includes']);

      const config2 = new BuildConfig({
        includesDir: 'components',
        layoutsDir: 'layouts'
      });
      expect(config2.getNonEmittingDirectories()).toEqual(['components', 'layouts']);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate valid configuration', () => {
      const config = new BuildConfig({
        includesDir: 'components',
        layoutsDir: 'layouts',
        componentPattern: '*.component.*',
        layoutPattern: '*.layout.*',
        layoutFilename: 'default.html'
      });
      
      expect(() => config.validate()).not.toThrow();
    });

    test('should reject same includes and layouts directory', () => {
      const config = new BuildConfig({
        includesDir: 'shared',
        layoutsDir: 'shared'
      });
      
      expect(() => config.validate()).toThrow('Includes directory and layouts directory cannot be the same');
    });

    test('should reject empty component pattern', () => {
      const config = new BuildConfig({
        componentPattern: ''
      });
      
      expect(() => config.validate()).toThrow('Component pattern cannot be empty');
    });

    test('should reject empty layout pattern', () => {
      const config = new BuildConfig({
        layoutPattern: ''
      });
      
      expect(() => config.validate()).toThrow('Layout pattern cannot be empty');
    });

    test('should reject empty layout filename', () => {
      const config = new BuildConfig({
        layoutFilename: ''
      });
      
      expect(() => config.validate()).toThrow('Layout filename cannot be empty');
    });
  });

  describe('createBuildConfig Factory', () => {
    test('should create and validate configuration', () => {
      const config = createBuildConfig({
        includesDir: 'components',
        componentPattern: '*.component.*'
      });
      
      expect(config).toBeInstanceOf(BuildConfig);
      expect(config.getIncludesDir()).toBe('components');
    });

    test('should throw for invalid configuration', () => {
      expect(() => createBuildConfig({
        includesDir: 'shared',
        layoutsDir: 'shared'
      })).toThrow('Includes directory and layouts directory cannot be the same');
    });
  });

  describe('Configuration Updates', () => {
    test('should update configuration dynamically', () => {
      const config = new BuildConfig();
      
      expect(config.getIncludesDir()).toBe('_includes');
      
      config.update({
        includesDir: 'components',
        componentPattern: '*.component.*'
      });
      
      expect(config.getIncludesDir()).toBe('components');
      expect(config.isNonEmittingFile('card.component.html')).toBe(true);
      expect(config.isNonEmittingFile('_old.html')).toBe(false);
    });
  });
});