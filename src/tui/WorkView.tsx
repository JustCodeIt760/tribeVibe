import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { LobbyParticipant, SessionPhase } from '../shared/protocol.js';
import { StatusBar } from './StatusBar.js';

export interface WorkViewProps {
  phase: SessionPhase;
  myName: string;
  myRole: string;
  myScope: string[];
  participants: LobbyParticipant[];
  agentOutput: string[];           // streaming lines from local agent
  notifications: string[];          // PM messages / cross-role pings
  lastPMUpdate?: number | null;
  onSendToAgent: (text: string) => void;
  onQuit: () => void;
}

export function WorkView(props: WorkViewProps): React.ReactElement {
  const [input, setInput] = useState<string>('');

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed === '/quit' || trimmed === '/q') {
      props.onQuit();
      return;
    }
    props.onSendToAgent(trimmed);
    setInput('');
  }

  const recentAgent = props.agentOutput.slice(-30);
  const recentNotifs = props.notifications.slice(-5);

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        phase={props.phase}
        participants={props.participants}
        myName={props.myName}
        myRole={props.myRole}
        lastPMUpdate={props.lastPMUpdate}
      />

      <Box flexDirection="row" flexGrow={1}>
        {/* Main agent area */}
        <Box flexDirection="column" flexGrow={3} padding={1}>
          <Text bold color="cyan">
            [{props.myRole}] {props.myScope.join(', ') || '(no scope)'}
          </Text>
          <Box marginTop={1} flexDirection="column">
            {recentAgent.length === 0 ? (
              <Text dimColor>Agent is idle. Type a request below.</Text>
            ) : (
              recentAgent.map((line, i) => (
                <Text key={i}>{line}</Text>
              ))
            )}
          </Box>
        </Box>

        {/* Right panel: notifications */}
        <Box flexDirection="column" flexBasis={30} borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="magenta">PM NOTIFICATIONS</Text>
          {recentNotifs.length === 0 ? (
            <Text dimColor>(none yet)</Text>
          ) : (
            recentNotifs.map((n, i) => <Text key={i}>· {n}</Text>)
          )}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>{'agent> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Ask your agent to do something. /quit to exit."
        />
      </Box>
    </Box>
  );
}
