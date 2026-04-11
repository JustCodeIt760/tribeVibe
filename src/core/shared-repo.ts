import fs from 'fs';
import path from 'path';
import os from 'os';
import { simpleGit, type SimpleGit } from 'simple-git';
import matter from 'gray-matter';
import type { MemoryFile } from '../models/memory-file.js';
import type { SessionNote } from '../models/session-note.js';

export const TRIBEVIBE_REPOS_DIR = path.join(os.homedir(), '.tribevibe', 'repos');

export function repoClonePath(slug: string): string {
  return path.join(TRIBEVIBE_REPOS_DIR, slug);
}

export function git(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

export async function cloneOrFetch(repoUrl: string, slug: string): Promise<string> {
  const clonePath = repoClonePath(slug);
  fs.mkdirSync(TRIBEVIBE_REPOS_DIR, { recursive: true });

  if (fs.existsSync(path.join(clonePath, '.git'))) {
    await simpleGit(clonePath).fetch(['--all']);
    await simpleGit(clonePath).pull('origin', 'main', { '--rebase': 'false' });
  } else {
    await simpleGit().clone(repoUrl, clonePath);
  }
  return clonePath;
}

export function memberMemoryDir(clonePath: string, slug: string, handle: string): string {
  return path.join(clonePath, 'projects', slug, 'members', handle, 'memory');
}

export function memberSessionDir(clonePath: string, slug: string, handle: string): string {
  return path.join(clonePath, 'projects', slug, 'members', handle, 'sessions');
}

export function sharedDir(clonePath: string, slug: string): string {
  return path.join(clonePath, 'projects', slug, 'shared');
}

export function ensureProjectStructure(
  clonePath: string,
  slug: string,
  handle: string
): void {
  [
    memberMemoryDir(clonePath, slug, handle),
    memberSessionDir(clonePath, slug, handle),
    sharedDir(clonePath, slug),
  ].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  // Create context.md if it doesn't exist
  const contextPath = path.join(sharedDir(clonePath, slug), 'context.md');
  if (!fs.existsSync(contextPath)) {
    fs.writeFileSync(
      contextPath,
      `# Project Context\n\n## Current Focus\n\n<!-- What is the team currently working on? -->\n\n## Known Issues / Gotchas\n\n<!-- Append-only: add entries here, mark resolved but don't delete -->\n\n## Active Decisions\n\n<!-- High-level decisions that affect the whole team -->\n`
    );
  }
}

export function writeMemoryFileToRepo(
  clonePath: string,
  slug: string,
  handle: string,
  file: MemoryFile,
  author: string
): void {
  const dir = memberMemoryDir(clonePath, slug, handle);
  fs.mkdirSync(dir, { recursive: true });
  const fm: Record<string, unknown> = {
    name: file.name,
    description: file.description,
    type: file.type,
    tv_author: author,
    tv_updated: new Date().toISOString(),
  };
  const serialized = matter.stringify(file.content, fm);
  fs.writeFileSync(path.join(dir, file.filename), serialized);
}

export function writeMemoryIndex(
  clonePath: string,
  slug: string,
  handle: string,
  indexContent: string
): void {
  const dir = memberMemoryDir(clonePath, slug, handle);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), indexContent);
}

export async function commitAndPush(
  clonePath: string,
  handle: string,
  branch: string = 'main'
): Promise<void> {
  const g = simpleGit(clonePath);
  await g.add('.');
  const status = await g.status();
  if (status.staged.length === 0 && status.modified.length === 0 && status.not_added.length === 0) {
    return; // nothing to commit
  }
  const timestamp = new Date().toISOString();
  await g.commit(`push: ${handle} ${timestamp}`);
  await g.push('origin', branch);
}

export function listTeammateHandles(
  clonePath: string,
  slug: string,
  ownHandle: string
): string[] {
  const membersDir = path.join(clonePath, 'projects', slug, 'members');
  if (!fs.existsSync(membersDir)) return [];
  return fs.readdirSync(membersDir).filter(
    (h) => h !== ownHandle && fs.statSync(path.join(membersDir, h)).isDirectory()
  );
}

export function readTeammateMemoryFiles(
  clonePath: string,
  slug: string,
  handle: string
): MemoryFile[] {
  const dir = memberMemoryDir(clonePath, slug, handle);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(
    (f) => f.endsWith('.md') && f !== 'MEMORY.md'
  );

  const result: MemoryFile[] = [];
  for (const filename of files) {
    const filePath = path.join(dir, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    const type = (fm.type as MemoryFile['type']) ?? 'project';

    result.push({
      type,
      name: (fm.name as string) ?? filename,
      description: (fm.description as string) ?? '',
      tv_author: fm.tv_author as string | undefined,
      tv_updated: fm.tv_updated as string | undefined,
      content: parsed.content.trim(),
      filename,
      localPath: filePath,
      contentHash: '',
    });
  }
  return result;
}

export function readTeammateActiveSessions(
  clonePath: string,
  slug: string,
  handle: string
): SessionNote[] {
  const dir = memberSessionDir(clonePath, slug, handle);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const result: SessionNote[] = [];

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(dir, filename), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    if (fm.status === 'active') {
      result.push({
        id: (fm.id as string) ?? '',
        author: (fm.author as string) ?? handle,
        project: (fm.project as string) ?? slug,
        started_at: (fm.started_at as string) ?? '',
        ended_at: (fm.ended_at as string) ?? null,
        description: (fm.description as string) ?? '',
        status: 'active',
        body: parsed.content.trim(),
        filename,
      });
    }
  }
  return result;
}
