import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { deriveKey } from '../crypto/kdf.js';
import { encrypt, decrypt } from '../crypto/nacl.js';
import { makeMessage } from '../shared/protocol.js';
import type {
  TribeVibeMessage,
  HelloPayload,
  WelcomePayload,
  LobbyUpdatePayload,
  LobbyParticipant,
  SessionStartPayload,
  PhaseChangePayload,
} from '../shared/protocol.js';

export interface TribeVibeClientOptions {
  url: string;
  seedHex: string;
  displayName: string;
}

function toWsUrl(url: string): string {
  return url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

export class TribeVibeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private key: Buffer;
  private displayName: string;
  private url: string;
  private _myId: string | null = null;
  private _hostName: string = '';
  private _gitUrl: string | null = null;

  constructor(opts: TribeVibeClientOptions) {
    super();
    this.key = deriveKey(opts.seedHex);
    this.displayName = opts.displayName;
    this.url = toWsUrl(opts.url);
  }

  get myId(): string | null { return this._myId; }
  get hostName(): string { return this._hostName; }
  get gitUrl(): string | null { return this._gitUrl; }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const onOpenFail = (err: Error) => reject(err);
      ws.once('error', onOpenFail);

      ws.on('open', () => {
        ws.removeListener('error', onOpenFail);
        const hello = makeMessage<HelloPayload>('hello', 'pending', 'host', {
          displayName: this.displayName,
        });
        try {
          ws.send(encrypt(JSON.stringify(hello), this.key));
        } catch (e) {
          reject(e);
          return;
        }
        resolve();
      });

      ws.on('message', (data) => this.handleMessage(data.toString()));
      ws.on('close', (_code, reason) => {
        this.emit('disconnected', reason.toString() || 'closed');
      });
      ws.on('error', (err) => {
        this.emit('disconnected', err.message);
      });
    });
  }

  private handleMessage(raw: string): void {
    let msg: TribeVibeMessage;
    try {
      const plaintext = decrypt(raw, this.key);
      msg = JSON.parse(plaintext) as TribeVibeMessage;
    } catch {
      this.emit('disconnected', 'decryption failed');
      return;
    }

    switch (msg.type) {
      case 'welcome': {
        const p = msg.payload as WelcomePayload;
        this._myId = p.participantId;
        this._hostName = p.hostName;
        this._gitUrl = p.gitUrl;
        this.emit('welcome', p);
        break;
      }
      case 'lobby-update': {
        const p = msg.payload as LobbyUpdatePayload;
        this.emit('lobby-update', p.participants);
        break;
      }
      case 'session-start': {
        const p = msg.payload as SessionStartPayload;
        this.emit('session-start', p);
        break;
      }
      case 'phase-change': {
        const p = msg.payload as PhaseChangePayload;
        this.emit('phase-change', p);
        break;
      }
      case 'goodbye': {
        const p = msg.payload as { reason: string };
        this.emit('disconnected', p.reason);
        break;
      }
    }

    this.emit('message', msg);
  }

  send(msg: TribeVibeMessage): void {
    if (!this.ws) throw new Error('Not connected');
    this.ws.send(encrypt(JSON.stringify(msg), this.key));
  }

  disconnect(): void {
    if (this.ws) this.ws.close();
  }
}

export type { LobbyParticipant };
