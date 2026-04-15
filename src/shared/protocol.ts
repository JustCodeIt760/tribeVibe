/**
 * TribeVibe wire protocol.
 *
 * All messages are JSON-serialized and then encrypted with NaCl secretbox
 * before being sent over the WebSocket. Each participant has a derived
 * symmetric key (from the invite-code seed) — see src/crypto/kdf.ts.
 */

export type MessageType =
  // Connection
  | 'hello'            // peer → host: identify myself after connecting
  | 'welcome'          // host → peer: you're accepted, here's your id
  | 'lobby-update'     // host → all: who's in the lobby
  | 'session-start'    // host → all: kick off the session

  // Planning / work (stubs for later phases)
  | 'chat'
  | 'proposal'
  | 'vote'
  | 'role-assignment'
  | 'agent-update'
  | 'pm-broadcast'
  | 'pm-targeted'
  | 'cross-role-request'
  | 'cross-role-response'

  // Meetings (stubs)
  | 'meeting-recommend'
  | 'meeting-approve'
  | 'meeting-start'
  | 'meeting-active'
  | 'floor-assign'
  | 'butt-in'
  | 'meeting-decision'
  | 'meeting-dismiss'

  // Lifecycle
  | 'end-session'
  | 'handoff-individual'
  | 'handoff-group'
  | 'goodbye';

export interface TribeVibeMessage<P = unknown> {
  type: MessageType;
  from: string;         // participant id or 'host'
  to: string | 'all';
  timestamp: number;
  payload: P;
}

// ---------- Payload types for foundation messages ----------

export interface HelloPayload {
  displayName: string;
}

export interface WelcomePayload {
  participantId: string;
  hostName: string;
}

export interface LobbyParticipant {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyUpdatePayload {
  participants: LobbyParticipant[];
}

export interface SessionStartPayload {
  projectName: string;
}

export interface GoodbyePayload {
  reason: string;
}

export function makeMessage<P>(
  type: MessageType,
  from: string,
  to: string | 'all',
  payload: P
): TribeVibeMessage<P> {
  return { type, from, to, timestamp: Date.now(), payload };
}
