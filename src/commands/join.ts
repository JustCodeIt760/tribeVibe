import React from 'react';
import { render } from 'ink';
import os from 'os';
import { JoinApp } from '../tui/JoinApp.js';

export interface JoinOptions {
  name?: string;
}

export async function joinCommand(inviteCode: string, opts: JoinOptions): Promise<void> {
  const displayName = opts.name ?? os.userInfo().username;
  render(
    React.createElement(JoinApp, {
      inviteCode,
      displayName,
    })
  );
}
