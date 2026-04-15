# TribeVibe - Collaborative Vibe Coding Platform

**Date:** 2026-04-11
**Status:** Draft Spec
**Stack:** TypeScript (Node.js)

---

## 1. Overview

TribeVibe is a terminal application where a host and up to 4 peers collaboratively build software in real-time. Each participant works with their own Claude Code agent on an assigned piece of the project, while a PM (Project Manager) agent running on the host's machine coordinates alignment across the group.

The core insight: pure solo agentic coding gives you speed but sacrifices oversight. TribeVibe lets a small group divide and conquer — each person brings human judgment to their piece while AI handles the heavy lifting, and a PM agent keeps everyone aligned.

### Key Principles

- **Single binary** — same app runs as host or client, chosen at launch
- **No accounts, no cloud** — the invite code IS the auth system
- **Trust your group** — the host sees everything by design; the invite code is the trust boundary
- **No infrastructure** — ngrok provides NAT-punching, host machine is the server
- **E2E encrypted** — ngrok sees nothing but ciphertext
- **Max 5 participants** (1 host + 4 peers)

---

## 2. Architecture

### Star Topology

The host's machine is the center. It runs:
- **TribeVibe Server** — WebSocket server, git server, session state, message routing
- **PM Agent** — Claude Code instance via SDK, always running, coordinates the group
- **Git Bare Repo** — source of truth for all code
- **ngrok Tunnel** — exposes the server to the internet

Peers run the **TribeVibe Client** which includes:
- **TUI** — terminal user interface (Ink/React)
- **Claude Code Agent** — spawned via SDK, scoped to their role
- **Encrypted WebSocket Client** — connects to host through ngrok

```
                    ┌─────────────────────────────┐
                    │        HOST MACHINE          │
                    │                              │
                    │  ┌──────────┐  ┌──────────┐  │
                    │  │ PM Agent │  │ Git Bare  │  │
                    │  │ (Claude  │  │   Repo    │  │
                    │  │  SDK)    │  │ (source   │  │
                    │  └────┬─────┘  │  of truth)│  │
                    │       │        └─────┬─────┘  │
                    │  ┌────┴──────────────┴─────┐  │
                    │  │    TribeVibe Server      │  │
                    │  │  - WebSocket server      │  │
                    │  │  - Session state          │  │
                    │  │  - Message router         │  │
                    │  │  - Git server (smart HTTP)│  │
                    │  └────────────┬─────────────┘  │
                    │               │                │
                    │          ┌────┴────┐           │
                    │          │  ngrok  │           │
                    │          └────┬────┘           │
                    └───────────────┼────────────────┘
                                   │ (TLS + NaCl E2E)
                    ┌──────────────┼──────────────┐
                    │              │               │
               ┌────┴────┐  ┌────┴────┐    ┌────┴────┐
               │ Peer 1  │  │ Peer 2  │    │ Peer N  │
               │ TUI +   │  │ TUI +   │    │ TUI +   │
               │ Agent   │  │ Agent   │    │ Agent   │
               └─────────┘  └─────────┘    └─────────┘
```

---

## 3. App Launch & Connection Flow

### Startup Screen

```
┌─────────────────────────────────┐
│         TRIBEVIBE               │
│                                 │
│   Welcome! What would you like  │
│   to do?                        │
│                                 │
│   [H] Host a session            │
│   [J] Join a session            │
│                                 │
└─────────────────────────────────┘
```

### Host Path

1. Select "Host a session"
2. App starts WebSocket server on a local port
3. App starts ngrok tunnel → gets public URL
4. App generates a human-friendly invite code (e.g., `VIBE-CORAL-7X`)
   - Code encodes: ngrok URL + PAKE seed
5. Host sees: `Share this code with your crew: VIBE-CORAL-7X`
6. App spawns the PM agent via Claude Code SDK
7. Host waits in lobby, sees peers join in real-time
8. Host presses Enter to start when everyone's in

### Join Path

1. Select "Join a session"
2. Enter the invite code
3. App decodes ngrok URL + PAKE seed from the code
4. SPAKE2 handshake over WebSocket — both sides derive symmetric key
5. Encrypted channel established
6. Peer lands in lobby, sees who else is connected
7. Waits for host to kick off the session

### Reconnect Path (Session Resume)

