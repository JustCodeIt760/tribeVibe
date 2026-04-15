import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { Lobby } from './Lobby.js';
import type { LobbyParticipant } from '../shared/protocol.js';
import { TribeVibeClient } from '../client/ws-client.js';
import { decodeInviteCode } from '../crypto/invite-code.js';

type Phase = 'connecting' | 'lobby' | 'session-started' | 'disconnected' | 'error';

export interface JoinAppProps {
  inviteCode: string;
  displayName: string;
}

export function JoinApp({ inviteCode, displayName }: JoinAppProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('connecting');
  const [status, setStatus] = useState<string>('Decoding invite code...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [hostName, setHostName] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [client, setClient] = useState<TribeVibeClient | null>(null);

  useEffect(() => {
    let c: TribeVibeClient | null = null;
    async function connect() {
      try {
        const payload = decodeInviteCode(inviteCode);
        setStatus(`Connecting to ${payload.url}...`);
        c = new TribeVibeClient({
          url: payload.url,
          seedHex: payload.seed,
          displayName,
        });
        setClient(c);

        c.on('welcome', (hName) => {
          setHostName(hName);
          setPhase('lobby');
          setStatus(`Connected. Host: ${hName}`);
        });
        c.on('lobby-update', (ps) => setParticipants(ps));
        c.on('session-start', (proj) => {
          setProjectName(proj);
          setPhase('session-started');
        });
        c.on('disconnected', (reason) => {
          setPhase('disconnected');
          setStatus(`Disconnected: ${reason}`);
        });

        await c.connect();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    }

    connect();

    return () => {
      c?.disconnect();
    };
  }, [inviteCode, displayName]);

  function handleQuit() {
    client?.disconnect();
    exit();
  }

  if (phase === 'connecting') {
    return (
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

  if (phase === 'session-started') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Session started: {projectName}</Text>
        <Text dimColor>
          Host: {hostName} · Planning phase not yet implemented — this is the
          foundation slice. Press Ctrl+C to exit.
        </Text>
      </Box>
    );
  }

  // lobby
  return (
    <Lobby
      title={`TRIBEVIBE (joined ${hostName}'s session)`}
      participants={participants}
      status={status}
      isHost={false}
      onQuit={handleQuit}
    />
  );
}
