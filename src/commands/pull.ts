import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { requireConfig } from '../core/config.js';
import { appendTeammatesSection } from '../core/claude-memory.js';
import { SHAREABLE_TYPES } from '../models/memory-file.js';
import {
  git,
  listTeammateHandles,
  readTeammateMemoryFiles,
} from '../core/shared-repo.js';
import chalk from 'chalk';

export async function pullCommand(): Promise<void> {
  const { config } = requireConfig();
  const { project, sharedRepo, identity } = config;

  const clonePath = sharedRepo.localClonePath;

  console.log(chalk.blue('Fetching from shared repo...'));
  await git(clonePath).pull('origin', sharedRepo.branch, { '--rebase': 'false' });

  const teammates = listTeammateHandles(clonePath, project.slug, identity.handle);

  if (teammates.length === 0) {
    console.log(chalk.dim('No teammates found in shared repo yet.'));
    return;
  }

  const memoryDir = project.claudeMemoryPath;
  fs.mkdirSync(memoryDir, { recursive: true });

  const pulledFiles: Array<{ handle: string; file: import('../models/memory-file.js').MemoryFile }> = [];

  for (const handle of teammates) {
    const files = readTeammateMemoryFiles(clonePath, project.slug, handle);
    const shareable = files.filter((f) => SHAREABLE_TYPES.includes(f.type));

    for (const file of shareable) {
      // Write with namespaced filename: <handle>--<original-filename>
      const localFilename = `${handle}--${file.filename}`;
      const localPath = path.join(memoryDir, localFilename);

      const fm: Record<string, unknown> = {
        name: file.name,
        description: file.description,
        type: file.type,
        tv_author: file.tv_author ?? handle,
        tv_updated: file.tv_updated ?? new Date().toISOString(),
        tv_source: handle,
      };

      fs.writeFileSync(localPath, matter.stringify(file.content, fm));
      pulledFiles.push({ handle, file: { ...file, filename: localFilename } });
    }
  }

  // Rebuild MEMORY.md teammates section
  appendTeammatesSection(memoryDir, pulledFiles);

  if (pulledFiles.length > 0) {
    const byHandle = new Map<string, number>();
    for (const { handle } of pulledFiles) {
      byHandle.set(handle, (byHandle.get(handle) ?? 0) + 1);
    }
    console.log(chalk.green(`Pulled ${pulledFiles.length} file(s) from ${teammates.length} teammate(s):`));
    for (const [handle, count] of byHandle) {
      console.log(`  ${handle}: ${count} file(s)`);
    }
  } else {
    console.log(chalk.dim(`No shareable files from teammates yet.`));
  }
}
