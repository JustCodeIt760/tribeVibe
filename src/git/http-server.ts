import path from 'path';
// @ts-ignore - node-git-server has commonjs types; pragmatic import
import pkg from 'node-git-server';

// node-git-server exports { Git } in v1. Handle both shapes defensively.
const Server = (pkg as any).Server ?? (pkg as any).default ?? (pkg as any);

export interface GitHttpHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * Start a smart HTTP git server that exposes a single bare repo.
 *
 * We put the bare repo at <dir>/repo.git and tell node-git-server to serve
 * its parent as the repo root. The public path is /<sessionId>/repo.git.
 */
export async function startGitHttpServer(
  bareRepoPath: string,
  port: number = 0
): Promise<GitHttpHandle> {
  const repoDir = path.dirname(bareRepoPath);

  // node-git-server's API varies by version; try the common constructor.
  // We force authless, public access — encryption happens one layer up.
  let repos: any;
  try {
    repos = new Server(repoDir, {
      autoCreate: false,
      authenticate: undefined,
    });
  } catch {
    // Fallback for older versions that export a factory
    repos = (pkg as any)(repoDir, { autoCreate: false });
  }

  await new Promise<void>((resolve, reject) => {
    repos.listen(port, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const actualPort = (repos.server?.address?.() as any)?.port ?? port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        try {
          repos.close();
        } catch { /* noop */ }
        resolve();
      }),
  };
}
