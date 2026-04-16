import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useSafeInput } from './useSafeInput.js';
import { listSessions, type PersistedSession } from '../session/persistence.js';

type Mode = 'menu' | 'host-name' | 'join-code' | 'join-name' | 'resume-pick';

export interface LaunchScreenProps {
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onResume: (session: PersistedSession, name: string) => void;
}

export function LaunchScreen(props: LaunchScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>('menu');
  const [input, setInput] = useState<string>('');
  const [pendingJoinCode, setPendingJoinCode] = useState<string>('');
  const [sessions, setSessions] = useState<PersistedSession[]>([]);
  const [pickedSession, setPickedSession] = useState<PersistedSession | null>(null);

  useSafeInput((ch) => {
    if (mode !== 'menu') return;
    const c = ch.toLowerCase();
    if (c === 'h') setMode('host-name');
    else if (c === 'j') setMode('join-code');
    else if (c === 'r') {
      const list = listSessions();
      setSessions(list);
      if (list.length === 0) {
        // No sessions to resume; stay on menu with a banner
      } else {
        setMode('resume-pick');
      }
    } else if (c === 'q') {
      exit();
    }
  });

  function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput('');

    if (mode === 'host-name') {
      props.onHost(trimmed);
    } else if (mode === 'join-code') {
      setPendingJoinCode(trimmed);
      setMode('join-name');
    } else if (mode === 'join-name') {
      props.onJoin(pendingJoinCode, trimmed);
    } else if (mode === 'resume-pick') {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < sessions.length) {
        setPickedSession(sessions[idx]);
      }
    }
  }

  if (mode === 'menu') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="double" borderColor="cyan" paddingX={2}>
          <Text bold color="cyan">TRIBEVIBE</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Welcome! What would you like to do?</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>  <Text color="green">[H]</Text> Host a session</Text>
            <Text>  <Text color="green">[J]</Text> Join a session</Text>
            <Text>  <Text color="green">[R]</Text> Resume previous session</Text>
            <Text>  <Text color="red">[Q]</Text> Quit</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (mode === 'host-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Host a session</Text>
        <Box marginTop={1}>
          <Text>Your display name: </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="alice" />
        </Box>
      </Box>
    );
  }

  if (mode === 'join-code') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Join a session</Text>
        <Box marginTop={1}>
          <Text>Invite code: </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="VIBE-CORAL-7X.eyJ..." />
        </Box>
      </Box>
    );
  }

  if (mode === 'join-name') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Join a session</Text>
        <Box marginTop={1}>
          <Text>Your display name: </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="bob" />
        </Box>
      </Box>
    );
  }

  if (mode === 'resume-pick') {
    if (pickedSession) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="cyan">Resume: {pickedSession.projectName}</Text>
          <Box marginTop={1}>
            <Text>Your display name: </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={(text) => props.onResume(pickedSession, text.trim() || pickedSession.hostName)}
              placeholder={pickedSession.hostName}
            />
          </Box>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Resume a previous session</Text>
        <Box marginTop={1} flexDirection="column">
          {sessions.map((s, i) => (
            <Text key={s.id}>
              {'  '}[{i + 1}] {s.projectName} ({s.participants.length} participants,{' '}
              {new Date(s.createdAt).toISOString().slice(0, 10)})
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text>Pick number: </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="1" />
        </Box>
      </Box>
    );
  }

  return <Text>Unknown mode: {mode}</Text>;
}
