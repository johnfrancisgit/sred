import axios, { type AxiosInstance, AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import type { ZodSchema } from 'zod';
import type { AirtableBase, AirtableRecord, AirtableTable } from '@sred/shared';
import type { AirtableOauthService } from '../airtable-oauth/airtable-oauth.service.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Logger } from '../../core/logger/logger.js';
import { withRetry, type RetryPolicy } from '../../core/http/with-retry.js';
import {
  ListBasesRespZ,
  BaseSchemaRespZ,
  ListRecordsRespZ,
  type ListBasesResp,
  type ListRecordsResp,
} from './client-schemas.js';

const BASE_URL = 'https://api.airtable.com/v0';
const PUBLIC_API_RPS_PER_BASE = 5;
const MAX_RETRIES = 5;

export class AirtableRestClient {
  private readonly http: AxiosInstance;
  private readonly limiters = new Map<string, Bottleneck>();

  constructor(
    private readonly oauth: AirtableOauthService,
    private readonly logger: Logger,
  ) {
    this.http = axios.create({ baseURL: BASE_URL, timeout: 20_000 });
  }

  async getBaseSchema(userId: string, baseId: string): Promise<AirtableTable[]> {
    const raw = await this.request<unknown>(userId, baseId, {
      method: 'GET',
      url: `/meta/bases/${baseId}/tables`,
    });
    const parsed = parseResponse(BaseSchemaRespZ, raw, `GET /meta/bases/${baseId}/tables`);
    return parsed.tables;
  }

  async *iterateBases(userId: string): AsyncIterable<AirtableBase> {
    let offset: string | undefined;
    do {
      const page = await this.listBases(userId, { offset });
      for (const base of page.bases) yield base;
      offset = page.offset;
    } while (offset);
  }

  async *iterateRecords(
    userId: string,
    baseId: string,
    tableIdOrName: string,
  ): AsyncIterable<AirtableRecord> {
    let offset: string | undefined;
    do {
      const page = await this.listRecords(userId, baseId, tableIdOrName, { offset });
      for (const record of page.records) yield record;
      offset = page.offset;
    } while (offset);
  }

  private async listBases(userId: string, opts: { offset?: string } = {}): Promise<ListBasesResp> {
    const raw = await this.request<unknown>(userId, '__meta__', {
      method: 'GET',
      url: '/meta/bases',
      params: opts.offset ? { offset: opts.offset } : undefined,
    });
    return parseResponse(ListBasesRespZ, raw, 'GET /meta/bases');
  }

  private async listRecords(
    userId: string,
    baseId: string,
    tableIdOrName: string,
    opts: { offset?: string; pageSize?: number } = {},
  ): Promise<ListRecordsResp> {
    const raw = await this.request<unknown>(userId, baseId, {
      method: 'GET',
      url: `/${baseId}/${encodeURIComponent(tableIdOrName)}`,
      params: { pageSize: opts.pageSize ?? 100, offset: opts.offset },
    });
    return parseResponse(ListRecordsRespZ, raw, `GET /${baseId}/${tableIdOrName}`);
  }

  private async request<T>(
    userId: string,
    bucketKey: string,
    config: { method: 'GET' | 'POST'; url: string; params?: Record<string, unknown> },
  ): Promise<T> {
    const limiter = this.limiterFor(bucketKey);
    let triedForceRefresh = false;

    const send = async (): Promise<T> => {
      const accessToken = triedForceRefresh
        ? await this.oauth.forceRefresh(userId)
        : await this.oauth.getValidAccessToken(userId);
      try {
        return await limiter.schedule(async () => {
          const { data } = await this.http.request<T>({
            method: config.method,
            url: config.url,
            params: config.params,
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          return data;
        });
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 401 && !triedForceRefresh) {
          triedForceRefresh = true;
          return send();
        }
        throw err;
      }
    };

    const policy: RetryPolicy = {
      maxRetries: MAX_RETRIES,
      classify: (err, attempt) => {
        if (!(err instanceof AxiosError)) return { kind: 'fatal' };
        // If no response could be network issue (ECONNRESET, ETIMEDOUT, DNS, etc.) so considered retryable.
        if (!err.response) {
          return { kind: 'retryable', waitMs: 2 ** attempt * 200 + Math.random() * 200 };
        }
        const status = err.response.status;
        if (status === 429) {
          const retryAfter = Number(err.response.headers['retry-after']);
          const waitMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 250 + Math.random() * 250, 30_000);
          return { kind: 'retryable', waitMs };
        }
        if (status >= 500) {
          return { kind: 'retryable', waitMs: 2 ** attempt * 200 + Math.random() * 200 };
        }
        return { kind: 'fatal' };
      },
      onRetry: ({ err, attempt, waitMs }) => {
        const status = err instanceof AxiosError && err.response ? err.response.status : undefined;
        this.logger.warn({ status, attempt, waitMs }, 'Airtable retry: backing off');
      },
    };

    try {
      return await withRetry(send, policy);
    } catch (err) {
      if (!(err instanceof AxiosError) || !err.response) throw err;
      const status = err.response.status;
      if (status === 401) throw AppError.unauthorized('Airtable rejected the access token');
      if (status === 403) throw AppError.forbidden('Airtable scope insufficient for this request');
      if (status === 404) throw AppError.notFound('Airtable resource not found');
      throw AppError.integration(
        `Airtable request failed: ${status} ${err.response.statusText}`,
        err,
      );
    }
  }

  private limiterFor(bucketKey: string): Bottleneck {
    let l = this.limiters.get(bucketKey);
    if (!l) {
      l = new Bottleneck({
        reservoir: PUBLIC_API_RPS_PER_BASE,
        reservoirRefreshAmount: PUBLIC_API_RPS_PER_BASE,
        reservoirRefreshInterval: 1_000,
        maxConcurrent: PUBLIC_API_RPS_PER_BASE,
      });
      this.limiters.set(bucketKey, l);
    }
    return l;
  }
}

function parseResponse<T>(schema: ZodSchema<T>, raw: unknown, label: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw AppError.integration(
      `Airtable response did not match expected shape (${label}): ${parsed.error.message}`,
      parsed.error,
    );
  }
  return parsed.data;
}
