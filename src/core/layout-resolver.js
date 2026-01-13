// /**
//  * Layout Resolver
//  * Implements US-019: Default Layout Assignment with Glob Patterns integration with US-013: Basic Layout Discovery
//  * 
//  * Orchestrates the complete layout resolution precedence:
//  * 1. Explicit layouts (data-unify attributes) - highest priority
//  * 2. Default layout patterns (glob matches) - from DefaultLayoutResolver  
//  * 3. Default layout filename fallbacks - from DefaultLayoutResolver
//  * 4. Layout discovery (directory traversal) - existing mechanism
//  * 5. No layout (boilerplate generation) - lowest priority
//  */

// import { DefaultLayoutResolver } from './default-layout-resolver.js';
// import { PathValidator } from './path-validator.js';
// import { ShortNameResolver } from './short-name-resolver.js';
// import { layoutLogger } from '../utils/layout-logger.js';
// import { resolve, dirname, join, relative } from 'path';
// import { existsSync } from 'fs';

// /**
//  * LayoutResolver orchestrates all layout resolution mechanisms
//  */
// export class LayoutResolver {
//   constructor(pathValidator = new PathValidator(), logger = layoutLogger) {
//     this.pathValidator = pathValidator;
//     this.logger = logger;
//     this.defaultLayoutResolver = null; // Set via setDefaultLayouts()
//     this.shortNameResolver = new ShortNameResolver(logger); // US-027: Short name resolution
//     this.discoveryCache = new Map(); // Cache for layout discovery results
//     this.stats = {
//       explicitLayouts: 0,
//       defaultPatternMatches: 0,
//       defaultFilenameMatches: 0,
//       discoveredLayouts: 0,
//       shortNameResolutions: 0, // US-027
//       noLayoutFiles: 0,
//       cacheHits: 0,
//       cacheMisses: 0
//     };
//   }

//   /**
//    * Set default layout rules from CLI options
//    * @param {string[]} defaultLayoutRules - Array of default layout rules
//    */
//   setDefaultLayouts(defaultLayoutRules) {
//     if (defaultLayoutRules && defaultLayoutRules.length > 0) {
//       this.defaultLayoutResolver = new DefaultLayoutResolver(defaultLayoutRules);
//       this.logger.logDefaultLayoutRules(this.defaultLayoutResolver.getRules());
//     } else {
//       this.defaultLayoutResolver = null;
//       this.logger.logDebug('No default layout rules configured');
//     }
//   }

//   /**
//    * Resolve layout for a file with complete precedence handling
//    * @param {string} filePath - Path to file being processed
//    * @param {string} fileContent - Content of the file (to check for explicit layouts)
//    * @param {string} sourceRoot - Source directory root
//    * @param {Object} options - Resolution options
//    * @returns {LayoutResolution} Complete layout resolution result
//    */
//   resolveLayout(filePath, fileContent, sourceRoot, options = {}) {
//     const resolution = {
//       layoutPath: null,
//       source: 'none',
//       reason: 'No layout resolution',
//       precedenceApplied: null,
//       explicitLayout: null,
//       defaultLayoutMatch: null,
//       discoveredLayout: null,
//       resolutionChain: [],
//       processingTime: 0
//     };

//     const startTime = Date.now();

//     try {
//       this.logger.logDebug(`Starting layout resolution for ${filePath}`);
      
//       // Step 1: Check for explicit layout (data-unify attribute)
//       const explicitLayout = this._extractExplicitLayout(fileContent);
//       if (explicitLayout) {
//         this.logger.logDebug(`Found explicit layout: ${explicitLayout}`, filePath);
//         resolution.explicitLayout = explicitLayout;
//         resolution.layoutPath = this._resolveLayoutPath(explicitLayout, filePath, sourceRoot);
//         resolution.source = 'explicit';
//         resolution.reason = `Explicit data-unify: ${explicitLayout}`;
//         resolution.precedenceApplied = 'explicit';
//         resolution.resolutionChain.push({
//           step: 1,
//           type: 'explicit',
//           result: explicitLayout,
//           applied: true
//         });
        
