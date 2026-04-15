import fs from 'fs';
import path from 'path';
import { TRIBEVIBE_SESSIONS_DIR } from '../git/bare-repo.js';
import type { SessionPhase } from '../shared/protocol.js';

export interface PersistedParticipant {
  id: string;
  name: string;
  role: string | null;
  scope: string[];
  conversationId: string | null;
  lastSeen: number;
}

export interface PersistedSession {
  id: string;
  createdAt: number;
  projectName: string;
  brownfield: boolean;
  inviteCodeSeed: string;
  phase: SessionPhase;
  hostName: string;
  participants: PersistedParticipant[];
  decisions: Array<{ timestamp: number; description: string; reasoning: string }>;
  masterStatusDoc: string;
  gitBarePath: string;
  gitWorkPath: string;
}

function sessionFilePath(sessionId: string): string {
  return path.join(TRIBEVIBE_SESSIONS_DIR, sessionId, 'session.json');
}

export function saveSession(s: PersistedSession): void {
  const dir = path.join(TRIBEVIBE_SESSIONS_DIR, s.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionFilePath(s.id), JSON.stringify(s, null, 2));
}

export function loadSession(sessionId: string): PersistedSession | null {
  const p = sessionFilePath(sessionId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as PersistedSession;
}

export function listSessions(): PersistedSession[] {
  if (!fs.existsSync(TRIBEVIBE_SESSIONS_DIR)) return [];
  const entries = fs.readdirSync(TRIBEVIBE_SESSIONS_DIR);
  const out: PersistedSession[] = [];
  for (const id of entries) {
    const s = loadSession(id);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
