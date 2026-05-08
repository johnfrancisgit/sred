import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { Cookie } from 'playwright';

import { CookieService, type AirtableCookies } from './cookie.service.js';
import { SecretBox } from '../../core/crypto/secret-box.js';

const sessionStore = new Map<string, { cookiesEnc: string }>();

vi.mock('./schemas.js', () => ({
  AirtableSessionModel: {
    findOneAndUpdate: vi.fn(
      async (filter: { _id: string }, update: { $set: { cookiesEnc: string } }, _opts: unknown) => {
        sessionStore.set(filter._id, { cookiesEnc: update.$set.cookiesEnc });
        return { _id: filter._id, ...update.$set };
      },
    ),
    findById: vi.fn((id: string) => ({
      lean: async () => sessionStore.get(id) ?? null,
    })),
    updateOne: vi.fn(async (filter: { _id: string }) => {
      sessionStore.delete(filter._id);
      return { acknowledged: true };
    }),
  },
}));

const userId = 'Bob';

const sampleCookies = (): AirtableCookies => ({
  cookies: [
    {
      name: '__Host-airtable-session',
      value: 'session-token',
      domain: 'airtable.com',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    } satisfies Cookie,
  ],
  appIdHeader: 'app_header',
  pageLoadIdHeader: 'payload_id',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
});

const makeJar = () => {
  const secretBox = new SecretBox(randomBytes(32).toString('base64'));
  const jar = new CookieService(secretBox);
  return { secretBox, jar };
};

describe('CookieService', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('encrypts the payload before persisting', async () => {
    const { jar } = makeJar();
    await jar.save(userId, sampleCookies());

    const stored = sessionStore.get(userId)?.cookiesEnc;
    expect(stored).toBeTruthy();
    expect(stored!.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('session-token');
    expect(stored).not.toContain('__Host-airtable-session');
  });

  it('round-trips: save() then get() returns the original payload', async () => {
    const { jar } = makeJar();
    const value = sampleCookies();
    await jar.save(userId, value);

    const got = await jar.get(userId);
    expect(got).not.toBeNull();
    expect(got!.appIdHeader).toBe(value.appIdHeader);
    expect(got!.pageLoadIdHeader).toBe(value.pageLoadIdHeader);
    expect(got!.userAgent).toBe(value.userAgent);
    expect(got!.cookies).toHaveLength(1);
    expect(got!.cookies[0]!.value).toBe('session-token');
    expect(got!.expiresAt.toISOString()).toBe(value.expiresAt.toISOString());
  });

  it('returns null when nothing is stored for the user', async () => {
    const { jar } = makeJar();
    expect(await jar.get('does-not-exist')).toBeNull();
  });

  it('require() throws COOKIE_EXPIRED when nothing is stored', async () => {
    const { jar } = makeJar();
    await expect(jar.require('does-not-exist')).rejects.toMatchObject({
      code: 'COOKIE_EXPIRED',
    });
  });

  it('markExpired() clears the persisted session', async () => {
    const { jar } = makeJar();
    await jar.save(userId, sampleCookies());
    expect(sessionStore.has(userId)).toBe(true);

    await jar.markExpired(userId);
    expect(sessionStore.has(userId)).toBe(false);
  });
});
