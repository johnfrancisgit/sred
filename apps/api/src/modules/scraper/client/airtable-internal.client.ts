import axios, { type AxiosInstance, AxiosError } from 'axios';
import type { Cookie } from 'playwright';
import { AppError } from '../../../core/errors/app-error.js';
import type { Logger } from '../../../core/logger/logger.js';
import type { CookieService, AirtableCookies } from '../cookie.service.js';

const AIRTABLE_ORIGIN = 'https://airtable.com';
const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export class CookieExpiredError extends Error {
  readonly code = 'COOKIE_EXPIRED' as const;
}
export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Airtable rate-limited');
  }
  readonly code = 'RATE_LIMITED' as const;
}

export interface ActivityUserInfo {
  id: string;
  name: string;
  email?: string;
}

export interface ActivityEntry {
  _id: string;
  createdTime: string;
  originatingUserId: string;
  groupType: string;
  diffRowHtml?: string;
  integrationInfo?: { type?: string; name?: string; isDeleted?: boolean };
}

export interface ActivitiesResponse {
  activities: ActivityEntry[];
  users: Record<string, ActivityUserInfo>;
}

export interface FetchActivitiesOptions {
  rowId: string;
  cookies?: AirtableCookies;
  userId?: string;
}

export class AirtableInternalClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly cookieJar: CookieService,
    private readonly logger: Logger,
  ) {
    this.http = axios.create({
      baseURL: AIRTABLE_ORIGIN,
      timeout: 20_000,
      validateStatus: () => true,
      maxRedirects: 0,
    });
  }

  async probeValidity(userId: string, knownBaseId: string): Promise<'valid' | 'expired'> {
    const cookies = await this.cookieJar.get(userId);
    if (!cookies) return 'expired';
    try {
      // The feature flag endpoint returns 200 only when cookies are valid
      const requestId = makeRequestId();
      const params = new URLSearchParams({
        stringifiedObjectParams: JSON.stringify({ featureFlagName: 'redactSyncCellHistory' }),
        requestId,
      });
      const res = await this.http.get(
        `/v0.3/application/${knownBaseId}/getClientSideContextForFeatureFlag?${params}`,
        { headers: this.headers(cookies) },
      );
      if (res.status === 200) return 'valid';
      return 'expired';
    } catch (err) {
      this.logger.warn({ err }, 'cookie probe failed; treating as expired');
      return 'expired';
    }
  }

  async fetchRowActivities(opts: FetchActivitiesOptions): Promise<ActivitiesResponse> {
    const cookies =
      opts.cookies ?? (opts.userId ? await this.cookieJar.require(opts.userId) : undefined);
    if (!cookies) throw AppError.cookieExpired();

    const params = new URLSearchParams({
      stringifiedObjectParams: JSON.stringify({
        limit: 100,
        offsetV2: null,
        shouldReturnDeserializedActivityItems: true,
        shouldIncludeRowActivityOrCommentUserObjById: true,
      }),
      requestId: makeRequestId(),
    });

    const res = await this.http.get(
      `/v0.3/row/${encodeURIComponent(opts.rowId)}/readRowActivitiesAndComments?${params}`,
      { headers: this.headers(cookies) },
    );

    if (res.status === 401 || res.status === 403) {
      throw new CookieExpiredError(`Status ${res.status}`);
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers['retry-after']);
      throw new RateLimitedError(Number.isFinite(retryAfter) ? retryAfter * 1000 : 30_000);
    }
    if (res.status >= 500) {
      throw new AxiosError(`Airtable internal ${res.status}`);
    }
    if (res.status !== 200) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      throw AppError.integration(
        `Airtable internal endpoint returned ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const json = res.data;
    if (typeof json === 'string' && json.trimStart().startsWith('<!DOCTYPE')) {
      throw new CookieExpiredError('Login redirect detected');
    }
    if (!json || typeof json !== 'object' || json.msg !== 'SUCCESS' || !json.data) {
      throw AppError.integration(
        `Unexpected response shape: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }

    const orderedIds: string[] = json.data.orderedActivityAndCommentIds ?? [];
    const infoById: Record<string, ActivityEntry> = json.data.rowActivityInfoById ?? {};
    const users: Record<string, ActivityUserInfo> = json.data.rowActivityOrCommentUserObjById ?? {};

    const activities: ActivityEntry[] = [];
    for (const id of orderedIds) {
      const entry = infoById[id];
      if (entry) activities.push({ ...entry, _id: id });
    }
    return { activities, users };
  }

  private headers(cookies: AirtableCookies): Record<string, string> {
    const h: Record<string, string> = {
      cookie: serializeCookies(cookies.cookies),
      'user-agent': cookies.userAgent ?? FALLBACK_USER_AGENT,
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/plain, */*',
      'x-time-zone': 'UTC',
      'x-user-locale': 'en',
    };
    if (cookies.appIdHeader) h['x-airtable-application-id'] = cookies.appIdHeader;
    if (cookies.pageLoadIdHeader) h['x-airtable-page-load-id'] = cookies.pageLoadIdHeader;
    return h;
  }
}

function serializeCookies(cookies: Cookie[]): string {
  return cookies
    .filter((c) => c.domain.endsWith('airtable.com'))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function makeRequestId(): string {
  return 'req' + Math.random().toString(36).slice(2, 14);
}
