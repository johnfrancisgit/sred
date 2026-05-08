import { describe, expect, it, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { AirtableOauthService, REQUIRED_SCOPES } from './airtable-oauth.service.js';
import type { Env } from '../../config/env.js';
import type { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ level: 'silent' });

class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number }>();
  async set(key: string, value: string, _mode: 'EX', ttl: number): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return 'OK';
  }
  async getdel(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    return entry.value;
  }
}

const baseEnv = {
  AIRTABLE_OAUTH_CLIENT_ID: 'client-abc',
  AIRTABLE_OAUTH_CLIENT_SECRET: 'shh',
  AIRTABLE_OAUTH_REDIRECT_URI: 'http://localhost:3300/api/airtable/oauth/callback',
} as Env;

describe('AirtableOauthService — buildAuthorizeUrl', () => {
  let redis: FakeRedis;
  let service: AirtableOauthService;
  beforeAll(() => {
    redis = new FakeRedis();
    service = new AirtableOauthService(baseEnv, redis as unknown as Redis, {} as never, logger);
  });

  it('produces a URL with the required PKCE parameters and Airtable scopes', async () => {
    const url = new URL(await service.buildAuthorizeUrl('user-1'));

    expect(url.origin).toBe('https://airtable.com');
    expect(url.pathname).toBe('/oauth2/v1/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const challenge = url.searchParams.get('code_challenge');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/); // base64 url SHA-256 length

    const scope = url.searchParams.get('scope');
    expect(scope?.split(' ').sort()).toEqual([...REQUIRED_SCOPES].sort());

    const state = url.searchParams.get('state');
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(redis.store.has(`airtable:oauth:state:${state}`)).toBe(true);
  });

  it("the persisted state's verifier hashes back to the URL's code_challenge (PKCE binding)", async () => {
    const url = new URL(await service.buildAuthorizeUrl('user-2'));
    const state = url.searchParams.get('state')!;
    const challenge = url.searchParams.get('code_challenge')!;

    const persisted = JSON.parse(redis.store.get(`airtable:oauth:state:${state}`)!.value) as {
      codeVerifier: string;
      userId: string;
    };
    const recomputed = createHash('sha256').update(persisted.codeVerifier).digest('base64url');
    expect(recomputed).toBe(challenge);
    expect(persisted.userId).toBe('user-2');
  });

  it('throws if AIRTABLE_OAUTH_CLIENT_ID is missing', async () => {
    const broken = new AirtableOauthService(
      { ...baseEnv, AIRTABLE_OAUTH_CLIENT_ID: '' } as Env,
      redis as unknown as Redis,
      {} as never,
      logger,
    );
    await expect(broken.buildAuthorizeUrl('user-x')).rejects.toThrow(/CLIENT_ID/);
  });
});

describe('AirtableOauthService — state expiry', () => {
  it('handleCallback rejects an unknown state', async () => {
    const redis = new FakeRedis();
    const service = new AirtableOauthService(
      baseEnv,
      redis as unknown as Redis,
      {} as never,
      logger,
    );
    await expect(service.handleCallback('any-code', 'unknown-state')).rejects.toThrow(/state/);
  });
});
