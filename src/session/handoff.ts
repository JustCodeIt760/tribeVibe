import fs from 'fs';
import path from 'path';
import type { PersistedSession } from './persistence.js';
import type { StatusTracker } from '../pm/status-tracker.js';

/**
 * Write per-role handoff doc + overall session summary into the working repo.
 * Called at session end (or on request).
 */

export interface HandoffInput {
  workdir: string;
  session: PersistedSession;
  tracker: StatusTracker;
  individualHandoffs: Array<{ participantId: string; content: string }>;
}

export function writeHandoffs(input: HandoffInput): string[] {
  const dir = path.join(input.workdir, 'handoffs');
  fs.mkdirSync(dir, { recursive: true });

  const writtenFiles: string[] = [];

  // Individual handoffs
  for (const h of input.individualHandoffs) {
    const p = input.session.participants.find((x) => x.id === h.participantId);
    if (!p) continue;
    const slug = `${p.role ?? 'peer'}-${p.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const file = path.join(dir, `${slug}.md`);
    fs.writeFileSync(file, h.content);
    writtenFiles.push(file);
  }

  // Group summary
  const summary = buildGroupSummary(input.session, input.tracker);
  const summaryPath = path.join(dir, 'SESSION-SUMMARY.md');
  fs.writeFileSync(summaryPath, summary);
  writtenFiles.push(summaryPath);

  return writtenFiles;
}

function buildGroupSummary(
  session: PersistedSession,
  tracker: StatusTracker
): string {
  const lines: string[] = [];
  lines.push(`# TribeVibe Session Summary — ${session.projectName}`);
  lines.push('');
  lines.push(`**Session ID:** ${session.id}`);
  lines.push(`**Started:** ${new Date(session.createdAt).toISOString()}`);
  lines.push(`**Host:** ${session.hostName}`);
  lines.push(`**Mode:** ${session.brownfield ? 'Brownfield' : 'Greenfield'}`);
  lines.push('');

  lines.push('## Participants');
  for (const p of session.participants) {
    lines.push(
      `- **${p.name}** — ${p.role ?? '(no role)'} — scope: ${p.scope.join(', ') || '(none)'}`
    );
  }
  lines.push('');

  lines.push('## Decisions');
  const decisions = tracker.listDecisions();
  if (decisions.length === 0) {
    lines.push('_No formal decisions recorded._');
  } else {
    for (const d of decisions) {
      lines.push(`- [${new Date(d.timestamp).toISOString()}] ${d.description}`);
      if (d.reasoning) lines.push(`  - Reasoning: ${d.reasoning}`);
    }
  }
  lines.push('');

  lines.push('## Status By Role');
  for (const r of tracker.listRoles()) {
    lines.push(`### ${r.name} (${r.role})`);
    lines.push(`- Scope: ${r.scope.join(', ') || '(none)'}`);
    lines.push(`- Updates: ${r.updates.length}`);
    lines.push(`- Files touched: ${Array.from(r.filesChanged).length}`);
    lines.push('');
    if (r.updates.length > 0) {
      lines.push('**Recent updates:**');
      for (const u of r.updates.slice(-5)) {
        lines.push(`- ${u.summary}`);
      }
    }
    lines.push('');
  }

  const overlaps = tracker.detectFileOverlaps();
  if (overlaps.length > 0) {
    lines.push('## ⚠️ File Overlaps');
    for (const o of overlaps) {
      lines.push(`- \`${o.file}\` touched by ${o.participantIds.length} participants`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert handoffs into tribeVibe memory files (type: project) for the
 * async memory-sync system. This is the bridge between the live session and
 * the async memory-sync subsystem.
 */
export function handoffToMemoryFiles(
  session: PersistedSession,
  tracker: StatusTracker
): Array<{ filename: string; content: string }> {
  const files: Array<{ filename: string; content: string }> = [];

  const decisions = tracker.listDecisions();
  if (decisions.length > 0) {
    const body = decisions
      .map((d) => `- **${d.description}**\n  - ${d.reasoning}`)
      .join('\n');
    files.push({
      filename: `tribevibe-decisions-${session.id.slice(0, 8)}.md`,
      content: `---
name: TribeVibe session decisions
description: Architectural decisions from session ${session.id.slice(0, 8)}
type: project
---

${body}
`,
    });
  }

  const summaryContent = buildGroupSummary(session, tracker);
  files.push({
    filename: `tribevibe-summary-${session.id.slice(0, 8)}.md`,
    content: `---
name: TribeVibe session ${session.id.slice(0, 8)} summary
description: Full session summary (${new Date(session.createdAt).toISOString().slice(0, 10)})
type: project
---

${summaryContent}
`,
  });

  return files;
}
