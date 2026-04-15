import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { Lobby } from './Lobby.js';
import type { LobbyParticipant } from '../shared/protocol.js';
import { TribeVibeServer } from '../server/ws-server.js';
import { startTunnel, type TunnelHandle } from '../server/tunnel.js';
import { encodeInviteCode, inviteCodePrefix, newSeed } from '../crypto/invite-code.js';

type Phase = 'booting' | 'lobby' | 'starting' | 'started' | 'error';

export interface HostAppProps {
  hostName: string;
  localPort: number;
  projectName: string;
}

export function HostApp({ hostName, localPort, projectName }: HostAppProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('booting');
  const [bootStatus, setBootStatus] = useState<string>('Starting server...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [server, setServer] = useState<TribeVibeServer | null>(null);
  const [tunnel, setTunnel] = useState<TunnelHandle | null>(null);

  useEffect(() => {
    let srv: TribeVibeServer | null = null;
    let tun: TunnelHandle | null = null;

    async function boot() {
      try {
        const seed = newSeed();
        setBootStatus('Starting WebSocket server...');
        srv = new TribeVibeServer({ port: localPort, seedHex: seed, hostName });
        setServer(srv);

        setBootStatus('Opening ngrok tunnel (this can take a few seconds)...');
        tun = await startTunnel(localPort);
        setTunnel(tun);

        const code = encodeInviteCode({ url: tun.url, seed });
        setInviteCode(code);

        srv.on('lobby-changed', () => {
          setParticipants(srv!.session.toLobbyList());
        });

        setParticipants(srv.session.toLobbyList());
        setPhase('lobby');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    }

    boot();

    return () => {
      srv?.close().catch(() => {});
      tun?.close().catch(() => {});
    };
  }, [hostName, localPort]);

  function handleStart() {
    if (!server) return;
    setPhase('starting');
    server.startSession(projectName);
    setPhase('started');
  }

  function handleQuit() {
    server?.close().catch(() => {});
    tunnel?.close().catch(() => {});
    exit();
  }

  if (phase === 'booting') {
    return (
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
          Tip: set NGROK_AUTHTOKEN env var (free token at https://ngrok.com/).
        </Text>
      </Box>
    );
  }

  if (phase === 'started') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>Session started!</Text>
        <Text dimColor>
          Planning phase and PM agent not yet implemented — this is the foundation
          slice. You can press Ctrl+C to exit.
        </Text>
        <Box marginTop={1}>
          <Text>Participants: {participants.length}</Text>
        </Box>
      </Box>
    );
  }

  // lobby / starting
  const peerCount = participants.filter((p) => !p.isHost).length;
  return (
    <Lobby
      title="TRIBEVIBE (host)"
      inviteCodeDisplay={inviteCodePrefix(inviteCode)}
      fullInviteCode={inviteCode}
      participants={participants}
      status={
        peerCount === 0
          ? 'Waiting for peers to join...'
          : `${peerCount} peer(s) connected.`
      }
      isHost
      canStart={peerCount > 0 && phase === 'lobby'}
      onStart={handleStart}
      onQuit={handleQuit}
    />
  );
}
