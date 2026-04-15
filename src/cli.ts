#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { syncCommand } from './commands/sync.js';
import { statusCommand } from './commands/status.js';
import { sessionStartCommand, sessionEndCommand } from './commands/session.js';
import { hostCommand } from './commands/host.js';
import { joinCommand } from './commands/join.js';

const program = new Command();

program
  .name('tribevibe')
  .description('Shared Claude Code memory and session context for teams')
  .version('0.1.0');

program
  .command('init [git-url]')
  .description('Link this project to a shared git repo for memory syncing')
  .action(async (repoUrl?: string) => {
    await initCommand(repoUrl);
  });

program
  .command('push')
  .description('Push local Claude memory files to the shared repo')
  .action(async () => {
    await pushCommand();
  });

program
  .command('pull')
  .description("Pull teammates' memory files into your local Claude memory")
  .action(async () => {
    await pullCommand();
  });

program
  .command('sync')
  .description('Push then pull (bidirectional sync)')
  .action(async () => {
    await syncCommand();
  });

program
  .command('status')
  .description('Show local changes and teammate updates')
  .action(async () => {
    await statusCommand();
  });

const session = program.command('session').description('Manage session notes');

session
  .command('start <description>')
  .description('Start a session — announces what you are working on to teammates')
  .action(async (description: string) => {
    await sessionStartCommand(description);
  });

session
  .command('end')
  .description('End your active session and push notes to the shared repo')
  .action(async () => {
    await sessionEndCommand();
  });

program
  .command('host')
  .description('Host a live TribeVibe session (starts server + ngrok tunnel)')
  .option('-n, --name <name>', 'Your display name')
  .option('-p, --port <port>', 'Local WebSocket port', (v) => parseInt(v, 10))
  .option('--project <name>', 'Project name shown to peers')
  .action(async (opts: { name?: string; port?: number; project?: string }) => {
    await hostCommand(opts);
  });

program
  .command('join <invite-code>')
  .description('Join a live TribeVibe session using an invite code')
  .option('-n, --name <name>', 'Your display name')
  .action(async (code: string, opts: { name?: string }) => {
    await joinCommand(code, opts);
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
