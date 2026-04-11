import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { getIdentity } from '../core/identity.js';
import {
  readConfig,
  writeConfig,
  writeState,
  ensureGitignore,
  findProjectRoot,
} from '../core/config.js';
import {
  claudeMemoryPath,
  readMemoryFiles,
  shareableFiles,
  serializeMemoryFile,
  readMemoryIndex,
} from '../core/claude-memory.js';
import {
  cloneOrFetch,
  repoClonePath,
  ensureProjectStructure,
  writeMemoryFileToRepo,
  writeMemoryIndex,
  commitAndPush,
} from '../core/shared-repo.js';
import type { TribeVibeConfig } from '../models/tribevibe-config.js';
import chalk from 'chalk';

function slugFromPath(projectPath: string): string {
  return path.basename(projectPath).toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export async function initCommand(repoUrl?: string): Promise<void> {
  const cwd = process.cwd();
  const identity = getIdentity();

  // Detect project root
  let projectRoot = findProjectRoot(cwd) ?? cwd;

  // Check for existing config
  const existingConfig = readConfig(projectRoot);

  let sharedRepoUrl: string;
  if (existingConfig?.sharedRepo.url) {
    sharedRepoUrl = existingConfig.sharedRepo.url;
    console.log(chalk.blue(`Using existing shared repo: ${sharedRepoUrl}`));
  } else if (repoUrl) {
    sharedRepoUrl = repoUrl;
  } else {
    console.error(
      chalk.red('No shared repo URL found. Provide one: tribevibe init <git-url>')
    );
    process.exit(1);
  }

  const slug = existingConfig?.project.slug ?? slugFromPath(projectRoot);
  const memoryPath = claudeMemoryPath(projectRoot);

  console.log(chalk.blue(`Project: ${slug}`));
  console.log(chalk.blue(`Memory path: ${memoryPath}`));
  console.log(chalk.blue(`Cloning shared repo...`));

  // Clone or update shared repo
  const clonePath = await cloneOrFetch(sharedRepoUrl, slug);

  // Ensure project/member structure in shared repo
  ensureProjectStructure(clonePath, slug, identity.handle);

  // Write config
  const config: TribeVibeConfig = {
    version: 1,
    project: {
      slug,
      localPath: projectRoot,
      claudeMemoryPath: memoryPath,
    },
    sharedRepo: {
      url: sharedRepoUrl,
      localClonePath: repoClonePath(slug),
      branch: 'main',
      lastSynced: null,
    },
    identity,
  };

  writeConfig(projectRoot, config);
  writeState(projectRoot, { pushedHashes: {}, fileHashes: {}, activeSessionId: null });
  ensureGitignore(projectRoot);

  // Initial push of existing memory files
  const memFiles = readMemoryFiles(memoryPath);
  const toShare = shareableFiles(memFiles);

  for (const file of toShare) {
    writeMemoryFileToRepo(clonePath, slug, identity.handle, file, identity.handle);
  }

  const index = readMemoryIndex(memoryPath);
  if (index) {
    writeMemoryIndex(clonePath, slug, identity.handle, index);
  }

  if (toShare.length > 0) {
    await commitAndPush(clonePath, identity.handle);
  }

  console.log(chalk.green(`\ntribeVibe initialized!`));
  console.log(`  Shared repo: ${sharedRepoUrl}`);
  console.log(`  Identity:    ${identity.handle}`);
  console.log(`  Memory dir:  ${memoryPath}`);
  if (toShare.length > 0) {
    console.log(`  Pushed:      ${toShare.length} memory file(s)`);
  } else {
    console.log(`  No memory files to push yet.`);
  }
  console.log(
    chalk.dim(`\nCommit .tribevibe.json so teammates can run \`tribevibe init\` without a URL.`)
  );
}
