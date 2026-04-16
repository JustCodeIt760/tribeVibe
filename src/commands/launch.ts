import React from 'react';
import { render } from 'ink';
import { LaunchScreen } from '../tui/LaunchScreen.js';
import { HostApp } from '../tui/HostApp.js';
import { JoinApp } from '../tui/JoinApp.js';
import path from 'path';
import os from 'os';

/**
 * The interactive launch screen — shown when `tribevibe` is run with no
 * subcommand. Prompts for Host / Join / Resume, then swaps the render to
 * the chosen app.
 */
export async function launchCommand(): Promise<void> {
  const instance = render(
    React.createElement(LaunchScreen, {
      onHost: (name) => {
        instance.unmount();
        const port = 7420 + Math.floor(Math.random() * 100);
        render(
          React.createElement(HostApp, {
            hostName: name || os.userInfo().username,
            localPort: port,
            projectName: path.basename(process.cwd()),
            brownfield: false,
          })
        );
      },
      onJoin: (code, name) => {
        instance.unmount();
        render(
          React.createElement(JoinApp, {
            inviteCode: code,
            displayName: name || os.userInfo().username,
          })
        );
      },
      onResume: (session, name) => {
        instance.unmount();
        // Resume re-uses HostApp but with the persisted session's project name.
        // True agent-conversation resumption requires per-participant
        // session-id state that isn't persisted yet — this is a foundation.
        const port = 7420 + Math.floor(Math.random() * 100);
        render(
          React.createElement(HostApp, {
            hostName: name || session.hostName,
            localPort: port,
            projectName: session.projectName,
            brownfield: session.brownfield,
          })
        );
      },
    })
  );
}
