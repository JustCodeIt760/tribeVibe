import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import matter from 'gray-matter';
import { requireConfig, readState, writeState } from '../core/config.js';
import {
  memberSessionDir,
  commitAndPush,
  git,
} from '../core/shared-repo.js';
import { sessionTemplate } from '../models/session-note.js';
import chalk from 'chalk';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export async function sessionStartCommand(description: string): Promise<void> {
  const { config, projectRoot } = requireConfig();
  const { project, sharedRepo, identity } = config;
  const state = readState(projectRoot);

  if (state.activeSessionId) {
    console.log(chalk.yellow(`Session already active: ${state.activeSessionId}`));
    console.log(chalk.dim('Run `tribevibe session end` to close it first.'));
    return;
  }

  const id = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const datePrefix = startedAt.slice(0, 10);
  const filename = `${datePrefix}-${slugify(description)}.md`;

  const clonePath = sharedRepo.localClonePath;
  const sessionDir = memberSessionDir(clonePath, project.slug, identity.handle);
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionPath = path.join(sessionDir, filename);
  const content = sessionTemplate(id, identity.handle, project.slug, description, startedAt);
  fs.writeFileSync(sessionPath, content);

  await git(clonePath).fetch(['--all']).catch(() => {});
  await git(clonePath).pull('origin', sharedRepo.branch, { '--rebase': 'false' }).catch(() => {});
  await commitAndPush(clonePath, identity.handle, sharedRepo.branch);

  state.activeSessionId = filename;
  writeState(projectRoot, state);

  console.log(chalk.green(`Session started: "${description}"`));
  console.log(chalk.dim(`  File: ${filename}`));
  console.log(chalk.dim(`  Run \`tribevibe session end\` when done.`));
}

export async function sessionEndCommand(): Promise<void> {
  const { config, projectRoot } = requireConfig();
  const { project, sharedRepo, identity } = config;
  const state = readState(projectRoot);

  if (!state.activeSessionId) {
    console.log(chalk.yellow('No active session. Run `tribevibe session start <description>` first.'));
    return;
  }

  const clonePath = sharedRepo.localClonePath;
  const sessionDir = memberSessionDir(clonePath, project.slug, identity.handle);
  const sessionPath = path.join(sessionDir, state.activeSessionId);

  if (!fs.existsSync(sessionPath)) {
    console.error(chalk.red(`Session file not found: ${sessionPath}`));
    process.exit(1);
  }

  // Open in editor for the user to fill in notes
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'vi';
  console.log(chalk.blue(`Opening session note in ${editor}...`));
  console.log(chalk.dim('Fill in "Context for Teammates" and "Next Steps", then save and exit.'));

  spawnSync(editor, [sessionPath], { stdio: 'inherit' });

  // Update frontmatter: set status completed, ended_at
  const raw = fs.readFileSync(sessionPath, 'utf8');
  const parsed = matter(raw);
  parsed.data.status = 'completed';
  parsed.data.ended_at = new Date().toISOString();
  fs.writeFileSync(sessionPath, matter.stringify(parsed.content, parsed.data));

  await git(clonePath).fetch(['--all']).catch(() => {});
  await git(clonePath).pull('origin', sharedRepo.branch, { '--rebase': 'false' }).catch(() => {});
  await commitAndPush(clonePath, identity.handle, sharedRepo.branch);

  state.activeSessionId = null;
  writeState(projectRoot, state);

  console.log(chalk.green('Session ended and pushed to shared repo.'));
}
