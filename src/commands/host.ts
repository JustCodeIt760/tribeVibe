import React from 'react';
import { render } from 'ink';
import os from 'os';
import path from 'path';
import { HostApp } from '../tui/HostApp.js';

export interface HostOptions {
  port?: number;
  name?: string;
  project?: string;
  brownfield?: boolean;
}

export async function hostCommand(opts: HostOptions): Promise<void> {
  const hostName = opts.name ?? os.userInfo().username;
  const port = opts.port || 7420 + Math.floor(Math.random() * 100);
  const projectName = opts.project ?? path.basename(process.cwd());
  const brownfield = Boolean(opts.brownfield);

  render(
    React.createElement(HostApp, {
      hostName,
      localPort: port,
      projectName,
      brownfield,
    })
  );
}
