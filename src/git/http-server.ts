import path from 'path';
import { Git } from 'node-git-server';

export interface GitHttpHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * Start a smart HTTP git server that exposes the bare repo in <dir>/repo.git.
 *
 * node-git-server's `Git` constructor takes a directory and serves any bare
 * repo under it at paths like /repo.git/info/refs. We don't need auth here
 * since the tunnel + our WS-layer encryption handle the security boundary.
 */
export async function startGitHttpServer(
  bareRepoPath: string,
  port: number = 0
): Promise<GitHttpHandle> {
  const repoDir = path.dirname(bareRepoPath);

  const repos = new Git(repoDir, {
    autoCreate: false,
  });

  await new Promise<void>((resolve, reject) => {
    // Suppress non-fatal stderr from node-git-server for a clean TUI
    const origLog = console.error;
    try {
      repos.listen(port, undefined, (err?: Error) => {
        console.error = origLog;
        if (err) reject(err);
        else resolve();
      });
    } catch (e) {
      console.error = origLog;
      reject(e);
    }
  });

  const addr = (repos as any).server?.address?.();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        try {
          (repos as any).close?.();
        } catch { /* noop */ }
        resolve();
      }),
  };
}
