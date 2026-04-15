import React from 'react';
import { render } from 'ink';
import os from 'os';
import path from 'path';
import { HostApp } from '../tui/HostApp.js';

export interface HostOptions {
  port?: number;
  name?: string;
  project?: string;
}

export async function hostCommand(opts: HostOptions): Promise<void> {
  const hostName = opts.name ?? os.userInfo().username;
  const localPort = opts.port ?? 0; // 0 = pick any free port
  const projectName = opts.project ?? path.basename(process.cwd());

  // If port 0, we need to pre-bind to find a real port. Simpler: let WS server
  // pick a port, then read it back. Our WS server uses explicit port so we
  // emulate port=0 by letting Node assign via ws's own port:0 path.
  //
  // For a foundation MVP we default to a specific port if unspecified.
  const port = localPort || 7420 + Math.floor(Math.random() * 100);

  render(
    React.createElement(HostApp, {
      hostName,
      localPort: port,
      projectName,
    })
  );
}
