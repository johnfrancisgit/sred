import { createHash, randomBytes } from 'node:crypto';
import axios from 'axios';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Logger } from '../../core/logger/logger.js';
import type { AirtableOauthRepository, OauthTokens } from './airtable-oauth.repository.js';

const AUTHORIZE_URL = 'https://airtable.com/oauth2/v1/authorize';
const TOKEN_URL = 'https://airtable.com/oauth2/v1/token';

export const REQUIRED_SCOPES = ['data.records:read', 'schema.bases:read', 'user.email:read'];
const PKCE_TTL_SECONDS = 10 * 60;

interface PkceState {
  codeVerifier: string;
  userId: string;
}

const TokenEndpointResponseZ = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
});

export class AirtableOauthService {
  constructor(
    private readonly env: Env,
    private readonly redis: Redis,
    private readonly repo: AirtableOauthRepository,
    private readonly logger: Logger,
  ) {}

  async buildAuthorizeUrl(userId: string): Promise<string> {
    if (!this.env.AIRTABLE_OAUTH_CLIENT_ID) {
      throw AppError.integration('AIRTABLE_OAUTH_CLIENT_ID is not configured');
    }
    const state = randomBytes(32).toString('hex');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    const record: PkceState = { codeVerifier, userId };
    await this.redis.set(this.stateKey(state), JSON.stringify(record), 'EX', PKCE_TTL_SECONDS);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.env.AIRTABLE_OAUTH_CLIENT_ID,
      redirect_uri: this.env.AIRTABLE_OAUTH_REDIRECT_URI,
      scope: REQUIRED_SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ userId: string }> {
    const raw = await this.redis.getdel(this.stateKey(state));
    if (!raw) throw AppError.badRequest('OAuth state expired or invalid');
    const { codeVerifier, userId } = JSON.parse(raw) as PkceState;

    const tokens = await this.postToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.env.AIRTABLE_OAUTH_REDIRECT_URI,
        client_id: this.env.AIRTABLE_OAUTH_CLIENT_ID!,
        code_verifier: codeVerifier,
      }),
    );
    await this.repo.upsert(userId, tokens);
    return { userId };
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const tokens = await this.repo.get(userId);
    if (!tokens) throw AppError.unauthorized('Airtable not connected');
    if (tokens.expiresAt.getTime() - Date.now() > 60_000) return tokens.accessToken;
    return this.refreshAndStore(userId, tokens.refreshToken);
  }

  async forceRefresh(userId: string): Promise<string> {
    const tokens = await this.repo.get(userId);
    if (!tokens) throw AppError.unauthorized('Airtable not connected');
    return this.refreshAndStore(userId, tokens.refreshToken);
  }

  async disconnect(userId: string): Promise<void> {
    await this.repo.delete(userId);
  }

  private async refreshAndStore(userId: string, refreshToken: string): Promise<string> {
    const refreshed = await this.postToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.env.AIRTABLE_OAUTH_CLIENT_ID!,
      }),
    );
    await this.repo.upsert(userId, refreshed);
    return refreshed.accessToken;
  }

  private async postToken(body: URLSearchParams): Promise<OauthTokens> {
    // Env validation guarantees both are set whenever AIRTABLE_OAUTH_CLIENT_ID is.
    const basic = Buffer.from(
      `${this.env.AIRTABLE_OAUTH_CLIENT_ID}:${this.env.AIRTABLE_OAUTH_CLIENT_SECRET}`,
    ).toString('base64');
    const res = await axios.post<unknown>(TOKEN_URL, body.toString(), {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basic}`,
      },
      validateStatus: () => true,
    });
    const parsed = TokenEndpointResponseZ.safeParse(res.data);
    if (!parsed.success) {
      this.logger.error(
        { status: res.status, issues: parsed.error.issues },
        'airtable token endpoint returned an unexpected payload',
      );
      throw AppError.integration('Airtable token endpoint returned an unexpected payload');
    }
    const t = parsed.data;
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      scope: t.scope,
    };
  }

  private stateKey(state: string): string {
    return `airtable:oauth:state:${state}`;
  }
}
