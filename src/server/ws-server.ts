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
} from '../shared/protocol.js';
import { HostSession } from './session.js';

export interface ServerEvents {
  'peer-joined': (id: string, name: string) => void;
  'peer-left': (id: string) => void;
  'lobby-changed': () => void;
  'message': (msg: TribeVibeMessage) => void;
}

export interface TribeVibeServerOptions {
  port: number;
  seedHex: string;
  hostName: string;
}

/**
 * Host-side WebSocket server. Accepts encrypted peer connections and
 * maintains the lobby/session state.
 *
 * For v1 foundation: all peers share the same derived symmetric key (from the
 * invite-code seed). Later, per-peer keys will be derived via proper SPAKE2
 * after individual handshakes.
 */
export class TribeVibeServer extends EventEmitter {
  private wss: WebSocketServer;
  private key: Buffer;
  readonly session: HostSession;
  private peerSockets: Map<string, WebSocket> = new Map();

  constructor(opts: TribeVibeServerOptions) {
    super();
    this.key = deriveKey(opts.seedHex);
    this.session = new HostSession(opts.hostName);
    this.wss = new WebSocketServer({ port: opts.port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  get localPort(): number {
    const addr = this.wss.address();
    if (typeof addr === 'string' || !addr) throw new Error('No address');
    return addr.port;
  }

  private handleConnection(ws: WebSocket): void {
    let participantId: string | null = null;

    ws.on('message', (data) => {
      const raw = data.toString();
      let msg: TribeVibeMessage;
      try {
        const plaintext = decrypt(raw, this.key);
        msg = JSON.parse(plaintext) as TribeVibeMessage;
      } catch (err) {
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

        // welcome
        this.sendRaw(
          ws,
          makeMessage<WelcomePayload>('welcome', 'host', p.id, {
            participantId: p.id,
            hostName: this.session.hostName,
          })
        );

        this.broadcastLobby();
        this.emit('peer-joined', p.id, p.name);
        return;
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
    } catch {
      /* socket may have closed */
    }
  }

  broadcast(msg: TribeVibeMessage): void {
    for (const ws of this.peerSockets.values()) {
      this.sendRaw(ws, msg);
    }
  }

  private broadcastLobby(): void {
    const payload: LobbyUpdatePayload = { participants: this.session.toLobbyList() };
    this.broadcast(makeMessage('lobby-update', 'host', 'all', payload));
    this.emit('lobby-changed');
  }

  sendLobbyToAll(): void {
    this.broadcastLobby();
  }

  startSession(projectName: string): void {
    this.session.phase = 'planning';
    this.broadcast(
      makeMessage('session-start', 'host', 'all', { projectName })
    );
  }

  async close(): Promise<void> {
    for (const ws of this.peerSockets.values()) ws.close();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
