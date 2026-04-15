import crypto from 'crypto';

/**
 * Invite code format: VIBE-<WORD>-<SUFFIX>.<B64URL_PAYLOAD>
 *
 * Human-friendly prefix is cosmetic; the payload after the dot is the real data.
 * Payload encodes: { url: ngrok URL, seed: 16 random bytes (hex) }
 *
 * Example:
 *   VIBE-CORAL-7X.eyJ1IjoiaHR0cHM6Ly9hYmMubmdyb2suaW8iLCJzIjoiN2YxNC4uLiJ9
 */

const WORDS = [
  'CORAL', 'FROST', 'EMBER', 'MARSH', 'PLUM', 'DUSK', 'SPARK', 'TIDE',
  'MOSS', 'OPAL', 'RAVEN', 'LUNA', 'SAGE', 'FERN', 'ONYX', 'JADE',
];

export interface InviteCodePayload {
  /** ngrok public URL, e.g. https://abc123.ngrok.io */
  url: string;
  /** Hex-encoded 16-byte seed used for key derivation */
  seed: string;
}

function randomWord(): string {
  return WORDS[crypto.randomInt(WORDS.length)]!;
}

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let out = '';
  for (let i = 0; i < 2; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

export function newSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function encodeInviteCode(payload: InviteCodePayload): string {
  const json = JSON.stringify({ u: payload.url, s: payload.seed });
  const b64 = Buffer.from(json).toString('base64url');
  return `VIBE-${randomWord()}-${randomSuffix()}.${b64}`;
}

export function decodeInviteCode(code: string): InviteCodePayload {
  const trimmed = code.trim();
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx === -1) throw new Error('Invalid invite code: missing payload');
  const b64 = trimmed.slice(dotIdx + 1);
  const json = Buffer.from(b64, 'base64url').toString('utf8');
  const parsed = JSON.parse(json) as { u: string; s: string };
  if (!parsed.u || !parsed.s) throw new Error('Invalid invite code: malformed payload');
  return { url: parsed.u, seed: parsed.s };
}

/** Human-readable prefix for display purposes (e.g. in lobby UI). */
export function inviteCodePrefix(code: string): string {
  const dotIdx = code.indexOf('.');
  return dotIdx === -1 ? code : code.slice(0, dotIdx);
}
