import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

/**
 * Symmetric E2E encryption using NaCl secretbox.
 *
 * Wire format: [24-byte nonce][ciphertext]
 * Input/output are base64 strings for safe JSON transport over the WS.
 */

export function encrypt(plaintext: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = naclUtil.decodeUTF8(plaintext);
  const box = nacl.secretbox(messageBytes, nonce, key);

  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce, 0);
  out.set(box, nonce.length);
  return naclUtil.encodeBase64(out);
}

export function decrypt(ciphertext: string, key: Uint8Array): string {
  const bytes = naclUtil.decodeBase64(ciphertext);
  if (bytes.length < nacl.secretbox.nonceLength) {
    throw new Error('Ciphertext too short');
  }
  const nonce = bytes.slice(0, nacl.secretbox.nonceLength);
  const box = bytes.slice(nacl.secretbox.nonceLength);
  const opened = nacl.secretbox.open(box, nonce, key);
  if (!opened) throw new Error('Decryption failed (bad key or tampered data)');
  return naclUtil.encodeUTF8(opened);
}

export { nacl };