1. Peer drops (network failure, crash, etc.)
2. Peer restarts app, selects "Join", enters same invite code
3. Host recognizes them via PAKE identity
4. Host has their **Claude Code conversation ID** stored — passes it back
5. App respawns their agent with the conversation ID → Claude picks up mid-conversation with full history
6. **Fallback:** If conversation can't be resumed (too much time passed, context expired), the agent boots from the persisted individual handoff doc instead
7. Peer is back in whatever phase they were in (individual work or meeting)

---

## 4. The Initial Meeting (Planning Phase)

Once the host starts the session, everyone enters a group chat for planning.

### Greenfield (New Project)

1. PM agent opens: "What would you like to build today?"
2. Each person gets a turn to type their vision/ideas (or press Enter to pass)
3. PM synthesizes inputs, proposes a project structure
4. PM presents **roles** based on what the project needs
   - Standard roles: Frontend, Backend/API, Database/Data, Infrastructure, Testing/QA
   - Custom roles allowed (type your own)
   - Roles can combine for smaller groups (e.g., "Backend + DB")
5. PM proposes the **scaffold** — directory structure, interfaces/contracts between roles, shared types
6. Discussion is open-forum chat — everyone contributes freely
7. Each decision point requires a **vote** — PM presents the proposal, everyone approves or raises concerns
8. Once all agree: PM generates the scaffold, creates the git repo, sets up directory boundaries per role

### Brownfield (Existing Repo)

1. Host's machine already has the repo
2. PM agent explores the codebase using Claude Code's file reading capabilities
3. PM presents a **project overview** to the group — what exists, architecture, tech stack
4. Group discusses what needs to be done next
5. Roles are assigned based on existing code areas
6. Same vote-to-proceed flow

### Role Assignment Output

Each role gets a **scope definition:**
- Which directories/files are theirs
- What interfaces they own
- What shared contracts they must respect
- Read access to everything, write access only to their scope

---

## 5. Individual Work Phase

After planning, everyone breaks out into their own work session.

### Work View (TUI)

- **Main area:** Claude Code agent conversation — front and center
- **Status bar:** Their role, session time, peers online count, last PM update timestamp
- **Notification area:** PM messages (updates from others, alignment nudges, cross-role requests)

### Agent Management

