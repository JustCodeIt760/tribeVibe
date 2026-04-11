import { requireConfig, readState, writeState } from '../core/config.js';
import {
  readMemoryFiles,
  shareableFiles,
  readMemoryIndex,
  contentHash,
} from '../core/claude-memory.js';
import {
  writeMemoryFileToRepo,
  writeMemoryIndex,
  commitAndPush,
  git,
} from '../core/shared-repo.js';
import chalk from 'chalk';

export async function pushCommand(): Promise<void> {
  const { config, projectRoot } = requireConfig();
  const { project, sharedRepo, identity } = config;
  const state = readState(projectRoot);

  const clonePath = sharedRepo.localClonePath;

  // Fetch latest before pushing to avoid conflicts
  try {
    await git(clonePath).fetch(['--all']);
    await git(clonePath).pull('origin', sharedRepo.branch, { '--rebase': 'false' });
  } catch {
    // If pull fails (e.g. no remote yet), continue
  }

  const allFiles = readMemoryFiles(project.claudeMemoryPath);
  const toShare = shareableFiles(allFiles);

  let pushed = 0;
  let skipped = 0;

  for (const file of toShare) {
    const prevHash = state.fileHashes[file.filename];
    if (prevHash === file.contentHash) {
      skipped++;
      continue;
    }
    writeMemoryFileToRepo(clonePath, project.slug, identity.handle, file, identity.handle);
    state.fileHashes[file.filename] = file.contentHash;
    pushed++;
  }

  // Push MEMORY.md index
  const index = readMemoryIndex(project.claudeMemoryPath);
  if (index) {
    const idxHash = contentHash(index);
    if (state.fileHashes['MEMORY.md'] !== idxHash) {
      writeMemoryIndex(clonePath, project.slug, identity.handle, index);
      state.fileHashes['MEMORY.md'] = idxHash;
    }
  }

  if (pushed > 0) {
    await commitAndPush(clonePath, identity.handle, sharedRepo.branch);
    config.sharedRepo.lastSynced = new Date().toISOString();
  }

  writeState(projectRoot, state);

  if (pushed > 0) {
    console.log(chalk.green(`Pushed ${pushed} file(s).`) + chalk.dim(` (${skipped} unchanged)`));
  } else {
    console.log(chalk.dim(`Nothing to push. (${skipped} file(s) unchanged)`));
  }
}
