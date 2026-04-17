import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useSafeInput } from './useSafeInput.js';
import type { LobbyParticipant, SessionPhase } from '../shared/protocol.js';
import { StatusBar } from './StatusBar.js';

export interface ChatMessage {
  id: string;
  fromName: string;
  text: string;
  timestamp: number;
  kind: 'chat' | 'pm-broadcast' | 'proposal' | 'vote-result' | 'system';
}

export interface ActiveProposal {
  proposalId: string;
  title: string;
  body: string;
  myVote?: 'yes' | 'no' | 'abstain';
}

export interface ChatViewProps {
  phase: SessionPhase;
  myName: string;
  myRole?: string | null;
  participants: LobbyParticipant[];
  messages: ChatMessage[];
  activeProposal?: ActiveProposal | null;
  isHost: boolean;
  canStartWork?: boolean;
  onSend: (text: string) => void;
  onVote?: (value: 'yes' | 'no' | 'abstain') => void;
  onStartWork?: () => void;
  onScaffold?: () => void;         // host: skip PM, scaffold manually
  onPmPrompt?: (text: string) => void; // manually ask PM something
  onCallMeeting?: (reason: string) => void; // host: trigger a meeting
  onEndSession?: () => void;       // host: end the whole session
  onQuit: () => void;
}

export function ChatView(props: ChatViewProps): React.ReactElement {
  const [input, setInput] = useState<string>('');

  useSafeInput((_ch, key) => {
    if (key.escape) props.onQuit();
  });

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0]!.toLowerCase();
      const rest = trimmed.slice(1 + parts[0]!.length).trim();

      if ((cmd === 'yes' || cmd === 'y') && props.onVote) { props.onVote('yes'); setInput(''); return; }
      if ((cmd === 'no' || cmd === 'n') && props.onVote) { props.onVote('no'); setInput(''); return; }
      if ((cmd === 'abstain' || cmd === 'a') && props.onVote) { props.onVote('abstain'); setInput(''); return; }
      if (cmd === 'start' && props.isHost && props.onStartWork) { props.onStartWork(); setInput(''); return; }
      if (cmd === 'scaffold' && props.isHost && props.onScaffold) { props.onScaffold(); setInput(''); return; }
      if (cmd === 'pm' && props.onPmPrompt) { props.onPmPrompt(rest || 'Please make a proposal or respond.'); setInput(''); return; }
      if (cmd === 'meeting' && props.isHost && props.onCallMeeting) { props.onCallMeeting(rest || 'Sync meeting'); setInput(''); return; }
      if (cmd === 'end' && props.isHost && props.onEndSession) { props.onEndSession(); setInput(''); return; }
      if (cmd === 'quit' || cmd === 'q') { props.onQuit(); return; }
    }

    props.onSend(trimmed);
    setInput('');
  }

  const recentMessages = props.messages.slice(-15);

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        phase={props.phase}
        participants={props.participants}
        myName={props.myName}
        myRole={props.myRole}
      />

      <Box flexDirection="column" flexGrow={1} padding={1}>
        {recentMessages.length === 0 ? (
          <Text dimColor>No messages yet. The PM will kick things off shortly.</Text>
        ) : (
          recentMessages.map((m) => (
            <Box key={m.id} marginBottom={0}>
              <Text>
                <Text color={colorFor(m)}>
                  {m.fromName}:
                </Text>
                {' '}
                {m.text}
              </Text>
            </Box>
          ))
        )}
      </Box>

      {props.activeProposal && (
        <Box borderStyle="round" borderColor="yellow" padding={1} flexDirection="column">
          <Text bold color="yellow">
            PROPOSAL: {props.activeProposal.title}
          </Text>
          <Text>{props.activeProposal.body}</Text>
          <Box marginTop={1}>
            <Text dimColor>
              Vote with: /yes · /no · /abstain
              {props.activeProposal.myVote ? ` (you voted: ${props.activeProposal.myVote})` : ''}
            </Text>
          </Box>
        </Box>
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={
            props.isHost
              ? props.phase === 'working'
                ? '/meeting <reason> · /end · /pm <q> · type to chat'
                : props.canStartWork
                  ? '/start work · /pm <q> · type to chat'
                  : '/scaffold · /pm <q> · type to chat'
              : 'type to chat · /pm <q> · /quit to exit'
          }
        />
      </Box>
    </Box>
  );
}

function colorFor(m: ChatMessage): string {
  switch (m.kind) {
    case 'pm-broadcast': return 'magenta';
    case 'proposal': return 'yellow';
    case 'vote-result': return 'green';
    case 'system': return 'gray';
    default: return 'cyan';
  }
}
