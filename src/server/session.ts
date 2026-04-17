import crypto from 'crypto';
import type { Participant, SessionPhase } from '../shared/types.js';
import type { LobbyParticipant } from '../shared/protocol.js';
import { MAX_PARTICIPANTS } from '../shared/types.js';

export class HostSession {
  readonly id: string;
  readonly createdAt: number;
  readonly hostName: string;
  phase: SessionPhase = 'lobby';
  participants: Map<string, Participant> = new Map();

  constructor(hostName: string) {
    this.id = crypto.randomUUID();
    this.createdAt = Date.now();
    this.hostName = hostName;

    // Host is always participant 0
    this.participants.set('host', {
      id: 'host',
      name: hostName,
      isHost: true,
      connected: true,
      conversationId: null,
      role: null,
      scope: [],
      lastSeen: Date.now(),
    });
  }

  canAcceptNewPeer(): boolean {
    return this.participants.size < MAX_PARTICIPANTS;
  }

  /**
   * Find a disconnected peer matching this display name. Used for reconnect.
   */
  findDisconnectedByName(displayName: string): Participant | null {
    for (const p of this.participants.values()) {
      if (!p.isHost && !p.connected && p.name === displayName) return p;
    }
    return null;
  }

  /**
   * Add a new peer OR restore a disconnected one with the same name.
   * Returns { participant, isReconnect }.
   */
  addOrRestorePeer(displayName: string): { participant: Participant; isReconnect: boolean } {
    const existing = this.findDisconnectedByName(displayName);
    if (existing) {
      existing.connected = true;
      existing.lastSeen = Date.now();
      return { participant: existing, isReconnect: true };
    }

    if (!this.canAcceptNewPeer()) {
      throw new Error('Session is full');
    }
    // Use a monotonic id so re-adds (not restores) don't collide
    const nextIdx = Array.from(this.participants.values()).filter((p) => !p.isHost).length;
    const id = `peer-${nextIdx + 1}`;
    const participant: Participant = {
      id,
      name: displayName,
      isHost: false,
      connected: true,
      conversationId: null,
      role: null,
      scope: [],
      lastSeen: Date.now(),
    };
    this.participants.set(id, participant);
    return { participant, isReconnect: false };
  }

  /** Deprecated — kept for backwards compat; prefer addOrRestorePeer. */
  addPeer(displayName: string): Participant {
    return this.addOrRestorePeer(displayName).participant;
  }

  markDisconnected(id: string): void {
    const p = this.participants.get(id);
    if (p) p.connected = false;
  }

  markReconnected(id: string): void {
    const p = this.participants.get(id);
    if (p) {
      p.connected = true;
      p.lastSeen = Date.now();
    }
  }

  toLobbyList(): LobbyParticipant[] {
    return Array.from(this.participants.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
    }));
  }
}
