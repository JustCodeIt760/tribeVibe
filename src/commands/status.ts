import { requireConfig, readState } from '../core/config.js';
import { readMemoryFiles, shareableFiles } from '../core/claude-memory.js';
import {
  git,
  listTeammateHandles,
  readTeammateMemoryFiles,
  readTeammateActiveSessions,
  memberMemoryDir,
} from '../core/shared-repo.js';
import { SHAREABLE_TYPES } from '../models/memory-file.js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export async function statusCommand(): Promise<void> {
  const { config, projectRoot } = requireConfig();
  const { project, sharedRepo, identity } = config;
  const state = readState(projectRoot);

  const clonePath = sharedRepo.localClonePath;

  // Fetch without merging to get latest remote state
  try {
    await git(clonePath).fetch(['--all']);
  } catch {
    console.log(chalk.yellow('Could not reach remote. Showing local state only.'));
  }

  // Local changes not yet pushed
  const allLocal = readMemoryFiles(project.claudeMemoryPath);
  const shareable = shareableFiles(allLocal);
  const unpushed: Array<{ file: string; status: 'new' | 'modified' }> = [];

  for (const file of shareable) {
    const prevHash = state.fileHashes[file.filename];
    if (!prevHash) {
      unpushed.push({ file: file.name, status: 'new' });
    } else if (prevHash !== file.contentHash) {
      unpushed.push({ file: file.name, status: 'modified' });
    }
  }

  // Teammate updates
  const teammates = listTeammateHandles(clonePath, project.slug, identity.handle);
  const teammateUpdates: Array<{ handle: string; count: number }> = [];

  for (const handle of teammates) {
    const files = readTeammateMemoryFiles(clonePath, project.slug, handle).filter(
      (f) => SHAREABLE_TYPES.includes(f.type)
    );
    if (files.length > 0) {
      teammateUpdates.push({ handle, count: files.length });
    }
  }

  // Active sessions from teammates
  const activeSessions: Array<{ handle: string; description: string; startedAt: string }> = [];
  for (const handle of teammates) {
    const sessions = readTeammateActiveSessions(clonePath, project.slug, handle);
    for (const s of sessions) {
      activeSessions.push({ handle, description: s.description, startedAt: s.started_at });
    }
  }

  // Own active session
  const { activeSessionId } = state;

  // Print status
  console.log(chalk.bold('\ntribeVibe Status'));
  console.log(chalk.dim(`Identity: ${identity.handle}  Project: ${project.slug}`));
  console.log();

  if (activeSessionId) {
    console.log(chalk.yellow(`Active session: ${activeSessionId}`));
    console.log();
  }

  if (unpushed.length === 0) {
    console.log(chalk.dim('Local: nothing to push'));
  } else {
    console.log(chalk.bold('Local changes to push:'));
    for (const { file, status } of unpushed) {
      const tag = status === 'new' ? chalk.green('A') : chalk.yellow('M');
      console.log(`  ${tag}  ${file}`);
    }
  }
  console.log();

  if (teammateUpdates.length === 0) {
    console.log(chalk.dim('Teammates: no updates to pull'));
  } else {
    console.log(chalk.bold('Teammate updates to pull:'));
    for (const { handle, count } of teammateUpdates) {
      console.log(`  ${chalk.cyan(handle)}  ${count} file(s)`);
    }
  }
  console.log();

  if (activeSessions.length === 0) {
    console.log(chalk.dim('No active teammate sessions'));
  } else {
    console.log(chalk.bold('Active teammate sessions:'));
    for (const { handle, description, startedAt } of activeSessions) {
      const ago = formatAgo(startedAt);
      console.log(`  ${chalk.cyan(handle)}  "${description}" ${chalk.dim(`(${ago})`)}`);
    }
  }
  console.log();
}

function formatAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
