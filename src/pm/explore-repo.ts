import fs from 'fs';
import path from 'path';

/**
 * Shallow exploration of an existing codebase. Used in brownfield mode
 * to feed the PM a condensed repo summary before the planning phase opens.
 *
 * We intentionally keep this quick + deterministic (no LLM, no deep scan):
 * - Top-level directory listing
 * - README contents (trimmed)
 * - Detected tech stack hints from lockfiles and config
 */
export interface RepoOverview {
  rootBasename: string;
  topLevelEntries: string[];
  readmeExcerpt: string | null;
  detectedStack: string[];
}

const STACK_HINTS: Array<{ file: string; label: string }> = [
  { file: 'package.json',         label: 'Node.js / JavaScript / TypeScript' },
  { file: 'tsconfig.json',        label: 'TypeScript' },
  { file: 'Cargo.toml',           label: 'Rust' },
  { file: 'go.mod',               label: 'Go' },
  { file: 'requirements.txt',     label: 'Python (pip)' },
  { file: 'pyproject.toml',       label: 'Python (poetry/PEP 621)' },
  { file: 'Gemfile',              label: 'Ruby' },
  { file: 'composer.json',        label: 'PHP' },
  { file: 'build.gradle',         label: 'JVM (Gradle)' },
  { file: 'pom.xml',              label: 'JVM (Maven)' },
  { file: 'mix.exs',              label: 'Elixir' },
  { file: 'Dockerfile',           label: 'Docker' },
  { file: 'docker-compose.yml',   label: 'Docker Compose' },
  { file: '.github/workflows',    label: 'GitHub Actions CI' },
  { file: 'next.config.js',       label: 'Next.js' },
  { file: 'vite.config.ts',       label: 'Vite' },
  { file: 'vite.config.js',       label: 'Vite' },
  { file: 'astro.config.mjs',     label: 'Astro' },
  { file: 'pnpm-workspace.yaml',  label: 'pnpm workspace' },
  { file: 'turbo.json',           label: 'Turborepo' },
];

export function exploreRepo(rootDir: string, readmeMaxBytes = 2000): RepoOverview {
  const rootBasename = path.basename(rootDir);
  let topLevelEntries: string[] = [];
  try {
    topLevelEntries = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.') || ['.github', '.gitignore'].includes(d.name))
      .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
      .sort();
  } catch { /* repo unreadable */ }

  let readmeExcerpt: string | null = null;
  for (const name of ['README.md', 'README', 'readme.md']) {
    const p = path.join(rootDir, name);
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        readmeExcerpt = raw.length > readmeMaxBytes ? raw.slice(0, readmeMaxBytes) + '\n…(truncated)' : raw;
      } catch { /* unreadable */ }
      break;
    }
  }

  const detectedStack: string[] = [];
  for (const hint of STACK_HINTS) {
    if (fs.existsSync(path.join(rootDir, hint.file))) {
      if (!detectedStack.includes(hint.label)) detectedStack.push(hint.label);
    }
  }

  return { rootBasename, topLevelEntries, readmeExcerpt, detectedStack };
}

/**
 * Format a repo overview as markdown the PM can consume in its prompt.
 */
export function formatRepoOverview(o: RepoOverview): string {
  const lines: string[] = [];
  lines.push(`## Repository: ${o.rootBasename}`);
  lines.push('');
  if (o.detectedStack.length > 0) {
    lines.push('**Detected stack:**');
    for (const s of o.detectedStack) lines.push(`- ${s}`);
    lines.push('');
  }
  if (o.topLevelEntries.length > 0) {
    lines.push('**Top-level entries:**');
    lines.push('```');
    for (const e of o.topLevelEntries) lines.push(e);
    lines.push('```');
    lines.push('');
  }
  if (o.readmeExcerpt) {
    lines.push('**README excerpt:**');
    lines.push('```');
    lines.push(o.readmeExcerpt);
    lines.push('```');
  }
  return lines.join('\n');
}
