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

  addPeer(displayName: string): Participant {
    if (!this.canAcceptNewPeer()) {
      throw new Error('Session is full');
    }
    const id = `peer-${this.participants.size}`;
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
    return participant;
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
