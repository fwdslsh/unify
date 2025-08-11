import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import { UnifyError } from '../utils/errors.js';
import { RepositoryService, DEFAULT_ORG, DEFAULT_REPO, KNOWN_STARTERS } from '../utils/repository-service.js';

const repositoryService = new RepositoryService();

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
    const exists = await repositoryService.repositoryExists(org, repo);
    
    if (!exists) {
      logger.warn(`Starter template '${template}' not found at ${org}/${repo}`);
      
      // Check which known starters exist
      const availableStarters = [];
      for (const starter of KNOWN_STARTERS) {
        const starterRepo = `${DEFAULT_REPO}-${starter}`;
        if (await repositoryService.repositoryExists(org, starterRepo)) {
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
    await repositoryService.downloadAndExtract(org, repo, currentDir, logger);
    
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