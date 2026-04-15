import { simpleGit } from 'simple-git';

/**
 * Lightweight conflict detector: compare two branches against main.
 * Used by the PM agent to flag drift early.
 */
export async function detectConflicts(
  workdir: string,
  branchA: string,
  branchB: string
): Promise<{ conflictingFiles: string[] }> {
  const g = simpleGit(workdir);
  try {
    // Fetch latest state of both branches
    await g.fetch('origin', branchA).catch(() => {});
    await g.fetch('origin', branchB).catch(() => {});

    // Files changed in each branch since their common ancestor
    const [changedA, changedB] = await Promise.all([
      listChangedFiles(workdir, `origin/${branchA}`),
      listChangedFiles(workdir, `origin/${branchB}`),
    ]);
    const setA = new Set(changedA);
    const conflictingFiles = changedB.filter((f) => setA.has(f));
    return { conflictingFiles };
  } catch {
    return { conflictingFiles: [] };
  }
}

async function listChangedFiles(workdir: string, ref: string): Promise<string[]> {
  const g = simpleGit(workdir);
  try {
    const diff = await g.diff(['--name-only', 'origin/main', ref]);
    return diff.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
