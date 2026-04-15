import type { AgentUpdatePayload } from '../shared/protocol.js';

export interface RoleStatus {
  participantId: string;
  name: string;
  role: string;
  scope: string[];
  updates: AgentUpdatePayload[];
  lastUpdate: number | null;
  filesChanged: Set<string>;
}

export interface Decision {
  timestamp: number;
  description: string;
  reasoning: string;
  itemId?: string;
}

/**
 * The PM's running "master status document". Aggregates agent updates, tracks
 * who's working on what, and records decisions. Serializable to markdown for
 * injection into the PM agent's system prompt.
 */
export class StatusTracker {
  private roles: Map<string, RoleStatus> = new Map();
  private decisions: Decision[] = [];

  registerRole(
    participantId: string,
    name: string,
    role: string,
    scope: string[]
  ): void {
    this.roles.set(participantId, {
      participantId,
      name,
      role,
      scope,
      updates: [],
      lastUpdate: null,
      filesChanged: new Set(),
    });
  }

  recordUpdate(update: AgentUpdatePayload): void {
    const r = this.roles.get(update.participantId);
    if (!r) return;
    r.updates.push(update);
    r.lastUpdate = Date.now();
    for (const f of update.files) r.filesChanged.add(f);
  }

  recordDecision(d: Decision): void {
    this.decisions.push(d);
  }

  listRoles(): RoleStatus[] {
    return Array.from(this.roles.values());
  }

  listDecisions(): Decision[] {
    return this.decisions.slice();
  }

  /**
   * Detect potential conflicts: two roles touching the same files.
   */
  detectFileOverlaps(): Array<{ file: string; participantIds: string[] }> {
    const fileMap = new Map<string, string[]>();
    for (const r of this.roles.values()) {
      for (const f of r.filesChanged) {
        if (!fileMap.has(f)) fileMap.set(f, []);
        fileMap.get(f)!.push(r.participantId);
      }
    }
    return Array.from(fileMap.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([file, participantIds]) => ({ file, participantIds }));
  }

  toMarkdown(): string {
    const lines: string[] = ['# Master Status Document', ''];
    lines.push('## Roles');
    for (const r of this.roles.values()) {
      const last = r.lastUpdate ? new Date(r.lastUpdate).toISOString() : 'no updates';
      lines.push(`- **${r.name}** (${r.role}) — scope: ${r.scope.join(', ') || 'unset'} — last update: ${last}`);
      for (const u of r.updates.slice(-3)) {
        lines.push(`  - ${u.summary}`);
      }
    }
    lines.push('');
    lines.push('## Decisions');
    if (this.decisions.length === 0) {
      lines.push('(none yet)');
    } else {
      for (const d of this.decisions) {
        lines.push(`- [${new Date(d.timestamp).toISOString()}] ${d.description}`);
      }
    }
    const overlaps = this.detectFileOverlaps();
    if (overlaps.length > 0) {
      lines.push('');
      lines.push('## ⚠️ File overlaps detected');
      for (const o of overlaps) {
        lines.push(`- \`${o.file}\` — touched by: ${o.participantIds.join(', ')}`);
      }
    }
    return lines.join('\n');
  }
}