//         // Add remaining steps as not applied
//         resolution.resolutionChain.push({
//           step: 2,
//           type: 'default-layout',
//           result: null,
//           applied: false
//         });
//         resolution.resolutionChain.push({
//           step: 3,
//           type: 'discovery',
//           result: null,
//           applied: false
//         });
        
//         this.stats.explicitLayouts++;
//         this.logger.logResolution(resolution);
//         return resolution;
//       }

//       resolution.resolutionChain.push({
//         step: 1,
//         type: 'explicit',
//         result: null,
//         applied: false
//       });

//       // Step 2: Check default layout patterns (if configured)
//       if (this.defaultLayoutResolver) {
//         this.logger.logDebug('Checking default layout patterns', filePath);
//         const defaultMatch = this.defaultLayoutResolver.resolveLayout(filePath);
//         resolution.defaultLayoutMatch = defaultMatch;
        
//         if (defaultMatch) {
//           this.logger.logDebug(`Default layout match: ${defaultMatch.source} → ${defaultMatch.layout}`, filePath);
//           resolution.layoutPath = this._resolveLayoutPath(defaultMatch.layout, filePath, sourceRoot);
//           resolution.source = defaultMatch.source === 'pattern' ? 'default-pattern' : 'default-filename';
//           resolution.reason = defaultMatch.source === 'pattern' 
//             ? `Default pattern match: ${defaultMatch.pattern} → ${defaultMatch.layout}`
//             : `Default filename fallback: ${defaultMatch.layout}`;
//           resolution.precedenceApplied = 'default-layout';
//           resolution.resolutionChain.push({
//             step: 2,
//             type: 'default-layout',
//             subType: defaultMatch.source,
//             result: defaultMatch.layout,
//             pattern: defaultMatch.pattern,
//             applied: true
//           });
          
//           if (defaultMatch.source === 'pattern') {
//             this.stats.defaultPatternMatches++;
//           } else {
//             this.stats.defaultFilenameMatches++;
//           }
          
//           // Add discovery step as not applied
//           resolution.resolutionChain.push({
//             step: 3,
//             type: 'discovery',
//             result: null,
//             applied: false
//           });
          
//           this.logger.logResolution(resolution);
//           return resolution;
//         }
//       }

//       resolution.resolutionChain.push({
//         step: 2,
//         type: 'default-layout',
//         result: null,
//         applied: false
//       });

//       // Step 3: Layout discovery (directory traversal)
//       this.logger.logDebug('Checking layout discovery', filePath);
//       const discoveredLayout = this._discoverLayout(filePath, sourceRoot);
//       resolution.discoveredLayout = discoveredLayout;
      
//       if (discoveredLayout) {
//         this.logger.logDebug(`Discovered layout: ${discoveredLayout}`, filePath);
//         resolution.layoutPath = discoveredLayout;
//         resolution.source = 'discovery';
//         resolution.reason = `Layout discovery: ${discoveredLayout}`;
//         resolution.precedenceApplied = 'discovery';
//         resolution.resolutionChain.push({
//           step: 3,
//           type: 'discovery',
//           result: discoveredLayout,
//           applied: true
//         });
//         this.stats.discoveredLayouts++;
//         this.logger.logResolution(resolution);
//         return resolution;
//       }

//       resolution.resolutionChain.push({
//         step: 3,
//         type: 'discovery',
//         result: null,
//         applied: false
//       });

//       // Step 4: No layout found
//       this.logger.logDebug('No layout found for file', filePath);
//       resolution.source = 'none';
//       resolution.reason = 'No layout found - will generate boilerplate if needed';
//       resolution.precedenceApplied = 'none';
//       this.stats.noLayoutFiles++;

//     } catch (error) {
//       this.logger.logError('Error during layout resolution', filePath, error);
//       resolution.source = 'error';
//       resolution.reason = `Error during resolution: ${error.message}`;
//       resolution.error = error.message;
//     } finally {
//       resolution.processingTime = Date.now() - startTime;
//     }

//     this.logger.logResolution(resolution);
//     return resolution;
//   }

