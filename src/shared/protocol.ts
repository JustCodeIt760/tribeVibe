/**
 * TribeVibe wire protocol.
 *
 * All messages are JSON-serialized and then encrypted with NaCl secretbox
 * before being sent over the WebSocket. Each participant shares a symmetric
 * key derived from the invite-code seed (see src/crypto/kdf.ts).
 */

export type MessageType =
  // Connection
  | 'hello'              // peer → host: identify myself after connecting
  | 'welcome'            // host → peer: you're accepted, here's your id
  | 'lobby-update'       // host → all: who's in the lobby
  | 'session-start'      // host → all: kick off the session
  | 'phase-change'       // host → all: session phase transition

  // Planning
  | 'chat'               // open chat message (all → all via host)
  | 'proposal'           // PM proposing something (roles, scaffold, etc.)
  | 'vote'               // participant voting on proposal
  | 'vote-result'        // PM announcing vote outcome
  | 'role-assignment'    // PM finalizing role assignments
  | 'scaffold-ready'     // PM finished scaffolding the project

  // Individual work phase
  | 'agent-update'       // agent → PM: .md update about what changed
  | 'pm-broadcast'       // PM → all: alignment update
  | 'pm-targeted'        // PM → specific peer: targeted message
  | 'cross-role-request' // agent → PM → other peer: needs change in their scope
  | 'cross-role-response'// peer → PM → requesting peer: accept/modify/reject

  // Meetings
  | 'meeting-recommend'  // PM → host: suggest syncing (reason)
  | 'meeting-approve'    // host → all: meeting approved
  | 'meeting-start'      // host → all: grace period beginning
  | 'meeting-active'     // host → all: meeting in full swing
  | 'floor-assign'       // PM → all: who has the floor
  | 'butt-in'            // peer → host: one-shot interjection
  | 'meeting-decision'   // PM → all: decision recorded
  | 'meeting-dismiss'    // host → all: meeting over

  // Lifecycle
  | 'end-session'        // host → all: wrapping up
  | 'handoff-individual' // peer → host: my handoff doc
  | 'handoff-group'      // host → all: PM's group summary
  | 'goodbye';           // peer → host: disconnecting intentionally

export interface TribeVibeMessage<P = unknown> {
  type: MessageType;
  from: string;
  to: string | 'all';
  timestamp: number;
  payload: P;
}

// ---------- Connection payloads ----------

export interface HelloPayload {
  displayName: string;
  resumeParticipantId?: string; // for reconnect flow (future)
}

export interface WelcomePayload {
  participantId: string;
  hostName: string;
  gitUrl: string | null; // HTTP URL to the bare repo (via ngrok)
}

export interface LobbyParticipant {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  role?: string | null;
}

export interface LobbyUpdatePayload {
  participants: LobbyParticipant[];
}

export interface SessionStartPayload {
  projectName: string;
  brownfield: boolean;
}

export type SessionPhase = 'lobby' | 'planning' | 'working' | 'meeting' | 'ending';

export interface PhaseChangePayload {
  phase: SessionPhase;
  reason?: string;
}

// ---------- Planning payloads ----------

export interface ChatPayload {
  text: string;
  fromName: string;
}

export type ProposalKind = 'roles' | 'scaffold' | 'decision' | 'general';

export interface ProposalPayload {
  proposalId: string;
  kind: ProposalKind;
  title: string;
  body: string;               // markdown description
  options?: string[];         // for multi-option proposals (e.g. vote items)
}

export interface VotePayload {
  proposalId: string;
  value: 'yes' | 'no' | 'abstain';
  comment?: string;
}

export interface VoteResultPayload {
  proposalId: string;
  result: 'accepted' | 'rejected';
  tally: { yes: number; no: number; abstain: number };
}

export interface RoleAssignment {
  participantId: string;
  role: string;
  scope: string[]; // directories they own
}

export interface RoleAssignmentPayload {
  assignments: RoleAssignment[];
}

export interface ScaffoldReadyPayload {
  rootDir: string;
  summary: string;
  branches: string[];
}

// ---------- Work phase payloads ----------

export interface AgentUpdatePayload {
  participantId: string;
  summary: string;           // short title
  changes: string;           // markdown body
  crossRoleImplications: string | null;
  files: string[];           // files touched
}

export interface PmBroadcastPayload {
  title: string;
  body: string;              // markdown
}

export interface PmTargetedPayload {
  targetId: string;
  title: string;
  body: string;
}

export interface CrossRoleRequestPayload {
  requestId: string;
  fromId: string;
  toId: string;              // target role owner
  title: string;
  body: string;
}

export interface CrossRoleResponsePayload {
  requestId: string;
  response: 'accept' | 'modify' | 'reject';
  comment: string;
}

// ---------- Meeting payloads ----------

export interface MeetingRecommendPayload {
  reason: string;
  relevantParticipants: string[];
}

export interface MeetingStartPayload {
  graceSeconds: number;
  reason: string;
}

export interface MeetingItem {
  id: string;
  title: string;
  context: string;
  relevantParticipantIds: string[];
}

export interface MeetingActivePayload {
  items: MeetingItem[];
  currentItemIndex: number;
}

export interface FloorAssignPayload {
  itemId: string;
  participantIds: string[]; // who has the floor
}

export interface ButtInPayload {
  itemId: string;
  text: string;
}

export interface MeetingDecisionPayload {
  itemId: string;
  decision: string;
  reasoning: string;
}

export interface MeetingDismissPayload {
  summary: string;
}

// ---------- Lifecycle payloads ----------

export interface EndSessionPayload {
  reason: string;
}

export interface HandoffIndividualPayload {
  participantId: string;
  role: string | null;
  content: string; // markdown
}

export interface HandoffGroupPayload {
  content: string; // markdown
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
