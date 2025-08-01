/**
 * Sitemap Generation for unify
 * Auto-generates XML sitemap for SEO and search engines
 */

import path from 'path';
import { logger } from '../utils/logger.js';
import { isHtmlFile, isPartialFile } from '../utils/path-resolver.js';
import { isMarkdownFile } from './markdown-processor.js';

/**
 * Generate sitemap.xml content for all processed pages
 * @param {Array<Object>} pages - Array of page information
 * @param {string} baseUrl - Base URL for the site (e.g., 'https://example.com')
 * @param {Object} options - Sitemap generation options
 * @returns {string} XML sitemap content
 */
export function generateSitemap(pages, baseUrl, options = {}) {
  const {
    changefreq = 'weekly',
    priority = '0.8',
    lastmod = new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
  } = options;

  // Remove trailing slash from baseUrl
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  for (const page of pages) {
    const url = `${cleanBaseUrl}${page.url}`;
    const pagePriority = page.priority || priority;
    const pageChangefreq = page.changefreq || changefreq;
    const pageLastmod = page.lastmod || lastmod;

    xml += `
  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${pageLastmod}</lastmod>
    <changefreq>${pageChangefreq}</changefreq>
    <priority>${pagePriority}</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return xml;
}

/**
 * Extract page information from processed files for sitemap generation
 * @param {Array<string>} processedFiles - Array of processed file paths
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {boolean} prettyUrls - Whether pretty URLs are enabled
 * @returns {Array<Object>} Array of page information objects
 */
export function extractPageInfo(processedFiles, sourceRoot, outputRoot, prettyUrls = false) {
  const pages = [];

  for (const filePath of processedFiles) {
    // Skip partial files
    if (isPartialFile(filePath)) {
      continue;
    }

    // Only include HTML and Markdown files
    if (!isHtmlFile(filePath) && !isMarkdownFile(filePath)) {
      continue;
    }

    const relativePath = path.relative(sourceRoot, filePath);
    let url;

    if (isMarkdownFile(filePath)) {
      if (prettyUrls) {
        // Convert about.md → /about/
        const nameWithoutExt = path.basename(relativePath, path.extname(relativePath));
        const dir = path.dirname(relativePath);
        
        if (nameWithoutExt === 'index') {
          url = dir === '.' ? '/' : `/${dir}/`;
        } else {
          url = dir === '.' ? `/${nameWithoutExt}/` : `/${dir}/${nameWithoutExt}/`;
        }
      } else {
        // Convert about.md → /about.html
        url = '/' + relativePath.replace(/\.md$/i, '.html');
      }
    } else {
      // HTML files
      url = '/' + relativePath;
      
      // Convert index.html to root path
      if (url.endsWith('/index.html')) {
        url = url.replace('/index.html', '/');
      }
    }

    // Normalize URL paths
    url = url.replace(/\/+/g, '/'); // Remove double slashes
    if (url !== '/' && url.endsWith('/')) {
      // Keep trailing slash for directories when using pretty URLs
    }

    pages.push({
      url,
      path: filePath,
      relativePath,
      // Default values - can be enhanced with frontmatter data later
      priority: getPagePriority(url),
      changefreq: getPageChangefreq(url),
      lastmod: new Date().toISOString().split('T')[0]
    });
  }

  // Sort pages by URL for consistent output
  pages.sort((a, b) => a.url.localeCompare(b.url));

  logger.debug(`Generated sitemap info for ${pages.length} pages`);
  return pages;
}

/**
 * Get default priority based on URL patterns
 * @param {string} url - Page URL
 * @returns {string} Priority value (0.0 to 1.0)
 */
function getPagePriority(url) {
  // Homepage gets highest priority
  if (url === '/') {
    return '1.0';
  }
  
  // Top-level pages get high priority
  if (url.split('/').length <= 2) {
    return '0.8';
  }
  
  // Deeper pages get lower priority
  return '0.6';
}

/**
 * Get default change frequency based on URL patterns
 * @param {string} url - Page URL
 * @returns {string} Change frequency
 */
function getPageChangefreq(url) {
  // Homepage changes more frequently
  if (url === '/') {
    return 'daily';
  }
  
  // Blog posts or time-sensitive content
  if (url.includes('/blog/') || url.includes('/news/')) {
    return 'weekly';
  }
  
  // Most pages change monthly
  return 'monthly';
}

/**
 * Escape XML special characters
 * @param {string} str - String to escape
 * @returns {string} XML-escaped string
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Enhance page information with frontmatter data
 * @param {Array<Object>} pages - Array of page objects
 * @param {Map<string, Object>} frontmatterData - Map of file paths to frontmatter
 * @returns {Array<Object>} Enhanced page objects
 */
export function enhanceWithFrontmatter(pages, frontmatterData) {
  return pages.map(page => {
    const frontmatter = frontmatterData.get(page.path) || {};
    
    return {
      ...page,
      priority: frontmatter.sitemap_priority || page.priority,
      changefreq: frontmatter.sitemap_changefreq || page.changefreq,
      lastmod: frontmatter.sitemap_lastmod || frontmatter.date || page.lastmod,
      // Additional metadata for potential future use
      title: frontmatter.title || '',
      description: frontmatter.description || frontmatter.excerpt || ''
    };
  });
}

/**
 * Write sitemap.xml file to output directory
 * @param {string} sitemapContent - XML sitemap content
 * @param {string} outputRoot - Output root directory
 * @returns {Promise<void>}
 */
export async function writeSitemap(sitemapContent, outputRoot) {
  const fs = await import('fs/promises');
  const sitemapPath = path.join(outputRoot, 'sitemap.xml');
  
  try {
    await fs.writeFile(sitemapPath, sitemapContent, 'utf-8');
    logger.info(`Generated sitemap.xml with ${sitemapContent.split('<url>').length - 1} pages`);
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error(`Failed to write sitemap.xml: ${error.message}`);
    }
    throw error;
  }
}