//   /**
//    * Extract explicit layout from file content (data-unify attribute)
//    * @private
//    * @param {string} content - File content
//    * @returns {string|null} Layout path or null
//    */
//   _extractExplicitLayout(content) {
//     if (!content || typeof content !== 'string') {
//       return null;
//     }

//     // Look for data-unify attribute on html or body elements
//     const htmlMatch = content.match(/<html[^>]*data-unify=["']([^"']+)["']/i);
//     if (htmlMatch) {
//       return htmlMatch[1];
//     }

//     const bodyMatch = content.match(/<body[^>]*data-unify=["']([^"']+)["']/i);
//     if (bodyMatch) {
//       return bodyMatch[1];
//     }

//     return null;
//   }

//   /**
//    * Discover layout by traversing directory hierarchy
//    * @private
//    * @param {string} filePath - File path
//    * @param {string} sourceRoot - Source root directory
//    * @returns {string|null} Discovered layout path or null
//    */
//   _discoverLayout(filePath, sourceRoot) {
//     // Create cache key
//     const cacheKey = `${filePath}|${sourceRoot}`;
    
//     if (this.discoveryCache.has(cacheKey)) {
//       this.stats.cacheHits++;
//       return this.discoveryCache.get(cacheKey);
//     }

//     this.stats.cacheMisses++;

//     try {
//       const absoluteFilePath = resolve(filePath);
//       const absoluteSourceRoot = resolve(sourceRoot);
      
//       // Start from the file's directory
//       let currentDir = dirname(absoluteFilePath);
      
//       // Climb directory tree looking for _layout.html
//       while (currentDir.startsWith(absoluteSourceRoot) && currentDir !== absoluteSourceRoot) {
//         const layoutPath = join(currentDir, '_layout.html');
        
//         if (existsSync(layoutPath)) {
//           // Found layout - convert to relative path from source root
//           const relativeLayoutPath = relative(absoluteSourceRoot, layoutPath);
//           this.discoveryCache.set(cacheKey, relativeLayoutPath);
//           return relativeLayoutPath;
//         }
        
//         // Move up one directory
//         const parentDir = dirname(currentDir);
//         if (parentDir === currentDir) {
//           break; // Reached filesystem root
//         }
//         currentDir = parentDir;
//       }
      
//       // Check root directory _layout.html
//       const rootLayoutPath = join(absoluteSourceRoot, '_layout.html');
//       if (existsSync(rootLayoutPath)) {
//         const relativeLayoutPath = '_layout.html';
//         this.discoveryCache.set(cacheKey, relativeLayoutPath);
//         return relativeLayoutPath;
//       }
      
//       // Check _includes/layout.html as final fallback
//       const includesLayoutPath = join(absoluteSourceRoot, '_includes', 'layout.html');
//       if (existsSync(includesLayoutPath)) {
//         const relativeLayoutPath = '_includes/layout.html';
//         this.discoveryCache.set(cacheKey, relativeLayoutPath);
//         return relativeLayoutPath;
//       }
      
//       // No layout found
//       this.discoveryCache.set(cacheKey, null);
//       return null;
      
//     } catch (error) {
//       // Cache the failure
//       this.discoveryCache.set(cacheKey, null);
//       return null;
//     }
//   }

//   /**
//    * Resolve layout path relative to source root with short name resolution support
//    * @private
//    * @param {string} layoutPath - Layout path from resolution
//    * @param {string} filePath - File being processed
//    * @param {string} sourceRoot - Source root directory
//    * @returns {string} Resolved layout path
//    */
//   _resolveLayoutPath(layoutPath, filePath, sourceRoot) {
//     // If layout path is already absolute or starts with /, resolve from source root
//     if (layoutPath.startsWith('/')) {
//       const resolvedPath = join(sourceRoot, layoutPath.substring(1));
//       if (existsSync(resolvedPath)) {
//         return resolvedPath;
//       }
//       // US-027: Try short name resolution if exact path doesn't exist
//       return this._tryShortNameResolution(layoutPath.substring(1), filePath, sourceRoot) || resolvedPath;
//     }
    
