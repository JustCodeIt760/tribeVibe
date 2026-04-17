import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import crypto from 'crypto';
import { Lobby } from './Lobby.js';
import { ChatView, type ChatMessage, type ActiveProposal } from './ChatView.js';
import { MeetingView, type MeetingTranscriptLine } from './MeetingView.js';
import type {
  LobbyParticipant,
  SessionPhase,
  MeetingItem,
  TribeVibeMessage,
  ChatPayload,
  ProposalPayload,
  VotePayload,
  VoteResultPayload,
  RoleAssignmentPayload,
  ScaffoldReadyPayload,
  MeetingRecommendPayload,
  MeetingStartPayload,
  MeetingActivePayload,
  FloorAssignPayload,
  ButtInPayload,
  MeetingDecisionPayload,
  MeetingDismissPayload,
  AgentUpdatePayload,
  PmBroadcastPayload,
} from '../shared/protocol.js';
import { makeMessage } from '../shared/protocol.js';
import { TribeVibeServer } from '../server/ws-server.js';
import { startTunnel, type TunnelHandle, type TunnelProvider } from '../server/tunnel.js';
import { encodeInviteCode, inviteCodePrefix, newSeed } from '../crypto/invite-code.js';
import { initBareRepo, seedInitialCommit, createRoleBranches } from '../git/bare-repo.js';
import { startGitHttpServer, type GitHttpHandle } from '../git/http-server.js';
import { PMCoordinator, type PMAction } from '../pm/coordinator.js';
import { exploreRepo, formatRepoOverview } from '../pm/explore-repo.js';
import { saveSession, type PersistedSession } from '../session/persistence.js';
import { writeHandoffs, writeHandoffMemories } from '../session/handoff.js';
import { ErrorBanner } from './ErrorBanner.js';

type BootPhase =
  | 'booting'
  | 'lobby'
  | 'planning'
  | 'working'
  | 'meeting'
  | 'ending'
  | 'ended'
  | 'error';

interface ActiveVote {
  proposal: ProposalPayload;
  votes: Map<string, 'yes' | 'no' | 'abstain'>;
}

export interface HostAppProps {
  hostName: string;
  localPort: number;
  projectName: string;
  brownfield: boolean;
  /** If true, skip tunnel and expose the server on 127.0.0.1 (single-machine testing). */
  local?: boolean;
  /** Which tunnel provider to use ('auto' picks based on NGROK_AUTHTOKEN). */
  tunnelProvider?: TunnelProvider;
}

