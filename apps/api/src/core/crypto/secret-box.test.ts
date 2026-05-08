import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';

const key = randomBytes(32).toString('base64');

describe('SecretBox', () => {
  it('round-trips a plaintext', () => {
    const box = new SecretBox(key);
    const ciphertext = box.encrypt('hello world');
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(box.decrypt(ciphertext)).toBe('hello world');
  });

  it('produces different ciphertexts for the same plaintext (random nonce)', () => {
    const box = new SecretBox(key);
    const a = box.encrypt('same');
    const b = box.encrypt('same');
    expect(a).not.toBe(b);
    expect(box.decrypt(a)).toBe(box.decrypt(b));
  });

  it('rejects ciphertext encrypted with a different key', () => {
    const a = new SecretBox(key);
    const b = new SecretBox(randomBytes(32).toString('base64'));
    const ct = a.encrypt('secret');
    expect(() => b.decrypt(ct)).toThrow();
  });

  it('rejects malformed envelopes', () => {
    const box = new SecretBox(key);
    expect(() => box.decrypt('not-an-envelope')).toThrow(/malformed/);
    expect(() => box.decrypt('v2.aaa.bbb')).toThrow(/malformed/);
  });

  it('rejects keys of the wrong length', () => {
    expect(() => new SecretBox('aGVsbG8=')).toThrow(/32 raw bytes/);
  });
});
