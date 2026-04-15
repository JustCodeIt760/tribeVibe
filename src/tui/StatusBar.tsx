import React from 'react';
import { Box, Text } from 'ink';
import type { SessionPhase, LobbyParticipant } from '../shared/protocol.js';

export interface StatusBarProps {
  phase: SessionPhase;
  participants: LobbyParticipant[];
  myName: string;
  myRole?: string | null;
  lastPMUpdate?: number | null;
}

export function StatusBar(props: StatusBarProps): React.ReactElement {
  const online = props.participants.filter((p) => p.connected).length;
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text color="cyan">{props.phase.toUpperCase()}</Text>
        {'  '}
        <Text>{props.myName}</Text>
        {props.myRole ? <Text dimColor> ({props.myRole})</Text> : null}
        {'  '}
        <Text dimColor>·</Text>
        {'  '}
        <Text>{online}/{props.participants.length} online</Text>
        {props.lastPMUpdate ? (
          <>
            {'  '}
            <Text dimColor>·</Text>
            {'  '}
            <Text dimColor>
              PM: {Math.floor((Date.now() - props.lastPMUpdate) / 1000)}s ago
            </Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}
