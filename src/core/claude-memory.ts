import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import matter from 'gray-matter';
import type { MemoryFile } from '../models/memory-file.js';
import { SHAREABLE_TYPES } from '../models/memory-file.js';

/**
 * Derive the Claude Code memory directory path for a given project path.
 * Claude hashes the absolute path by replacing '/' with '-' (keeping the leading '-').
 * e.g. /Users/foo/myapp → -Users-foo-myapp
 */
export function claudeMemoryPath(projectPath: string): string {
  const hash = projectPath.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', hash, 'memory');
}

export function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function readMemoryFiles(memoryDir: string): MemoryFile[] {
  if (!fs.existsSync(memoryDir)) return [];

  const files = fs.readdirSync(memoryDir).filter(
    (f) => f.endsWith('.md') && f !== 'MEMORY.md'
  );

  const result: MemoryFile[] = [];
  for (const filename of files) {
    const localPath = path.join(memoryDir, filename);
    const raw = fs.readFileSync(localPath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;

    result.push({
      type: (fm.type as MemoryFile['type']) ?? 'project',
      name: (fm.name as string) ?? filename,
      description: (fm.description as string) ?? '',
      tv_author: fm.tv_author as string | undefined,
      tv_updated: fm.tv_updated as string | undefined,
      content: parsed.content.trim(),
      filename,
      localPath,
      contentHash: contentHash(raw),
    });
  }
  return result;
}

export function shareableFiles(files: MemoryFile[]): MemoryFile[] {
  return files.filter((f) => SHAREABLE_TYPES.includes(f.type));
}

export function serializeMemoryFile(file: MemoryFile, author: string): string {
  const fm: Record<string, unknown> = {
    name: file.name,
    description: file.description,
    type: file.type,
    tv_author: author,
    tv_updated: new Date().toISOString(),
  };
  return matter.stringify(file.content, fm);
}

export function readMemoryIndex(memoryDir: string): string | null {
  const indexPath = path.join(memoryDir, 'MEMORY.md');
  if (!fs.existsSync(indexPath)) return null;
  return fs.readFileSync(indexPath, 'utf8');
}

export function writeMemoryIndex(memoryDir: string, content: string): void {
  fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), content);
}

/**
 * Append a teammates section to MEMORY.md listing pulled files.
 */
export function appendTeammatesSection(
  memoryDir: string,
  pulledFiles: Array<{ handle: string; file: MemoryFile }>
): void {
  if (pulledFiles.length === 0) return;

  const indexPath = path.join(memoryDir, 'MEMORY.md');
  let base = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '# Memory Index\n';

  // Remove any previous teammates section
  base = base.replace(/\n## Teammates.*$/s, '').trimEnd();

  const lines: string[] = ['\n\n## Teammates\n'];
  const byHandle = new Map<string, MemoryFile[]>();
  for (const { handle, file } of pulledFiles) {
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle)!.push(file);
  }
  for (const [handle, files] of byHandle) {
    lines.push(`\n### ${handle}\n`);
    for (const f of files) {
      lines.push(`- [${f.name}](${f.filename}) — ${f.description}`);
    }
  }

  fs.writeFileSync(indexPath, base + lines.join('\n') + '\n');
}
