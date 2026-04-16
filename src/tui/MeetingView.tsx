import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useSafeInput } from './useSafeInput.js';
import type {
  MeetingItem,
  LobbyParticipant,
  SessionPhase,
} from '../shared/protocol.js';
import { StatusBar } from './StatusBar.js';

export interface MeetingTranscriptLine {
  fromName: string;
  text: string;
  kind: 'speaker' | 'butt-in' | 'pm' | 'decision';
}

export interface MeetingViewProps {
  phase: SessionPhase;
  myName: string;
  myRole?: string | null;
  participants: LobbyParticipant[];
  myParticipantId: string;
  items: MeetingItem[];
  currentItemIndex: number;
  floorParticipantIds: string[];
  transcript: MeetingTranscriptLine[];
  reason: string;
  onSpeak: (text: string) => void;
  onButtIn: (text: string) => void;
  onAdvance?: () => void;   // host-only: move to next item
  onDismiss?: () => void;   // host-only: end meeting
  onQuit: () => void;
  isHost: boolean;
}

export function MeetingView(props: MeetingViewProps): React.ReactElement {
  const [input, setInput] = useState<string>('');
  const [buttInMode, setButtInMode] = useState<boolean>(false);

  const hasFloor = props.floorParticipantIds.includes(props.myParticipantId);

  useSafeInput((_ch, key) => {
    if (key.escape) props.onQuit();
    if (!hasFloor && _ch === 'b') setButtInMode(true);
    if (props.isHost && _ch === 'n' && props.onAdvance) props.onAdvance();
    if (props.isHost && _ch === 'd' && props.onDismiss) props.onDismiss();
  });

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (buttInMode) {
      props.onButtIn(trimmed);
      setButtInMode(false);
    } else if (hasFloor) {
      props.onSpeak(trimmed);
    }
    setInput('');
  }

  const item = props.items[props.currentItemIndex];
  const recent = props.transcript.slice(-15);

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        phase={props.phase}
        participants={props.participants}
        myName={props.myName}
        myRole={props.myRole}
      />

      <Box padding={1} flexDirection="column">
        <Text bold color="yellow">SYNC MEETING</Text>
        <Text dimColor>Reason: {props.reason}</Text>
      </Box>

      {/* Status board */}
      <Box borderStyle="round" borderColor="cyan" padding={1} flexDirection="column">
        <Text bold>STATUS BOARD:</Text>
        {props.participants.map((p) => (
          <Text key={p.id}>
            {p.connected ? <Text color="green">OK  </Text> : <Text color="red">OFF </Text>}
            {p.name} {p.role ? <Text dimColor>({p.role})</Text> : null}
          </Text>
        ))}
      </Box>

      {/* Current item */}
      <Box
        borderStyle="round"
        borderColor="yellow"
        padding={1}
        flexDirection="column"
        marginTop={1}
      >
        <Text bold color="yellow">
          Item {props.currentItemIndex + 1} of {props.items.length}
        </Text>
        {item ? (
          <>
            <Text>{item.title}</Text>
            <Text dimColor>{item.context}</Text>
            <Text dimColor>
              Floor: {props.floorParticipantIds.length > 0
                ? props.floorParticipantIds.join(', ')
                : '(open)'}
            </Text>
          </>
        ) : (
          <Text dimColor>No items.</Text>
        )}
      </Box>

      {/* Transcript */}
      <Box flexDirection="column" flexGrow={1} padding={1}>
        {recent.map((line, i) => (
          <Text key={i}>
            <Text color={transcriptColor(line.kind)}>{line.fromName}:</Text>{' '}
            {line.text}
          </Text>
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          {hasFloor
            ? '> '
            : buttInMode
              ? 'butt-in> '
              : '(observe) '}
        </Text>
        {hasFloor || buttInMode ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder={hasFloor ? 'Speak...' : 'Interject once, then back to observe'}
          />
        ) : (
          <Text dimColor>
            Press <Text color="green">b</Text> to butt in
            {props.isHost ? ' · n=next item · d=dismiss' : ''}
            {' · esc to quit'}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function transcriptColor(kind: MeetingTranscriptLine['kind']): string {
  switch (kind) {
    case 'pm': return 'magenta';
    case 'decision': return 'green';
    case 'butt-in': return 'yellow';
    default: return 'cyan';
  }
}