//     // If layout path is relative, resolve from file's directory
//     if (layoutPath.startsWith('./') || layoutPath.startsWith('../')) {
//       const fileDir = dirname(resolve(filePath));
//       const resolvedPath = resolve(fileDir, layoutPath);
//       if (existsSync(resolvedPath)) {
//         return resolvedPath;
//       }
//       // US-027: Try short name resolution if exact path doesn't exist
//       const baseName = layoutPath.replace(/^\.\.?\//, '').replace(/\.html?$/, '');
//       return this._tryShortNameResolution(baseName, filePath, sourceRoot) || resolvedPath;
//     }
    
//     // Check if it's a direct file path from source root
//     const directPath = join(sourceRoot, layoutPath);
//     if (existsSync(directPath)) {
//       return directPath;
//     }
    
//     // US-027: Try short name resolution for simple names
//     const shortNameResult = this._tryShortNameResolution(layoutPath.replace(/\.html?$/, ''), filePath, sourceRoot);
//     if (shortNameResult) {
//       return shortNameResult;
//     }
    
//     // Fallback to original behavior
//     return directPath;
//   }

//   /**
//    * Try short name resolution for a layout
//    * @private
//    * @param {string} shortName - Short name to resolve
//    * @param {string} filePath - File being processed
//    * @param {string} sourceRoot - Source root directory
//    * @returns {string|null} Resolved path or null if not found
//    */
//   _tryShortNameResolution(shortName, filePath, sourceRoot) {
//     try {
//       const fileDir = dirname(resolve(filePath));
//       const result = this.shortNameResolver.resolve(shortName, fileDir, sourceRoot);
      
//       if (result.found) {
//         this.logger.logDebug(`Short name resolved: ${shortName} → ${result.layoutPath}`, filePath);
//         this.stats.shortNameResolutions++;
//         return result.layoutPath;
//       }
      
//       this.logger.logDebug(`Short name resolution failed: ${shortName}`, filePath);
//       return null;
//     } catch (error) {
//       this.logger.logDebug(`Error in short name resolution: ${error.message}`, filePath);
//       return null;
//     }
//   }

//   /**
//    * Get resolution statistics
//    * @returns {Object} Statistics object
//    */
//   getStats() {
//     return { ...this.stats };
//   }

//   /**
//    * Log current statistics
//    */
//   logStats() {
//     this.logger.logStatistics(this.stats);
//   }

//   /**
//    * Clear discovery cache
//    */
//   clearCache() {
//     this.discoveryCache.clear();
//     this.stats.cacheHits = 0;
//     this.stats.cacheMisses = 0;
//   }

//   /**
//    * Reset all statistics
//    */
//   resetStats() {
//     this.stats = {
//       explicitLayouts: 0,
//       defaultPatternMatches: 0,
//       defaultFilenameMatches: 0,
//       discoveredLayouts: 0,
//       shortNameResolutions: 0, // US-027
//       noLayoutFiles: 0,
//       cacheHits: 0,
//       cacheMisses: 0
//     };
//   }

//   /**
//    * Check if a layout path exists and is valid
//    * @param {string} layoutPath - Layout path to check
//    * @param {string} sourceRoot - Source root directory
//    * @returns {boolean} True if layout exists and is valid
//    */
//   validateLayoutExists(layoutPath, sourceRoot) {
//     try {
//       this.pathValidator.validatePath(layoutPath, sourceRoot);
//       const resolvedPath = this._resolveLayoutPath(layoutPath, '', sourceRoot);
//       return existsSync(resolvedPath);
//     } catch (error) {
//       return false;
//     }
//   }

//   /**
//    * Get debug information for layout resolution
//    * @param {string} filePath - File path that was resolved
//    * @returns {Object} Debug information
//    */
//   getDebugInfo(filePath) {
//     const defaultResolution = this.defaultLayoutResolver?.getLastResolution();
    
//     return {
//       filePath: filePath,
//       hasDefaultLayoutResolver: !!this.defaultLayoutResolver,
//       defaultLayoutRules: this.defaultLayoutResolver?.getRules() || [],
//       lastDefaultResolution: defaultResolution,
//       cacheSize: this.discoveryCache.size,
//       stats: this.getStats()
//     };
//   }
// }