import { simpleGit } from 'simple-git';

/**
 * Peer-side helpers for keeping a working clone in sync with the host's bare repo.
 */

export async function clonePeerWorkdir(
  gitUrl: string,
  targetPath: string,
  branch: string
): Promise<void> {
  await simpleGit().clone(gitUrl, targetPath, ['--branch', branch]);
}

export async function autoCommitPush(
  workdir: string,
  branch: string,
  message: string
): Promise<boolean> {
  const g = simpleGit(workdir);
  await g.add('.');
  const status = await g.status();
  if (status.files.length === 0) return false;
  await g.commit(message);
  await g.push('origin', branch);
  return true;
}

export async function pullSharedContracts(workdir: string): Promise<void> {
  const g = simpleGit(workdir);
  try {
    await g.fetch('origin', 'shared/contracts');
    // Merge without fast-forward to keep history clear; ignore if no change
    await g.merge(['origin/shared/contracts', '--no-edit']).catch(() => {});
  } catch { /* remote may not have the branch yet */ }
}
