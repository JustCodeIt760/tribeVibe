import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { LobbyParticipant } from '../shared/protocol.js';

export interface LobbyProps {
  title: string;
  inviteCodeDisplay?: string; // only shown on host
  fullInviteCode?: string;    // only shown on host
  participants: LobbyParticipant[];
  status: string;
  isHost: boolean;
  canStart?: boolean;
  onStart?: () => void;
  onQuit?: () => void;
}

export function Lobby(props: LobbyProps): React.ReactElement {
  useInput((input, key) => {
    if (props.isHost && props.canStart && key.return && props.onStart) {
      props.onStart();
    }
    if ((input === 'q' || key.escape) && props.onQuit) {
      props.onQuit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'━━━ '}
          {props.title}
          {' ━━━'}
        </Text>
      </Box>

      {props.isHost && props.inviteCodeDisplay && (
        <Box flexDirection="column" marginBottom={1}>
          <Text>Share this code with your crew:</Text>
          <Text bold color="yellow">
            {'  '}
            {props.inviteCodeDisplay}
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Full code (paste into `tribevibe join`):</Text>
          </Box>
          <Text dimColor>
            {'  '}
            {props.fullInviteCode}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Lobby ({props.participants.length}/5):</Text>
        {props.participants.map((p) => (
          <Text key={p.id}>
            {'  '}
            {p.isHost ? '★' : '•'} {p.name}{' '}
            <Text dimColor>
              ({p.isHost ? 'host' : p.id}
              {p.connected ? '' : ', disconnected'})
            </Text>
          </Text>
        ))}
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{props.status}</Text>
      </Box>

      <Box>
        {props.isHost ? (
          <Text dimColor>
            {props.canStart ? 'Press ' : ''}
            {props.canStart && <Text color="green">Enter</Text>}
            {props.canStart ? ' to start session · ' : ''}Press <Text color="red">q</Text> to quit
          </Text>
        ) : (
          <Text dimColor>
            Waiting for host to start · Press <Text color="red">q</Text> to quit
          </Text>
        )}
      </Box>
    </Box>
  );
}
