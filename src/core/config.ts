import fs from 'fs';
import path from 'path';
import type { TribeVibeConfig, TribeVibeState } from '../models/tribevibe-config.js';

const CONFIG_FILE = '.tribevibe.json';
const STATE_FILE = '.tribevibe-state.json';

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, '.tribevibe.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readConfig(projectRoot: string): TribeVibeConfig | null {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return null;
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TribeVibeConfig;
}

export function writeConfig(projectRoot: string, config: TribeVibeConfig): void {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function readState(projectRoot: string): TribeVibeState {
  const statePath = path.join(projectRoot, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    return { pushedHashes: {}, fileHashes: {}, activeSessionId: null };
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as TribeVibeState;
}

export function writeState(projectRoot: string, state: TribeVibeState): void {
  const statePath = path.join(projectRoot, STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

export function ensureGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = '.tribevibe-state.json';
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n${entry}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
  }
}

export function requireConfig(): { config: TribeVibeConfig; projectRoot: string } {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error('No .tribevibe.json found. Run `tribevibe init` first.');
    process.exit(1);
  }
  const config = readConfig(projectRoot);
  if (!config) {
    console.error('Could not read .tribevibe.json. Run `tribevibe init` first.');
    process.exit(1);
  }
  return { config, projectRoot };
}
