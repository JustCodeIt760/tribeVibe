import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { Lobby } from './Lobby.js';
import { ChatView, type ChatMessage, type ActiveProposal } from './ChatView.js';
import { WorkView } from './WorkView.js';
import { MeetingView, type MeetingTranscriptLine } from './MeetingView.js';
import type {
  LobbyParticipant,
  TribeVibeMessage,
  ChatPayload,
  ProposalPayload,
  VoteResultPayload,
  RoleAssignmentPayload,
  ScaffoldReadyPayload,
  MeetingStartPayload,
  MeetingActivePayload,
  FloorAssignPayload,
  MeetingDecisionPayload,
  MeetingDismissPayload,
  PmBroadcastPayload,
  PmTargetedPayload,
  SessionPhase,
  SessionStartPayload,
  PhaseChangePayload,
  HelloPayload,
  ButtInPayload,
  AgentUpdatePayload,
} from '../shared/protocol.js';
import { makeMessage } from '../shared/protocol.js';
import { TribeVibeClient } from '../client/ws-client.js';
import { decodeInviteCode } from '../crypto/invite-code.js';
import { PeerAgent } from '../agent/spawn.js';
import { peerAgentSystemPrompt } from '../agent/system-prompt.js';
import { clonePeerWorkdir, autoCommitPush } from '../git/sync.js';
import { ErrorBanner } from './ErrorBanner.js';

type UIPhase =
  | 'connecting'
  | 'lobby'
  | 'planning'
  | 'working'
  | 'meeting'
  | 'ended'
  | 'disconnected'
  | 'error';

export interface JoinAppProps {
  inviteCode: string;
  displayName: string;
}

