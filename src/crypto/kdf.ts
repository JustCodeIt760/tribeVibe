import crypto from 'crypto';

/**
 * Derive a 32-byte symmetric key from the invite-code seed.
 *
 * NOTE: This is an interim design. The spec calls for SPAKE2, which prevents
 * offline dictionary attacks on the seed. With scrypt-derived keys, an attacker
 * who intercepts the handshake can brute-force weak seeds offline.
 *
 * Our seed is 128 bits of crypto-random data (see invite-code.newSeed), which
 * is infeasible to brute force even without PAKE. So the practical security
 * of this approach is acceptable for v1, but we should upgrade to SPAKE2
 * when a solid Node.js implementation is available.
 *
 * The scrypt params below are modest — we want handshake to complete in ~100ms
 * on a laptop, not seconds. For 128-bit seeds this gives plenty of margin.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT = Buffer.from('tribevibe-v1-kdf-salt', 'utf8');

export function deriveKey(seedHex: string): Buffer {
  return crypto.scryptSync(
    Buffer.from(seedHex, 'hex'),
    SALT,
    KEY_LEN,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
  );
}
