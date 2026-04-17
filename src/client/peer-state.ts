import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Per-peer state persisted across reconnects.
 *
 * Keyed by a hash of (displayName + inviteCodeSeed) so the same peer
 * rejoining the same session finds their prior state, but different
 * sessions get independent state.
 */

const STATE_DIR = path.join(os.homedir(), '.tribevibe', 'peer-state');

export interface PeerState {
  sessionKey: string;
  displayName: string;
  seedHash: string;
  agentSessionId: string | null;
  role: string | null;
  scope: string[];
  lastSeen: number;
}

function sessionKey(displayName: string, seedHex: string): string {
  const h = crypto.createHash('sha256');
  h.update(displayName);
  h.update('|');
  h.update(seedHex);
  return h.digest('hex').slice(0, 16);
}

function statePath(key: string): string {
  return path.join(STATE_DIR, `${key}.json`);
}

export function loadPeerState(displayName: string, seedHex: string): PeerState {
  const key = sessionKey(displayName, seedHex);
  const p = statePath(key);
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as PeerState;
      return { ...raw, sessionKey: key }; // key may evolve, so re-stamp
    } catch {
      /* fall through */
    }
  }
  return {
    sessionKey: key,
    displayName,
    seedHash: key,
    agentSessionId: null,
    role: null,
    scope: [],
    lastSeen: Date.now(),
  };
}

export function savePeerState(state: PeerState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  state.lastSeen = Date.now();
  fs.writeFileSync(statePath(state.sessionKey), JSON.stringify(state, null, 2));
}