Each person's Claude Code agent is spawned via the SDK with a system prompt that includes:
- Their role and scope (which directories are theirs)
- The project scaffold and interface contracts
- Instructions to periodically generate update summaries
- Awareness of the team context (don't break shared interfaces without flagging)

The person talks to their agent normally — "build the login page", "add the user endpoint", etc. The agent works within scope.

### Update Flow to PM

1. After each meaningful chunk of work, the agent generates a short `.md` update:
   - What changed
   - Why
   - Any cross-role implications
2. Update is encrypted and sent to the PM agent via WebSocket
3. PM digests all incoming updates, maintains a **master status document**
4. PM can then:
   - **Broadcast alignment updates:** "Backend just changed the auth endpoint from /login to /auth/login"
   - **Send targeted messages:** "Frontend: the API contract for user profiles has been updated, here's the new shape"
   - **Recommend a meeting to the host:** "I think we should sync — Backend and Frontend have diverging assumptions about the auth flow. Call meeting?" (Host approves/dismisses/delays)

### Cross-Role Requests

When someone's agent needs a change outside their scope:
1. Agent creates a **request** (not a change)
2. Request goes to PM
3. PM routes to the right person: "Backend, Frontend is requesting a `GET /api/users/:id/preferences` endpoint. Here's what they need."
4. Receiving person's agent gets the request as a notification
5. They can accept, modify, or discuss

---

## 6. Meetings (Sync Sessions)

### Meeting Initiation

1. PM sends recommendation to host: "I think we should sync because [reason]"
2. Host sees notification with **Approve / Dismiss / Delay 10min**
3. On approve: all peers get "Meeting starting in 30 seconds — finish your thought"
4. After grace period: everyone's TUI switches to meeting view
5. Individual agents pause (conversation IDs preserved for resume)

### Meeting View (TUI)

```
┌──────────────────────────────────────────┐
│  SYNC MEETING - Called by PM             │
│  Reason: Auth flow assumptions diverging │
│──────────────────────────────────────────│
│                                          │
│  STATUS BOARD:                           │
│  OK  Frontend (Alice) - 3 components    │
│  WIP Backend (Bob) - auth endpoints     │
│  OK  Database (Carol) - schema complete │
│                                          │
│  NEEDS RESOLUTION:                       │
│  1. Auth endpoint path: /login vs        │
│     /auth/login                          │
│  2. Token format: JWT vs session cookie  │
│                                          │
│  [Discussing item 1 of 2]               │
│  Frontend & Backend have the floor       │
│  [Butt In] for others                   │
│──────────────────────────────────────────│
│  Bob: I went with /auth/login because... │
│  Alice: That works if we also add...     │
│                                          │
│  > _                                     │
└──────────────────────────────────────────┘
```

### Meeting Flow

1. PM opens with the **status board** — auto-generated from each person's update .md files
2. PM presents **agenda items** — conflicts, decisions needed, cross-role requests, milestone checks
3. Items addressed **one at a time**
4. For each item, PM assigns **the floor** to relevant people:
   - Those people get an open chat input
   - Everyone else sees the conversation but has a **[Butt In]** button instead of a text field
   - Pressing Butt In gives a one-shot text input to interject, then back to observe mode
5. PM participates using the **debounce pattern** (see below)
6. Once an item is resolved, PM records the **decision** and moves to the next
7. After all items: PM asks "Anything else?" — open floor for everyone
8. Host dismisses the meeting (or PM suggests dismissing if everything's covered)

### PM Response Debounce

The PM agent doesn't respond to every message. It uses a self-evaluation loop:

1. Message arrives from a participant
2. PM evaluates: "Do I need to respond?"
3. **If yes** (correcting factual error, providing requested info): respond immediately
4. **If no** (humans are having a productive exchange): stay quiet
5. **If unsure**: set a 5-second timer. If another message arrives, reset timer. When timer fires with no new messages, PM evaluates again whether to respond

This prevents the PM from being annoying while still being useful.

### After Meeting

1. PM updates master status doc with all decisions made
2. PM updates each person's agent context with relevant decisions
3. Each agent resumes from conversation ID + injected context about decisions
4. Everyone returns to individual work view

---

## 7. Code Sync & Git

### Setup

- Host machine runs a **git bare repo** as source of truth
- A lightweight **git smart HTTP server** runs alongside the WebSocket server
- All git traffic goes through the same ngrok tunnel with NaCl encryption
- No GitHub, no GitLab, no SSH keys to exchange

### Branch Strategy

```
main                    <- clean, merged after meetings
├── role/frontend       <- Alice's work
├── role/backend        <- Bob's work
├── role/database       <- Carol's work
└── shared/contracts    <- interface definitions, updated by PM after votes
```

### During Individual Work

- Each person works on their role branch
- Auto-push at reasonable intervals (after each agent commit or every few minutes)
- Auto-pull of `shared/contracts` so people stay current on interfaces
- PM agent monitors all branches — detects merge conflicts early

### The `shared/contracts` Branch

- Contains TypeScript interfaces, API schemas, shared types
- Only updated through meeting consensus (voted on)
- All role branches track this — when contracts update, each person's agent gets notified and adapts
- This is the **alignment mechanism** — the code-level source of truth for how pieces connect

### During Meetings

- No pushes/pulls — everything pauses
- After decisions: PM triggers a coordinated merge:
  1. Merges role branches into `main` in dependency order (database first → backend → frontend)
  2. If conflicts arise, PM presents them to relevant people before dismissing the meeting
  3. Clean `main` is the checkpoint — everyone pulls the new `main` after meeting

### Alternative: GitHub Remote (Optional)

If participants prefer, host can configure a GitHub/GitLab remote instead of the local bare repo. This is an opt-in alternative, not the default path. The local bare repo over the tunnel is the primary workflow.

---

## 8. Session End & Handoff

### Ending a Session

1. Host selects "End session"
2. PM calls a **final meeting** — brief status check, loose ends
3. After final meeting, PM triggers the wrap-up sequence

### Individual Handoffs (Per Person)

Each person's agent generates a handoff doc from its full conversation context:
- What they built
- What's left / known issues
- Decisions they made and reasoning
- Their mental model of their section
- Saved as `handoffs/<role>-<name>.md` in the repo

### Group Handoff (PM Generates)

- Overall project status
- Architecture as-built (may differ from original scaffold)
- Decisions log from all meetings
- What's done, what's remaining
- Cross-role dependencies and their current state
- Saved as `handoffs/SESSION-SUMMARY.md`

### Code Distribution

1. PM does a final merge of all role branches into `main`
2. Resolves any remaining conflicts (with help from relevant people if needed)
3. Each peer pulls the final `main` before disconnecting
4. Peers can clone the full repo if they want all branch history

### Resuming Later

- Host keeps full session state: git repo, conversation IDs, roles, handoff docs
- Next time: host starts a new session with **"Resume previous"** option
- Peers reconnect — agents resume from conversation IDs (or handoff docs as fallback)
- PM re-reads the group handoff and picks up coordination where it left off

---

## 9. Security Model

### Trust Model

**Trust no infrastructure. Trust the invite code.**

The host sees everything — this is by design. They are the PM. The invite code is the entire auth system. Share it only with people you want in the session.

### Encryption Layers

1. **Layer 1: ngrok TLS** — transport encryption (ngrok can see plaintext at their edge)
2. **Layer 2: NaCl E2E** — application-level encryption on top of TLS

All messages, git data, file transfers, and chat are wrapped in Layer 2 before hitting the WebSocket. ngrok sees only encrypted blobs.

### Key Exchange

1. Invite code (e.g., `VIBE-CORAL-7X`) encodes the ngrok URL + a PAKE seed
2. On connect, client and server perform a **SPAKE2** handshake using the seed
3. Both sides derive the same symmetric key — key never crosses the wire
4. Each peer gets a unique derived key (host holds N keys, one per peer)

### Message Routing

Peer-to-peer messages are routed through the host:
- Peer A encrypts with their key → host decrypts → host re-encrypts with Peer B's key → Peer B decrypts
- The host CAN read all messages. This is intentional — the PM agent needs full visibility.

### Invite Code Lifecycle

- Generated fresh per session
- Single-use per peer slot (code + peer identity = one connection)
- Host can revoke/regenerate if compromised
- Code expires when session ends

### What Each Party Can See

| Party | Can See |
|-------|---------|
| Host | Everything (by design — they're the PM) |
| Peers | Their own work + PM broadcasts + meeting chat |
| ngrok | Encrypted blobs (nothing useful) |
| Someone with the code | Everything, once connected |

**No auth servers. No accounts. No OAuth.** The code is trust.

---

## 10. Tech Stack & Dependencies

### Core

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript | Type safety, Claude Code SDK compatibility |
| Runtime | Node.js | Async networking, SDK support |
| TUI Framework | Ink (React for CLI) | Rich terminal UI with components |
| Claude Integration | `@anthropic-ai/claude-code` SDK | Spawn and manage agents programmatically |
| WebSocket | `ws` | Real-time bidirectional communication |
| Encryption | `tweetnacl` / `libsodium-wrappers` | NaCl E2E encryption |
| Key Exchange | SPAKE2 implementation | Password-authenticated key exchange from invite code |
| Tunnel | `ngrok` (npm package) | NAT-punching, expose local server |
| Git Server | `node-git-server` or similar | Smart HTTP git serving over tunnel |
| Git Operations | `simple-git` | Programmatic git from Node |

### Project Structure (TribeVibe itself)

```
tribevibe/
├── src/
│   ├── server/           # Host-side: WebSocket server, git server, session state
│   │   ├── index.ts
│   │   ├── ws-server.ts
│   │   ├── git-server.ts
│   │   ├── session.ts
│   │   └── tunnel.ts
│   ├── client/           # Peer-side: WebSocket client, agent management
│   │   ├── index.ts
│   │   ├── ws-client.ts
│   │   └── agent.ts
│   ├── pm/               # PM agent: coordination, status tracking, meeting management
│   │   ├── index.ts
│   │   ├── coordinator.ts
│   │   ├── status-tracker.ts
│   │   └── meeting.ts
│   ├── crypto/           # Encryption: SPAKE2, NaCl wrappers, invite code encoding
│   │   ├── spake2.ts
│   │   ├── nacl.ts
│   │   └── invite-code.ts
│   ├── tui/              # Ink components: lobby, chat, work view, meeting view
│   │   ├── App.tsx
│   │   ├── Lobby.tsx
│   │   ├── WorkView.tsx
│   │   ├── MeetingView.tsx
│   │   ├── ChatPanel.tsx
│   │   └── StatusBar.tsx
│   ├── git/              # Git operations: branch management, sync, conflict detection
│   │   ├── bare-repo.ts
│   │   ├── sync.ts
│   │   └── conflicts.ts
│   └── shared/           # Shared types, message protocol, constants
│       ├── types.ts
│       ├── protocol.ts
│       └── constants.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 11. Message Protocol

All messages between host and peers follow this structure:

```typescript
interface TribeVibeMessage {
  type: MessageType;
  from: string;          // participant ID
  to: string | 'all';   // recipient or broadcast
  timestamp: number;
  payload: unknown;      // type-specific data
}

type MessageType =
  // Connection
  | 'join'              // peer joining lobby
  | 'lobby-update'      // who's in the lobby
  | 'session-start'     // host kicks off
  | 'reconnect'         // peer resuming

  // Planning phase
  | 'chat'              // open chat message
  | 'proposal'          // PM proposing something
  | 'vote'              // participant voting on proposal
  | 'role-assignment'   // PM assigning roles
  | 'scaffold-ready'    // PM finished scaffolding

  // Individual work phase
  | 'agent-update'      // agent sending .md update to PM
  | 'pm-broadcast'      // PM sending alignment update to all
  | 'pm-targeted'       // PM sending update to specific person
  | 'cross-role-request'// requesting change in another role's scope
  | 'cross-role-response'// responding to cross-role request

  // Meetings
  | 'meeting-recommend' // PM recommending sync to host
  | 'meeting-approve'   // host approving meeting
  | 'meeting-start'     // meeting beginning (grace period)
  | 'meeting-active'    // meeting fully started
  | 'floor-assign'      // PM giving floor to specific people
  | 'butt-in'           // someone pressing butt-in button
  | 'meeting-decision'  // PM recording a decision
  | 'meeting-dismiss'   // host ending meeting

  // Session lifecycle
  | 'end-session'       // host ending session
  | 'handoff-individual'// agent's handoff doc
  | 'handoff-group'     // PM's group summary
  | 'final-sync'        // last git sync before disconnect
  | 'goodbye';          // peer disconnecting
```

Messages are serialized as JSON, then encrypted with NaCl before transmission.

---

## 12. Session State (Persisted on Host)

```typescript
interface SessionState {
  id: string;
  createdAt: number;
  inviteCodeSeed: string;     // for reconnect key derivation
  phase: 'lobby' | 'planning' | 'working' | 'meeting' | 'ending';

  participants: {
    id: string;
    name: string;
    role: string | null;
    scope: string[];           // directories they own
    connected: boolean;
    conversationId: string;    // Claude Code SDK conversation ID
    lastUpdate: number;
  }[];

  git: {
    bareRepoPath: string;
    branches: string[];
    lastMerge: number;
  };

  decisions: {
    timestamp: number;
    description: string;
    votedBy: string[];
  }[];

  masterStatusDoc: string;     // PM's running summary
}
```

Persisted to `~/.tribevibe/sessions/<id>.json` so the host can resume after crashes or restarts.

---

## 13. PM Agent System Prompt (Template)

The PM agent is spawned with a system prompt that establishes its role:

```
You are the Project Manager for a TribeVibe collaborative coding session.

## Your Role
- Coordinate {N} developers working on: {project description}
- Track progress across all roles
- Detect drift, conflicts, and alignment issues
- Facilitate meetings when needed
- Maintain the master status document

## Current Participants
{foreach participant}
- {name}: {role} — owns {scope directories}
{end}

## Project Structure
{scaffold / repo overview}

## Shared Contracts
{contents of shared/contracts}

## Your Behaviors
- Monitor incoming agent updates for conflicts or drift
- When you detect an issue, recommend a meeting to the host with a clear reason
- During meetings: present status board, facilitate item-by-item discussion, record decisions
- Between meetings: send targeted updates when one role's changes affect another
- Use the debounce pattern for chat responses — don't respond to every message
- Never modify code directly — you coordinate, you don't implement
- Update the master status doc after every significant event
```

---

## 14. Non-Goals (Out of Scope for V1)

- **Web UI** — this is a terminal app only
- **More than 5 participants** — keep it tight
- **Persistent user accounts** — invite code is the auth
- **Cloud hosting** — host machine is the server
- **Voice/video** — text chat and agent coordination only
- **Real-time collaborative editing** — each person owns their scope, no simultaneous edits on same files
- **Plugin system** — hardcoded workflow for V1
- **Mobile support** — desktop terminals only

---

## 15. Open Questions for Implementation

1. **Invite code encoding:** Exact format for packing ngrok URL + PAKE seed into a short human-friendly code. Base58? Custom word list?
2. **Git smart HTTP server:** Best Node.js library for this, or roll a thin wrapper around git commands?
3. **Agent update frequency:** How does the agent decide what constitutes a "meaningful chunk" worth reporting? Token count? Commit count? Time-based?
4. **SPAKE2 library:** Need a solid TypeScript/Node implementation. May need to wrap a Rust/C library.
5. **Ngrok free tier limits:** Connection limits, bandwidth, session duration. May need a paid plan for real use.
6. **Ink performance:** How well does Ink handle rapid chat updates with multiple panels? May need virtualized scrolling.
