import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit, type SimpleGit } from 'simple-git';

export const TRIBEVIBE_SESSIONS_DIR = path.join(os.homedir(), '.tribevibe', 'sessions');

export function bareRepoPath(sessionId: string): string {
  return path.join(TRIBEVIBE_SESSIONS_DIR, sessionId, 'repo.git');
}

export function workingRepoPath(sessionId: string): string {
  return path.join(TRIBEVIBE_SESSIONS_DIR, sessionId, 'work');
}

/**
 * Create a new bare repo for a session.
 * Also creates an initial working clone so the host can seed the repo with
 * a scaffold before peers connect.
 */
export async function initBareRepo(sessionId: string): Promise<{ bare: string; work: string }> {
  const bare = bareRepoPath(sessionId);
  const work = workingRepoPath(sessionId);
  fs.mkdirSync(bare, { recursive: true });
  fs.mkdirSync(work, { recursive: true });

  if (!fs.existsSync(path.join(bare, 'HEAD'))) {
    await simpleGit(path.dirname(bare)).init(['--bare', path.basename(bare), '--initial-branch=main']);
  }
  if (!fs.existsSync(path.join(work, '.git'))) {
    await simpleGit(path.dirname(work)).clone(bare, path.basename(work));
  }

  return { bare, work };
}

export function gitForRepo(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

/**
 * Seed the bare repo with an initial commit.
 * Writes files into the working clone, commits them, pushes to bare.
 */
export async function seedInitialCommit(
  work: string,
  files: Record<string, string>,
  authorName: string,
  authorEmail: string
): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(work, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const g = simpleGit(work);
  await g.addConfig('user.name', authorName);
  await g.addConfig('user.email', authorEmail);
  await g.add('.');
  const status = await g.status();
  if (status.files.length === 0) return;
  await g.commit('Initial scaffold');
  await g.push('origin', 'main');
}

/**
 * Create role branches and a shared/contracts branch off of main.
 */
export async function createRoleBranches(work: string, roles: string[]): Promise<void> {
  const g = simpleGit(work);
  await g.checkout('main');

  for (const role of roles) {
    const branch = `role/${role.toLowerCase().replace(/\s+/g, '-')}`;
    try {
      await g.checkoutLocalBranch(branch);
    } catch {
      await g.checkout(branch);
    }
    await g.push(['-u', 'origin', branch]);
    await g.checkout('main');
  }

  try {
    await g.checkoutLocalBranch('shared/contracts');
  } catch {
    await g.checkout('shared/contracts');
  }
  await g.push(['-u', 'origin', 'shared/contracts']);
  await g.checkout('main');
}

export async function listBranches(bare: string): Promise<string[]> {
  const g = simpleGit(bare);
  const branches = await g.branch();
  return branches.all.filter((b) => !b.startsWith('remotes/'));
}

/**
 * Merge role branches into main in dependency order.
 * Returns a list of any branches that had conflicts and were skipped.
 */
export async function mergeRoleBranches(
  work: string,
  order: string[]
): Promise<{ merged: string[]; conflicts: string[] }> {
  const g = simpleGit(work);
  await g.checkout('main');
  await g.pull('origin', 'main').catch(() => {});

  const merged: string[] = [];
  const conflicts: string[] = [];

  for (const branch of order) {
    try {
      await g.pull('origin', branch, ['--no-rebase']);
      merged.push(branch);
    } catch {
      conflicts.push(branch);
      // Abort the merge so main stays clean
      try {
        await g.merge(['--abort']);
      } catch { /* noop */ }
    }
  }

  if (merged.length > 0) {
    await g.push('origin', 'main');
  }
  return { merged, conflicts };
}