export function HostApp({
  hostName,
  localPort,
  projectName,
  brownfield,
  local = false,
  tunnelProvider = 'auto',
}: HostAppProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<BootPhase>('booting');
  const [bootStatus, setBootStatus] = useState<string>('Starting server...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProposal, setActiveProposal] = useState<ActiveProposal | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [meetingItems, setMeetingItems] = useState<MeetingItem[]>([]);
  const [meetingIdx, setMeetingIdx] = useState<number>(0);
  const [meetingReason, setMeetingReason] = useState<string>('');
  const [meetingFloor, setMeetingFloor] = useState<string[]>([]);
  const [meetingTranscript, setMeetingTranscript] = useState<MeetingTranscriptLine[]>([]);
  const [lastPMUpdate, setLastPMUpdate] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const pushError = (msg: string) => setErrors((prev) => [...prev, msg]);

  // Refs so effects don't re-run on every state change
  const serverRef = useRef<TribeVibeServer | null>(null);
  const tunnelRef = useRef<TunnelHandle | null>(null);
  const gitTunnelRef = useRef<TunnelHandle | null>(null);
  const gitHttpRef = useRef<GitHttpHandle | null>(null);
  const pmRef = useRef<PMCoordinator | null>(null);
  const sessionIdRef = useRef<string>('');
  const bareRepoRef = useRef<string>('');
  const workRepoRef = useRef<string>('');
  const voteRef = useRef<ActiveVote | null>(null);
  const roleAssignmentsRef = useRef<Record<string, { role: string; scope: string[] }>>({});

  // ---------- Boot sequence ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seed = newSeed();
        const sid = crypto.randomUUID();
        sessionIdRef.current = sid;
        setSessionId(sid);

        setBootStatus('Initializing git bare repo...');
        const { bare, work } = await initBareRepo(sid);
        bareRepoRef.current = bare;
        workRepoRef.current = work;

        setBootStatus('Starting git HTTP server...');
        const gitHttp = await startGitHttpServer(bare, 0);
        gitHttpRef.current = gitHttp;

        setBootStatus('Starting WebSocket server...');
        const srv = new TribeVibeServer({
          port: localPort,
          seedHex: seed,
          hostName,
          gitUrl: null,
        });
        serverRef.current = srv;

        // The bare repo sits at <sessionDir>/repo.git, so node-git-server
        // serves it at the /repo.git path — include it in the published URL.
        const gitPath = '/repo.git';
        let wsUrl: string;
        if (local) {
          wsUrl = `http://127.0.0.1:${localPort}`;
          srv.setGitUrl(`http://127.0.0.1:${gitHttp.port}${gitPath}`);
        } else {
          setBootStatus(`Opening ${tunnelProvider === 'auto' ? 'tunnel' : tunnelProvider} for WebSocket...`);
          const tun = await startTunnel(localPort, tunnelProvider);
          tunnelRef.current = tun;
          wsUrl = tun.url;

          setBootStatus(`Opening ${tun.provider} tunnel for git HTTP...`);
          try {
            const gitTun = await startTunnel(gitHttp.port, tun.provider);
            gitTunnelRef.current = gitTun;
            srv.setGitUrl(`${gitTun.url}${gitPath}`);
          } catch {
            srv.setGitUrl(null);
          }
        }

        const code = encodeInviteCode({ url: wsUrl, seed });
        setInviteCode(code);

        srv.on('lobby-changed', () => {
          if (!cancelled) setParticipants(srv.session.toLobbyList());
        });

        srv.on('peer-joined', (id, name) => {
          appendSystemMessage(`${name} joined the session.`);
        });

        srv.on('peer-reconnected', (id, name) => {
          appendSystemMessage(`${name} reconnected — restoring their role.`);
          // Re-send the assignment + scaffold state so their UI rehydrates.
          const a = roleAssignmentsRef.current[id];
          if (a) {
            srv.sendTo(id, makeMessage('role-assignment', 'host', id, {
              assignments: [{ participantId: id, role: a.role, scope: a.scope }],
            }));
            srv.sendTo(id, makeMessage('scaffold-ready', 'host', id, {
              rootDir: projectName,
              summary: `Initial scaffold: src/{${Object.values(roleAssignmentsRef.current).map((v) => v.role).join(',')}}`,
              branches: ['main'],
            }));
          }
          // Also nudge current phase so their UI routes correctly.
          srv.sendTo(id, makeMessage('phase-change', 'host', id, {
            phase: srv.session.phase,
            reason: 'reconnect',
          }));
        });

        srv.on('peer-left', (id) => {
          appendSystemMessage(`${id} disconnected.`);
        });

        srv.on('message', (msg) => handleIncomingMessage(msg));

        setParticipants(srv.session.toLobbyList());
        setPhase('lobby');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function appendChat(m: Omit<ChatMessage, 'id' | 'timestamp'>): void {
    setMessages((prev) => [
      ...prev,
      { ...m, id: crypto.randomUUID(), timestamp: Date.now() },
    ]);
  }

  function appendSystemMessage(text: string): void {
    appendChat({ fromName: 'system', text, kind: 'system' });
  }

  function broadcastChat(fromName: string, text: string): void {
    const srv = serverRef.current;
    if (!srv) return;
    const payload: ChatPayload = { text, fromName };
    srv.broadcast(makeMessage('chat', 'host', 'all', payload));
  }

  // ---------- Start planning ----------
  async function handleStartPlanning(): Promise<void> {
    const srv = serverRef.current;
    if (!srv) return;
    srv.startSession(projectName, brownfield);
    setPhase('planning');

    // Initialize PM coordinator
    const pm = new PMCoordinator({
      projectName,
      brownfield,
      cwd: workRepoRef.current,
      participants: srv.session.toLobbyList().map((p) => ({
        id: p.id,
        name: p.name,
        role: null,
        scope: [],
      })),
      scaffoldSummary: '',
    });
    pmRef.current = pm;

    pm.on('action', (action: PMAction) => handlePMAction(action));
    pm.on('disabled', (reason) => appendSystemMessage(`[PM disabled] ${reason}`));
    pm.on('error', (err) => {
      appendSystemMessage(`[PM error] ${err}`);
      pushError(`PM agent error: ${err}`);
    });

    // Kick off planning phase with an opening prompt
    appendSystemMessage('Planning phase started. The PM will open soon.');

    if (brownfield) {
      // Scan the host's cwd (the existing project) and surface a summary
      // into chat + the PM's prompt. Deterministic — no LLM needed for the
      // scan itself.
      try {
        const overview = exploreRepo(process.cwd());
        const summary = formatRepoOverview(overview);
        appendChat({
          fromName: 'system',
          text: `Brownfield scan of ${process.cwd()}:\n${summary}`,
          kind: 'system',
        });
        pm.updateScaffold(summary);
        await pm.requestProposal(
          `Brownfield project — the team is joining an existing codebase. Here's what I scanned:\n\n${summary}\n\nOpen the planning phase: briefly summarize the stack and structure, then ask each participant what they want to work on next (e.g., features, refactors, bugs).`
        );
      } catch (err) {
        appendSystemMessage(`Brownfield scan failed: ${err instanceof Error ? err.message : err}`);
        await pm.requestProposal('Open the planning phase. Acknowledge the existing codebase and ask each participant what they want to work on.');
      }
    } else {
      await pm.requestProposal(
        'Open the planning phase. Greet the team, ask "What would you like to build today?" and explain each person gets a turn to share their vision.'
      );
    }
  }

  // ---------- PM action handler ----------
  function handlePMAction(action: PMAction): void {
    const srv = serverRef.current;
    if (!srv) return;
    setLastPMUpdate(Date.now());

    switch (action.kind) {
      case 'chat':
        if (action.text) {
          broadcastChat('PM', action.text);
          appendChat({ fromName: 'PM', text: action.text, kind: 'pm-broadcast' });
        }
        break;
      case 'broadcast':
        if (action.title && action.body) {
          const payload: PmBroadcastPayload = { title: action.title, body: action.body };
          srv.broadcast(makeMessage('pm-broadcast', 'host', 'all', payload));
          appendChat({
            fromName: 'PM',
            text: `${action.title}: ${action.body}`,
            kind: 'pm-broadcast',
          });
        }
        break;
      case 'targeted':
        if (action.targetName && action.body) {
          const target = srv.session.toLobbyList().find((p) => p.name === action.targetName);
          if (target) {
            srv.sendTo(
              target.id,
              makeMessage('pm-targeted', 'host', target.id, {
                targetId: target.id,
                title: action.title ?? '',
                body: action.body,
              })
            );
          }
        }
        break;
      case 'proposal':
        if (action.title && action.body) {
          const pid = crypto.randomUUID();
          const payload: ProposalPayload = {
            proposalId: pid,
            kind: action.kind_sub ?? 'general',
            title: action.title,
            body: action.body,
          };
          voteRef.current = { proposal: payload, votes: new Map() };
          setActiveProposal({ proposalId: pid, title: payload.title, body: payload.body });
          srv.broadcast(makeMessage('proposal', 'host', 'all', payload));
          appendChat({ fromName: 'PM', text: `[proposal] ${action.title}`, kind: 'proposal' });
        }
        break;
      case 'recommend-meeting':
        if (phase === 'working') {
          startMeeting(action.reason ?? 'sync', action.relevantNames ?? []);
        }
        break;
      case 'silent':
      default:
        break;
    }
  }

  // ---------- Incoming message router ----------
  function handleIncomingMessage(msg: TribeVibeMessage): void {
    const srv = serverRef.current;
    if (!srv) return;

    switch (msg.type) {
      case 'chat': {
        const p = msg.payload as ChatPayload;
        appendChat({ fromName: p.fromName, text: p.text, kind: 'chat' });
        // rebroadcast to all peers (the sender already sees their own message
        // locally)
        srv.broadcast(msg);
        pmRef.current?.observe({ fromName: p.fromName, text: p.text, kind: 'chat' });
        break;
      }
      case 'vote': {
        const p = msg.payload as VotePayload;
        const vr = voteRef.current;
        if (!vr || vr.proposal.proposalId !== p.proposalId) return;
        vr.votes.set(msg.from, p.value);
        // Tally and close when everyone voted (plus host auto-yes to keep it moving)
        const required = srv.session.toLobbyList().filter((x) => !x.isHost).length;
        if (vr.votes.size >= required) {
          closeVote();
        }
        break;
      }
      case 'agent-update': {
        const p = msg.payload as AgentUpdatePayload;
        pmRef.current?.status.recordUpdate(p);
        pmRef.current?.observe(
          {
            fromName: p.participantId,
            text: `${p.summary} — ${p.files.join(', ')}`,
            kind: 'agent-update',
          },
          'soft'
        );
        break;
      }
      case 'butt-in': {
        const p = msg.payload as ButtInPayload;
        const who = srv.session.toLobbyList().find((x) => x.id === msg.from);
        setMeetingTranscript((prev) => [
          ...prev,
          { fromName: who?.name ?? msg.from, text: p.text, kind: 'butt-in' },
        ]);
        srv.broadcast(msg);
        pmRef.current?.observe({ fromName: who?.name ?? msg.from, text: p.text, kind: 'butt-in' }, 'soft');
        break;
      }
      case 'cross-role-request': {
        // Peer sent a request addressed to a role. Resolve role → participant id.
        const p = msg.payload as { requestId: string; fromId: string; toId: string; title: string; body: string };
        const targetRole = p.toId.toLowerCase();
        const targetEntry = Object.entries(roleAssignmentsRef.current).find(
          ([, v]) => v.role.toLowerCase() === targetRole
        );

        if (!targetEntry) {
          // No one with that role — tell the requester
          srv.sendTo(msg.from, makeMessage('pm-targeted', 'host', msg.from, {
            targetId: msg.from,
            title: 'Request routing failed',
            body: `No peer has role "${targetRole}". Available roles: ${
              Object.values(roleAssignmentsRef.current).map((v) => v.role).join(', ') || '(none assigned)'
            }`,
          }));
          break;
        }
        const [targetId] = targetEntry;
        // Rewrite toId to actual participant id before forwarding
        const forwarded = makeMessage('cross-role-request', 'host', targetId, {
          ...p,
          toId: targetId,
        });
        srv.sendTo(targetId, forwarded);
        appendSystemMessage(
          `Routed cross-role request from ${p.fromId} → ${targetRole} (${targetId}): ${p.body.slice(0, 60)}`
        );
        pmRef.current?.observe({
          fromName: p.fromId,
          text: `cross-role request to ${targetRole}: ${p.body}`,
          kind: 'cross-role-request',
        }, 'soft');
        break;
      }
    }
  }

  // ---------- Vote closing ----------
  function closeVote(): void {
    const srv = serverRef.current;
    const vr = voteRef.current;
    if (!srv || !vr) return;

    let yes = 0, no = 0, abstain = 0;
    vr.votes.forEach((v) => {
      if (v === 'yes') yes++;
      else if (v === 'no') no++;
      else abstain++;
    });
    yes += 1; // host implicit yes for simplicity (could be wired to input)

    const accepted = yes > no;
    const payload: VoteResultPayload = {
      proposalId: vr.proposal.proposalId,
      result: accepted ? 'accepted' : 'rejected',
      tally: { yes, no, abstain },
    };
    srv.broadcast(makeMessage('vote-result', 'host', 'all', payload));
    appendChat({
      fromName: 'PM',
      text: `Vote ${payload.result}: ${yes}y / ${no}n / ${abstain}a — "${vr.proposal.title}"`,
      kind: 'vote-result',
    });
    setActiveProposal(null);
    voteRef.current = null;

    if (accepted && vr.proposal.kind === 'scaffold') {
      finalizeScaffold();
    }
  }

  // ---------- Scaffold finalization ----------
  async function finalizeScaffold(): Promise<void> {
    const srv = serverRef.current;
    if (!srv) return;

    // Auto-assign roles: naive round-robin for MVP
    const roles = ['frontend', 'backend', 'database', 'testing'];
    const peers = srv.session.toLobbyList().filter((p) => !p.isHost);
    const assignments: Record<string, { role: string; scope: string[] }> = {};
    peers.forEach((p, i) => {
      const r = roles[i % roles.length]!;
      assignments[p.id] = { role: r, scope: [`src/${r}/`] };
    });
    roleAssignmentsRef.current = assignments;

    // Seed initial commit
    const files: Record<string, string> = {
      'README.md': `# ${projectName}\n\nCollaboratively built via TribeVibe.\n`,
      '.gitignore': 'node_modules/\ndist/\n',
    };
    for (const r of roles) {
      files[`src/${r}/.keep`] = '';
    }
    await seedInitialCommit(workRepoRef.current, files, hostName, `${hostName}@tribevibe`);
    await createRoleBranches(workRepoRef.current, roles);

    // Send role-assignment FIRST so peers set their branchRef before
    // scaffold-ready triggers their git clone on the correct branch.
    const rapayload: RoleAssignmentPayload = {
      assignments: Object.entries(assignments).map(([pid, a]) => ({
        participantId: pid,
        role: a.role,
        scope: a.scope,
      })),
    };
    srv.broadcast(makeMessage('role-assignment', 'host', 'all', rapayload));

    const srpayload: ScaffoldReadyPayload = {
      rootDir: projectName,
      summary: 'Initial scaffold: src/{frontend,backend,database,testing}',
      branches: ['main', ...roles.map((r) => `role/${r}`), 'shared/contracts'],
    };
    srv.broadcast(makeMessage('scaffold-ready', 'host', 'all', srpayload));

    // Update PM with roles + scaffold
    pmRef.current?.updateParticipants(
      srv.session.toLobbyList().map((p) => ({
        id: p.id,
        name: p.name,
        role: assignments[p.id]?.role ?? null,
        scope: assignments[p.id]?.scope ?? [],
      }))
    );
    pmRef.current?.updateScaffold(srpayload.summary);

    for (const [pid, a] of Object.entries(assignments)) {
      pmRef.current?.status.registerRole(
        pid,
        srv.session.toLobbyList().find((p) => p.id === pid)?.name ?? pid,
        a.role,
        a.scope
      );
    }

    appendSystemMessage('Scaffold ready. Type /start to begin the work phase.');
  }

  // ---------- Work phase start ----------
  function handleStartWork(): void {
    const srv = serverRef.current;
    if (!srv) return;
    srv.emitPhase('working');
    setPhase('working');
    appendSystemMessage('Work phase started. Peers can now chat with their agents.');
  }

  // ---------- Meeting ----------
  function startMeeting(reason: string, relevantNames: string[]): void {
    const srv = serverRef.current;
    if (!srv) return;

    const items: MeetingItem[] = [];

    // Auto-generate items from StatusTracker:
    // 1. Each file overlap between roles becomes a discussion item.
    if (pmRef.current) {
      const overlaps = pmRef.current.status.detectFileOverlaps();
      for (const o of overlaps) {
        items.push({
          id: crypto.randomUUID(),
          title: `File overlap: ${o.file}`,
          context: `${o.participantIds.length} roles are both touching ${o.file}. Decide who owns it.`,
          relevantParticipantIds: o.participantIds,
        });
      }

      // 2. Recent agent updates (last 5) as context items the team may
      //    want to discuss.
      const roleStatuses = pmRef.current.status.listRoles();
      const recentUpdates = roleStatuses
        .filter((r) => r.updates.length > 0)
        .map((r) => ({ role: r, last: r.updates[r.updates.length - 1]! }))
        .sort((a, b) => (b.role.lastUpdate ?? 0) - (a.role.lastUpdate ?? 0))
        .slice(0, 3);
      for (const { role, last } of recentUpdates) {
        items.push({
          id: crypto.randomUUID(),
          title: `${role.name} (${role.role}): ${last.summary}`,
          context: last.changes.slice(0, 200),
          relevantParticipantIds: [role.participantId],
        });
      }
    }

    // 3. Fallback item: always include the reason as a discussion item
    //    (even if there's no drift data to seed from).
    const relevantIds = srv.session
      .toLobbyList()
      .filter((p) => relevantNames.includes(p.name))
      .map((p) => p.id);
    items.push({
      id: crypto.randomUUID(),
      title: reason,
      context: 'Meeting reason supplied by host/PM.',
      relevantParticipantIds: relevantIds.length > 0
        ? relevantIds
        : srv.session.toLobbyList().filter((p) => !p.isHost).map((p) => p.id),
    });

    setMeetingItems(items);
    setMeetingIdx(0);
    setMeetingReason(reason);
    setMeetingFloor(items[0]!.relevantParticipantIds);
    setMeetingTranscript([]);

    const startPayload: MeetingStartPayload = { graceSeconds: 3, reason };
    srv.broadcast(makeMessage('meeting-start', 'host', 'all', startPayload));

    setTimeout(() => {
      const active: MeetingActivePayload = { items, currentItemIndex: 0 };
      srv.broadcast(makeMessage('meeting-active', 'host', 'all', active));
      const floor: FloorAssignPayload = {
        itemId: items[0]!.id,
        participantIds: items[0]!.relevantParticipantIds,
      };
      srv.broadcast(makeMessage('floor-assign', 'host', 'all', floor));
      srv.emitPhase('meeting');
      setPhase('meeting');
    }, 500);
  }

  function advanceMeeting(): void {
    const next = meetingIdx + 1;
    if (next >= meetingItems.length) {
      dismissMeeting();
      return;
    }
    setMeetingIdx(next);
    const srv = serverRef.current;
    if (!srv) return;
    const floor: FloorAssignPayload = {
      itemId: meetingItems[next]!.id,
      participantIds: meetingItems[next]!.relevantParticipantIds,
    };
    setMeetingFloor(meetingItems[next]!.relevantParticipantIds);
    srv.broadcast(makeMessage('floor-assign', 'host', 'all', floor));
  }

  function dismissMeeting(): void {
    const srv = serverRef.current;
    if (!srv) return;
    const payload: MeetingDismissPayload = { summary: 'Meeting ended.' };
    srv.broadcast(makeMessage('meeting-dismiss', 'host', 'all', payload));
    srv.emitPhase('working');
    setPhase('working');
    setMeetingItems([]);
    setMeetingTranscript([]);
  }

  // ---------- End session ----------
  async function endSession(): Promise<void> {
    setPhase('ending');
    const srv = serverRef.current;
    if (!srv) return;
    srv.broadcast(makeMessage('end-session', 'host', 'all', { reason: 'Host ended the session' }));

    // Persist session
    const persisted: PersistedSession = {
      id: sessionIdRef.current,
      createdAt: Date.now(),
      projectName,
      brownfield,
      inviteCodeSeed: srv.seedHex,
      phase: 'ending',
      hostName,
      participants: srv.session.toLobbyList().map((p) => ({
        id: p.id,
        name: p.name,
        role: roleAssignmentsRef.current[p.id]?.role ?? null,
        scope: roleAssignmentsRef.current[p.id]?.scope ?? [],
        conversationId: null,
        lastSeen: Date.now(),
      })),
      decisions: pmRef.current?.status.listDecisions().map((d) => ({
        timestamp: d.timestamp, description: d.description, reasoning: d.reasoning,
      })) ?? [],
      masterStatusDoc: pmRef.current?.status.toMarkdown() ?? '',
      gitBarePath: bareRepoRef.current,
      gitWorkPath: workRepoRef.current,
    };
    saveSession(persisted);

    if (pmRef.current) {
      writeHandoffs({
        workdir: workRepoRef.current,
        session: persisted,
        tracker: pmRef.current.status,
        individualHandoffs: [],
      });

      // Also write session summary + decisions as Claude Code memories so
      // future Claude Code sessions in this project inherit what was learned.
      // From there, `tribevibe push` can share them with teammates.
      try {
        const memFiles = writeHandoffMemories(persisted, pmRef.current.status, process.cwd());
        if (memFiles.length > 0) {
          appendSystemMessage(`Wrote ${memFiles.length} memory file(s) to ~/.claude/projects/ — run \`tribevibe push\` to share them.`);
        }
      } catch (err) {
        appendSystemMessage(`Could not write memory files: ${err instanceof Error ? err.message : err}`);
      }
    }

    setPhase('ended');
  }

  function handleQuit(): void {
    endSession().finally(() => {
      shutdown();
      exit();
    });
  }

  async function shutdown(): Promise<void> {
    await serverRef.current?.close().catch(() => {});
    await tunnelRef.current?.close().catch(() => {});
    await gitTunnelRef.current?.close().catch(() => {});
    await gitHttpRef.current?.close().catch(() => {});
    pmRef.current?.abort();
  }

  // ---------- Render ----------
  const withErrors = (node: React.ReactElement): React.ReactElement => (
    <Box flexDirection="column">
      <ErrorBanner errors={errors} />
      {node}
    </Box>
  );

  if (phase === 'booting') {
    return withErrors(
      <Box padding={1}>
        <Text>
          <Text color="cyan">[tribevibe host]</Text> {bootStatus}
        </Text>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {errorMsg}</Text>
        <Text dimColor>
          Tips: try --tunnel localtunnel (no signup), --tunnel ngrok (needs
          NGROK_AUTHTOKEN), or --local (same-machine testing only).
        </Text>
      </Box>
    );
  }

  if (phase === 'lobby') {
    const peerCount = participants.filter((p) => !p.isHost).length;
    return withErrors(
      <Lobby
        title="TRIBEVIBE (host)"
        inviteCodeDisplay={inviteCodePrefix(inviteCode)}
        fullInviteCode={inviteCode}
        participants={participants}
        status={
          peerCount === 0
            ? 'Waiting for peers to join...'
            : `${peerCount} peer(s) connected. Press Enter to start planning.`
        }
        isHost
        canStart={peerCount > 0}
        onStart={handleStartPlanning}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'planning') {
    return withErrors(
      <ChatView
        phase="planning"
        myName={hostName}
        participants={participants}
        messages={messages}
        activeProposal={activeProposal}
        isHost
        canStartWork={Object.keys(roleAssignmentsRef.current).length > 0}
        onSend={(text) => {
          broadcastChat(hostName, text);
          appendChat({ fromName: hostName, text, kind: 'chat' });
          pmRef.current?.observe({ fromName: hostName, text, kind: 'chat' });
        }}
        onStartWork={handleStartWork}
        onScaffold={() => {
          appendSystemMessage('Host triggered /scaffold manually.');
          void finalizeScaffold();
        }}
        onPmPrompt={(text) => {
          appendChat({ fromName: hostName, text: `/pm ${text}`, kind: 'chat' });
          void pmRef.current?.requestProposal(text);
        }}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'working') {
    return withErrors(
      <ChatView
        phase="working"
        myName={hostName}
        participants={participants}
        messages={messages}
        isHost
        onSend={(text) => {
          broadcastChat(hostName, text);
          appendChat({ fromName: hostName, text, kind: 'chat' });
          pmRef.current?.observe({ fromName: hostName, text, kind: 'chat' });
        }}
        onPmPrompt={(text) => {
          appendChat({ fromName: hostName, text: `/pm ${text}`, kind: 'chat' });
          void pmRef.current?.requestProposal(text);
        }}
        onCallMeeting={(reason) => {
          appendSystemMessage(`Host called a meeting: "${reason}"`);
          startMeeting(reason, []);
        }}
        onEndSession={() => {
          appendSystemMessage('Host ended the session.');
          void endSession();
        }}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'meeting') {
    return withErrors(
      <MeetingView
        phase="meeting"
        myName={hostName}
        participants={participants}
        myParticipantId="host"
        items={meetingItems}
        currentItemIndex={meetingIdx}
        floorParticipantIds={meetingFloor}
        transcript={meetingTranscript}
        reason={meetingReason}
        isHost
        onSpeak={(text) => {
          setMeetingTranscript((prev) => [
            ...prev,
            { fromName: hostName, text, kind: 'speaker' },
          ]);
          // Send as a chat during meeting
          broadcastChat(hostName, `[meeting] ${text}`);
        }}
        onButtIn={(text) => {
          setMeetingTranscript((prev) => [
            ...prev,
            { fromName: hostName, text, kind: 'butt-in' },
          ]);
        }}
        onAdvance={advanceMeeting}
        onDismiss={dismissMeeting}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'ending' || phase === 'ended') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Session ended.</Text>
        <Text dimColor>Handoffs written to: {workRepoRef.current}/handoffs/</Text>
        <Text dimColor>Session persisted to: ~/.tribevibe/sessions/{sessionIdRef.current}/</Text>
        <Text dimColor>Press Ctrl+C to exit.</Text>
      </Box>
    );
  }

  return <Text>Unknown phase: {phase}</Text>;
}
