export type SessionPhase = 'lobby' | 'planning' | 'working' | 'meeting' | 'ending';

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  conversationId: string | null; // Claude Code SDK conversation ID (future)
  role: string | null;
  scope: string[];
  lastSeen: number;
}

export const MAX_PARTICIPANTS = 5;
