import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { UnifyError } from '../utils/errors.js';

/**
 * Default GitHub organization and repository for starter templates
 */
const DEFAULT_ORG = 'fwdslsh';
const DEFAULT_REPO = 'unify-starter';

/**
 * Known starter template repositories for suggestions
 */
const KNOWN_STARTERS = [
  'basic',
  'blog', 
  'docs',
  'portfolio'
];

/**
 * Downloads and extracts a GitHub repository tarball
 * @param {string} org - GitHub organization
 * @param {string} repo - Repository name  
 * @param {string} targetDir - Directory to extract to
 */
async function downloadAndExtract(org, repo, targetDir) {
  // Try direct tarball download first to avoid rate limiting
  const fallbackUrl = `https://api.github.com/repos/${org}/${repo}/tarball`;
  
  logger.debug(`Downloading repository from: ${fallbackUrl}`);
  
  try {
    const response = await fetch(fallbackUrl);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new UnifyError(
          `Repository not found: ${org}/${repo}`,
          null,
          null,
          [
            'Check the repository name for typos',
            'Verify the repository exists and is public',
            `Try using the default starter: unify init`,
            `Available starters: ${KNOWN_STARTERS.join(', ')}`
          ]
        );
      } else if (response.status === 403) {
        throw new UnifyError(
          'GitHub API rate limit exceeded or access denied',
          null,
          null,
          [
            'Wait a few minutes and try again',
            'Check your internet connection',
            'The repository may not be publicly accessible'
          ]
        );
      }
      throw new Error(`Failed to download: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const tarData = new Uint8Array(arrayBuffer);
    
    // Extract the tarball using Bun's built-in capabilities
    await extractTarball(tarData, targetDir);
    
  } catch (error) {
    if (error instanceof UnifyError) {
      throw error;
    }
    throw new UnifyError(
      `Failed to download starter template: ${error.message}`,
      null,
      null,
      [
        'Check your internet connection',
        'Verify the repository exists and is accessible',
        'Try using the default starter template'
      ]
    );
  }
}

/**
 * Extracts a gzipped tarball to the target directory
 * @param {Uint8Array} tarData - The tarball data
 * @param {string} targetDir - Directory to extract to
 */
async function extractTarball(tarData, targetDir) {
  const tempFile = path.join('/tmp', `unify-starter-${Date.now()}.tar.gz`);
  
  try {
    // Write tarball to temp file
    await fs.writeFile(tempFile, tarData);
    
    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });
    
    // Use Bun's shell to extract
    const proc = Bun.spawn(['tar', '-xzf', tempFile, '-C', targetDir, '--strip-components=1'], {
      stderr: 'pipe',
      stdout: 'pipe'
    });
    
    const result = await proc.exited;
    
    if (result !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Extraction failed: ${stderr}`);
    }
    
    logger.debug('Tarball extracted successfully');
    
  } catch (error) {
    if (error.message.includes('tar:')) {
      throw new UnifyError(
        'Failed to extract starter template archive',
        null,
        null,
        [
          'The downloaded archive may be corrupted',
          'tar command may not be available on your system',
          'Try again or download the starter manually'
        ]
      );
    }
    throw error;
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempFile);
    } catch (error) {
      // Ignore cleanup errors
      logger.debug(`Failed to cleanup temp file: ${error.message}`);
    }
  }
}

/**
 * Checks if a directory is empty or doesn't exist
 * @param {string} dir - Directory to check
 * @returns {boolean} True if empty or doesn't exist
 */
async function isDirectoryEmpty(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.length === 0;
  } catch (error) {
    // Directory doesn't exist
    return true;
  }
}

/**
 * Checks if a GitHub repository exists by trying to download it
 * @param {string} org - GitHub organization
 * @param {string} repo - Repository name
 * @returns {boolean} True if repository exists
 */
async function repositoryExists(org, repo) {
  try {
    const response = await fetch(`https://api.github.com/repos/${org}/${repo}/tarball`, {
      method: 'HEAD' // Use HEAD to avoid downloading the tarball
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Main init command implementation
 * @param {Object} args - Parsed command line arguments
 */
export async function init(args) {
  const currentDir = process.cwd();
  const template = args.template || '';
  
  logger.debug(`Initializing project in: ${currentDir}`);
  logger.debug(`Template requested: ${template || 'default'}`);
  
  // Check if current directory is empty
  if (!(await isDirectoryEmpty(currentDir))) {
    const files = await fs.readdir(currentDir);
    logger.warn(`Current directory is not empty (contains ${files.length} items)`);
    logger.info('Continuing with initialization...');
  }
  
  // Determine which repository to use
  let org = DEFAULT_ORG;
  let repo = DEFAULT_REPO;
  
  if (template) {
    repo = `${DEFAULT_REPO}-${template}`;
    
    // Check if the requested starter template exists
    const exists = await repositoryExists(org, repo);
    
    if (!exists) {
      logger.warn(`Starter template '${template}' not found at ${org}/${repo}`);
      
      // Check which known starters exist
      const availableStarters = [];
      for (const starter of KNOWN_STARTERS) {
        const starterRepo = `${DEFAULT_REPO}-${starter}`;
        if (await repositoryExists(org, starterRepo)) {
          availableStarters.push(starter);
        }
      }
      
      const suggestions = [
        'Use the default starter: unify init',
        availableStarters.length > 0 
          ? `Available starters: ${availableStarters.join(', ')}`
          : 'No alternative starters found',
        'Check the template name for typos',
        'Verify the repository exists and is public'
      ];
      
      throw new UnifyError(
        `Starter template '${template}' not found`,
        null,
        null,
        suggestions
      );
    }
  }
  
  logger.info(`Downloading starter template from ${org}/${repo}...`);
  
  try {
    await downloadAndExtract(org, repo, currentDir);
    
    logger.info('✅ Project initialized successfully!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Review the generated files');
    logger.info('  2. Run `unify build` to build your site');
    logger.info('  3. Run `unify serve` to start the development server');
    
  } catch (error) {
    if (error instanceof UnifyError) {
      throw error;
    }
    throw new UnifyError(
      `Failed to initialize project: ${error.message}`,
      null,
      null,
      [
        'Check your internet connection',
        'Verify GitHub is accessible',
        'Try again with the default starter: unify init'
      ]
    );
  }
}