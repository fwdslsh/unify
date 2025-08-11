export const DEFAULT_ORG = 'fwdslsh';
export const DEFAULT_REPO = 'unify-starter';
export const KNOWN_STARTERS = [
  'basic',
  'blog',
  'docs',
  'portfolio'
];

export class RepositoryService {
  constructor(fetchFunction) {
    this.fetchFunction = fetchFunction || fetch;
  }

  async repositoryExists(org, repo) {
    try {
      const response = await this.fetchFunction(`https://api.github.com/repos/${org}/${repo}/tarball`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async downloadAndExtract(org, repo, targetDir, logger) {
    const fallbackUrl = `https://api.github.com/repos/${org}/${repo}/tarball`;
    logger?.debug?.(`Downloading repository from: ${fallbackUrl}`);
    try {
      const response = await this.fetchFunction(fallbackUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found: ${org}/${repo}`);
        } else if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded or access denied');
        }
        throw new Error(`Failed to download: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const tarData = new Uint8Array(arrayBuffer);
      await this.extractTarball(tarData, targetDir, logger);
    } catch (error) {
      throw new Error(`Failed to download starter template: ${error.message}`);
    }
  }

  async extractTarball(tarData, targetDir, logger) {
    const path = (await import('path')).default;
    const fs = (await import('fs/promises')).default;
    const tempFile = path.join('/tmp', `unify-starter-${Date.now()}.tar.gz`);
    try {
      await fs.writeFile(tempFile, tarData);
      await fs.mkdir(targetDir, { recursive: true });
      const Bun = (await import('bun')).default;
      const proc = Bun.spawn(['tar', '-xzf', tempFile, '-C', targetDir, '--strip-components=1'], {
        stderr: 'pipe',
        stdout: 'pipe'
      });
      const result = await proc.exited;
      if (result !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Extraction failed: ${stderr}`);
      }
      logger?.debug?.('Tarball extracted successfully');
    } catch (error) {
      throw error;
    } finally {
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        logger?.debug?.(`Failed to cleanup temp file: ${error.message}`);
      }
    }
  }
}
