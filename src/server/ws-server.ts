import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { deriveKey } from '../crypto/kdf.js';
import { encrypt, decrypt } from '../crypto/nacl.js';
import { makeMessage } from '../shared/protocol.js';
import type {
  TribeVibeMessage,
  HelloPayload,
  WelcomePayload,
  LobbyUpdatePayload,
  SessionStartPayload,
  PhaseChangePayload,
  SessionPhase,
} from '../shared/protocol.js';
import { HostSession } from './session.js';

export interface TribeVibeServerOptions {
  port: number;
  seedHex: string;
  hostName: string;
  /** Optional git-over-HTTP URL to share with peers in the welcome. */
  gitUrl?: string | null;
}

/**
 * Host-side WebSocket server. Accepts encrypted peer connections,
 * maintains session state, and routes messages.
 */
export class TribeVibeServer extends EventEmitter {
  private wss: WebSocketServer;
  private key: Buffer;
  readonly session: HostSession;
  readonly seedHex: string;
  private peerSockets: Map<string, WebSocket> = new Map();
  private gitUrl: string | null;

  constructor(opts: TribeVibeServerOptions) {
    super();
    this.seedHex = opts.seedHex;
    this.key = deriveKey(opts.seedHex);
    this.session = new HostSession(opts.hostName);
    this.gitUrl = opts.gitUrl ?? null;
    this.wss = new WebSocketServer({ port: opts.port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  get localPort(): number {
    const addr = this.wss.address();
    if (typeof addr === 'string' || !addr) throw new Error('No address');
    return addr.port;
  }

  setGitUrl(url: string | null): void {
    this.gitUrl = url;
  }

  private handleConnection(ws: WebSocket): void {
    let participantId: string | null = null;

    ws.on('message', (data) => {
      const raw = data.toString();
      let msg: TribeVibeMessage;
      try {
        const plaintext = decrypt(raw, this.key);
        msg = JSON.parse(plaintext) as TribeVibeMessage;
      } catch {
        ws.close(1008, 'Decryption failed');
        return;
      }

      if (msg.type === 'hello') {
        if (!this.session.canAcceptNewPeer()) {
          this.sendRaw(ws, makeMessage('goodbye', 'host', 'all', { reason: 'Session full' }));
          ws.close();
          return;
        }
        const { displayName } = msg.payload as HelloPayload;
        const p = this.session.addPeer(displayName);
        participantId = p.id;
        this.peerSockets.set(p.id, ws);

        this.sendRaw(
          ws,
          makeMessage<WelcomePayload>('welcome', 'host', p.id, {
            participantId: p.id,
            hostName: this.session.hostName,
            gitUrl: this.gitUrl,
          })
        );

        this.broadcastLobby();
        this.emit('peer-joined', p.id, p.name);
        return;
      }

      // Re-stamp 'from' if it was 'pending' — now we know who they are
      if (msg.from === 'pending' && participantId) {
        msg.from = participantId;
      }

      this.emit('message', msg);
    });

    ws.on('close', () => {
      if (participantId) {
        this.session.markDisconnected(participantId);
        this.peerSockets.delete(participantId);
        this.broadcastLobby();
        this.emit('peer-left', participantId);
      }
    });

    ws.on('error', () => {
      if (participantId) {
        this.session.markDisconnected(participantId);
        this.peerSockets.delete(participantId);
        this.broadcastLobby();
      }
    });
  }

  private sendRaw(ws: WebSocket, msg: TribeVibeMessage): void {
    try {
      ws.send(encrypt(JSON.stringify(msg), this.key));
    } catch { /* socket may have closed */ }
  }

  broadcast(msg: TribeVibeMessage): void {
    for (const ws of this.peerSockets.values()) {
      this.sendRaw(ws, msg);
    }
  }

  sendTo(participantId: string, msg: TribeVibeMessage): boolean {
    const ws = this.peerSockets.get(participantId);
    if (!ws) return false;
    this.sendRaw(ws, msg);
    return true;
  }

  private broadcastLobby(): void {
    const payload: LobbyUpdatePayload = { participants: this.session.toLobbyList() };
    this.broadcast(makeMessage('lobby-update', 'host', 'all', payload));
    this.emit('lobby-changed');
  }

  sendLobbyToAll(): void {
    this.broadcastLobby();
  }

  startSession(projectName: string, brownfield: boolean): void {
    this.session.phase = 'planning';
    const payload: SessionStartPayload = { projectName, brownfield };
    this.broadcast(makeMessage('session-start', 'host', 'all', payload));
    this.emitPhase('planning');
  }

  emitPhase(phase: SessionPhase, reason?: string): void {
    this.session.phase = phase;
    const payload: PhaseChangePayload = { phase, reason };
    this.broadcast(makeMessage('phase-change', 'host', 'all', payload));
  }

  async close(): Promise<void> {
    for (const ws of this.peerSockets.values()) ws.close();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
