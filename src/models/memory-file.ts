export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryFile {
  // Claude Code frontmatter fields
  type: MemoryType;
  name: string;
  description: string;
  // tribeVibe tracking fields (added when pushed)
  tv_author?: string;
  tv_updated?: string;
  // Body content
  content: string;
  // Runtime only
  filename: string;   // just the basename, e.g. "abc123.md"
  localPath: string;  // absolute path
  contentHash: string;
}

// Only these types are shared with teammates — the rest are personal
export const SHAREABLE_TYPES: MemoryType[] = ['project', 'reference'];