export function JoinApp({
  inviteCode,
  displayName,
}: JoinAppProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<UIPhase>('connecting');
  const [status, setStatus] = useState<string>('Decoding invite code...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [hostName, setHostName] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProposal, setActiveProposal] = useState<ActiveProposal | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myScope, setMyScope] = useState<string[]>([]);
  const [scaffoldSummary, setScaffoldSummary] = useState<string>('');
  const [agentOutput, setAgentOutput] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [meetingItems, setMeetingItems] = useState<Parameters<typeof MeetingView>[0]['items']>([]);
  const [meetingIdx, setMeetingIdx] = useState<number>(0);
  const [meetingFloor, setMeetingFloor] = useState<string[]>([]);
  const [meetingReason, setMeetingReason] = useState<string>('');
  const [meetingTranscript, setMeetingTranscript] = useState<MeetingTranscriptLine[]>([]);
  const [lastPMUpdate, setLastPMUpdate] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const pushError = (m: string) => setErrors((prev) => [...prev, m]);

  const clientRef = useRef<TribeVibeClient | null>(null);
  const agentRef = useRef<PeerAgent | null>(null);
  const myIdRef = useRef<string>('');
  const workdirRef = useRef<string>('');
  const branchRef = useRef<string>('main');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const payload = decodeInviteCode(inviteCode);
        setStatus(`Connecting to ${payload.url}...`);

        const c = new TribeVibeClient({
          url: payload.url,
          seedHex: payload.seed,
          displayName,
        });
        clientRef.current = c;

        c.on('welcome', (p) => {
          if (cancelled) return;
          setHostName(p.hostName);
          myIdRef.current = p.participantId;
          setPhase('lobby');
          setStatus(`Connected. Host: ${p.hostName}`);
        });
        c.on('lobby-update', (ps) => !cancelled && setParticipants(ps));
        c.on('session-start', (p: SessionStartPayload) => {
          if (cancelled) return;
          setProjectName(p.projectName);
          setPhase('planning');
        });
        c.on('phase-change', (p: PhaseChangePayload) => {
          if (cancelled) return;
          if (p.phase === 'working') setPhase('working');
          else if (p.phase === 'meeting') setPhase('meeting');
          else if (p.phase === 'planning') setPhase('planning');
          else if (p.phase === 'ending') setPhase('ended');
        });
        c.on('disconnected', (reason) => {
          if (cancelled) return;
          setPhase('disconnected');
          setStatus(`Disconnected: ${reason}`);
        });
        c.on('message', (msg: TribeVibeMessage) => handleMessage(msg));

        await c.connect();
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      agentRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode, displayName]);

  function appendChat(m: Omit<ChatMessage, 'id' | 'timestamp'>): void {
    setMessages((prev) => [
      ...prev,
      { ...m, id: crypto.randomUUID(), timestamp: Date.now() },
    ]);
  }

  function handleMessage(msg: TribeVibeMessage): void {
    switch (msg.type) {
      case 'chat': {
        const p = msg.payload as ChatPayload;
        appendChat({ fromName: p.fromName, text: p.text, kind: 'chat' });
        break;
      }
      case 'proposal': {
        const p = msg.payload as ProposalPayload;
        setActiveProposal({ proposalId: p.proposalId, title: p.title, body: p.body });
        appendChat({ fromName: 'PM', text: `[proposal] ${p.title}`, kind: 'proposal' });
        break;
      }
      case 'vote-result': {
        const p = msg.payload as VoteResultPayload;
        setActiveProposal(null);
        appendChat({
          fromName: 'PM',
          text: `Vote ${p.result}: ${p.tally.yes}y / ${p.tally.no}n / ${p.tally.abstain}a`,
          kind: 'vote-result',
        });
        break;
      }
      case 'role-assignment': {
        const p = msg.payload as RoleAssignmentPayload;
        const mine = p.assignments.find((a) => a.participantId === myIdRef.current);
        if (mine) {
          setMyRole(mine.role);
          setMyScope(mine.scope);
          const newBranch = `role/${mine.role.toLowerCase().replace(/\s+/g, '-')}`;
          const prevBranch = branchRef.current;
          branchRef.current = newBranch;
          setLastPMUpdate(Date.now());
          appendChat({
            fromName: 'system',
            text: `Assigned role: ${mine.role} (scope: ${mine.scope.join(', ')})`,
            kind: 'system',
          });
          // If workdir is already cloned (role-assignment arrived after
          // scaffold-ready), switch to the correct branch.
          if (workdirRef.current && prevBranch !== newBranch) {
            void (async () => {
              try {
                const { simpleGit } = await import('simple-git');
                const g = simpleGit(workdirRef.current);
                await g.fetch('origin', newBranch).catch(() => {});
                await g.checkout(newBranch);
              } catch (err) {
                pushError(`couldn't switch to branch ${newBranch}: ${err instanceof Error ? err.message : err}`);
              }
            })();
          }
        }
        break;
      }
      case 'scaffold-ready': {
        const p = msg.payload as ScaffoldReadyPayload;
        setScaffoldSummary(p.summary);
        appendChat({ fromName: 'system', text: `Scaffold ready: ${p.summary}`, kind: 'system' });
        void preparePeerWorkdir();
        break;
      }
      case 'pm-broadcast': {
        const p = msg.payload as PmBroadcastPayload;
        setNotifications((prev) => [...prev, `${p.title}: ${p.body}`]);
        appendChat({ fromName: 'PM', text: `${p.title}: ${p.body}`, kind: 'pm-broadcast' });
        setLastPMUpdate(Date.now());
        break;
      }
      case 'pm-targeted': {
        const p = msg.payload as PmTargetedPayload;
        if (p.targetId === myIdRef.current) {
          setNotifications((prev) => [...prev, `(for you) ${p.title}: ${p.body}`]);
          setLastPMUpdate(Date.now());
        }
        break;
      }
      case 'meeting-start': {
        const p = msg.payload as MeetingStartPayload;
        setMeetingReason(p.reason);
        appendChat({
          fromName: 'system',
          text: `Meeting starting in ${p.graceSeconds}s — finish your thought.`,
          kind: 'system',
        });
        break;
      }
      case 'meeting-active': {
        const p = msg.payload as MeetingActivePayload;
        setMeetingItems(p.items);
        setMeetingIdx(p.currentItemIndex);
        setPhase('meeting');
        break;
      }
      case 'floor-assign': {
        const p = msg.payload as FloorAssignPayload;
        setMeetingFloor(p.participantIds);
        break;
      }
      case 'butt-in': {
        const p = msg.payload as ButtInPayload;
        const who = participants.find((x) => x.id === msg.from);
        setMeetingTranscript((prev) => [
          ...prev,
          { fromName: who?.name ?? msg.from, text: p.text, kind: 'butt-in' },
        ]);
        break;
      }
      case 'meeting-decision': {
        const p = msg.payload as MeetingDecisionPayload;
        setMeetingTranscript((prev) => [
          ...prev,
          { fromName: 'PM', text: `Decision: ${p.decision}`, kind: 'decision' },
        ]);
        break;
      }
      case 'meeting-dismiss': {
        setPhase('working');
        setMeetingItems([]);
        setMeetingTranscript([]);
        appendChat({ fromName: 'system', text: 'Meeting dismissed.', kind: 'system' });
        break;
      }
      case 'end-session': {
        setPhase('ended');
        break;
      }
    }
  }

  async function preparePeerWorkdir(): Promise<void> {
    const c = clientRef.current;
    if (!c || !c.gitUrl) return;
    const dir = path.join(
      os.tmpdir(),
      `tribevibe-${projectName || 'project'}-${myIdRef.current}`
    );
    workdirRef.current = dir;

    try {
      await clonePeerWorkdir(c.gitUrl, dir, branchRef.current || 'main');
      setNotifications((prev) => [...prev, `Cloned workdir to ${dir}`]);
    } catch (err) {
      setNotifications((prev) => [
        ...prev,
        `Clone failed: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  }

  function ensureAgent(): PeerAgent {
    if (agentRef.current) return agentRef.current;

    const systemPrompt = peerAgentSystemPrompt({
      participantName: displayName,
      role: myRole ?? 'developer',
      scope: myScope,
      projectName: projectName || 'project',
      scaffoldSummary,
      sharedContracts: '',
      teamContext: `Team: ${participants.map((p) => p.name).join(', ')}`,
    });

    const agent = new PeerAgent({
      systemPrompt,
      cwd: workdirRef.current || process.cwd(),
      onUpdate: (update) => {
        const c = clientRef.current;
        if (!c) return;
        const payload: AgentUpdatePayload = {
          ...update,
          participantId: myIdRef.current,
        };
        c.send(makeMessage('agent-update', myIdRef.current, 'host', payload));
      },
    });

    agent.on('assistant-text', (text: string) => {
      setAgentOutput((prev) => [...prev, text]);
    });
    agent.on('error', (e: string) => {
      setAgentOutput((prev) => [...prev, `[agent error] ${e}`]);
    });

    agentRef.current = agent;
    return agent;
  }

  function sendChat(text: string): void {
    const c = clientRef.current;
    if (!c) return;
    const payload: ChatPayload = { text, fromName: displayName };
    c.send(makeMessage('chat', myIdRef.current, 'all', payload));
    appendChat({ fromName: displayName, text, kind: 'chat' });
  }

  function sendVote(value: 'yes' | 'no' | 'abstain'): void {
    const c = clientRef.current;
    const proposal = activeProposal;
    if (!c || !proposal) return;
    c.send(
      makeMessage('vote', myIdRef.current, 'host', {
        proposalId: proposal.proposalId,
        value,
      })
    );
    setActiveProposal({ ...proposal, myVote: value });
  }

  function sendToAgent(text: string): void {
    setAgentOutput((prev) => [...prev, `> ${text}`]);
    void ensureAgent().send(text, myIdRef.current);

    // Opportunistic auto-commit/push after an agent turn
    void (async () => {
      try {
        if (!workdirRef.current) return;
        await autoCommitPush(
          workdirRef.current,
          branchRef.current,
          `[${displayName}] ${text.slice(0, 60)}`
        );
      } catch (err) {
        pushError(`auto-push failed: ${err instanceof Error ? err.message : err}`);
      }
    })();
  }

  function sendButtIn(text: string): void {
    const c = clientRef.current;
    if (!c) return;
    const item = meetingItems[meetingIdx];
    if (!item) return;
    c.send(
      makeMessage<ButtInPayload>('butt-in', myIdRef.current, 'host', {
        itemId: item.id,
        text,
      })
    );
    setMeetingTranscript((prev) => [
      ...prev,
      { fromName: displayName, text, kind: 'butt-in' },
    ]);
  }

  function handleQuit(): void {
    clientRef.current?.disconnect();
    agentRef.current?.abort();
    exit();
  }

  // ---------- Render ----------
  const withErrors = (node: React.ReactElement): React.ReactElement => (
    <Box flexDirection="column">
      <ErrorBanner errors={errors} />
      {node}
    </Box>
  );

  if (phase === 'connecting') {
    return withErrors(
      <Box padding={1}>
        <Text>
          <Text color="cyan">[tribevibe join]</Text> {status}
        </Text>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {errorMsg}</Text>
      </Box>
    );
  }

  if (phase === 'disconnected') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">{status}</Text>
        <Text dimColor>Run `tribevibe join &lt;code&gt;` again to reconnect.</Text>
      </Box>
    );
  }

  if (phase === 'lobby') {
    return withErrors(
      <Lobby
        title={`TRIBEVIBE (joined ${hostName}'s session)`}
        participants={participants}
        status={status}
        isHost={false}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'planning') {
    return withErrors(
      <ChatView
        phase="planning"
        myName={displayName}
        myRole={myRole}
        participants={participants}
        messages={messages}
        activeProposal={activeProposal}
        isHost={false}
        onSend={sendChat}
        onVote={sendVote}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'working') {
    return withErrors(
      <WorkView
        phase="working"
        myName={displayName}
        myRole={myRole ?? 'developer'}
        myScope={myScope}
        participants={participants}
        agentOutput={agentOutput}
        notifications={notifications}
        lastPMUpdate={lastPMUpdate}
        onSendToAgent={sendToAgent}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'meeting') {
    return withErrors(
      <MeetingView
        phase="meeting"
        myName={displayName}
        myRole={myRole}
        participants={participants}
        myParticipantId={myIdRef.current}
        items={meetingItems}
        currentItemIndex={meetingIdx}
        floorParticipantIds={meetingFloor}
        transcript={meetingTranscript}
        reason={meetingReason}
        isHost={false}
        onSpeak={(text) => {
          sendChat(`[meeting] ${text}`);
          setMeetingTranscript((prev) => [
            ...prev,
            { fromName: displayName, text, kind: 'speaker' },
          ]);
        }}
        onButtIn={sendButtIn}
        onQuit={handleQuit}
      />
    );
  }

  if (phase === 'ended') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Session ended.</Text>
        <Text dimColor>Thanks for collaborating. Press Ctrl+C to exit.</Text>
      </Box>
    );
  }

  return <Text>Unknown phase: {phase}</Text>;
}
