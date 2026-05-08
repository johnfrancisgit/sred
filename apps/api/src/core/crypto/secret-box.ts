import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';

export class SecretBox {
  private readonly key: Uint8Array;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('SecretBox key must be exactly 32 raw bytes (base64-encoded).');
    }
    this.key = new Uint8Array(key);
  }

  encrypt(plaintext: string): string {
    const nonce = new Uint8Array(randomBytes(24));
    const cipher = xchacha20poly1305(this.key, nonce);
    const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));
    return `v1.${Buffer.from(nonce).toString('base64')}.${Buffer.from(ciphertext).toString('base64')}`;
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
      throw new Error('SecretBox: malformed ciphertext envelope');
    }
    const nonce = new Uint8Array(Buffer.from(parts[1]!, 'base64'));
    const ciphertext = new Uint8Array(Buffer.from(parts[2]!, 'base64'));
    if (nonce.length !== 24) throw new Error('SecretBox: invalid nonce length');
    const cipher = xchacha20poly1305(this.key, nonce);
    const plaintext = cipher.decrypt(ciphertext);
    return new TextDecoder().decode(plaintext);
  }
}
