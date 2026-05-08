import { z } from 'zod';

// Integrations
export const Integration = z.object({
  id: z.literal('airtable'),
  name: z.string(),
  status: z.enum(['connected', 'disconnected']),
});
export type Integration = z.infer<typeof Integration>;

export const ListIntegrationsResponse = z.object({ integrations: z.array(Integration) });
export type ListIntegrationsResponse = z.infer<typeof ListIntegrationsResponse>;

// Entities
export const Entity = z.object({
  baseId: z.string(),
  baseName: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  recordCount: z.number().int().nonnegative(),
});
export type Entity = z.infer<typeof Entity>;

export const ListEntitiesResponse = z.object({ entities: z.array(Entity) });
export type ListEntitiesResponse = z.infer<typeof ListEntitiesResponse>;

// Grid data
export const GridColumnDef = z.object({
  field: z.string(),
  headerName: z.string(),
  airtableType: z.string(),
  filter: z.string().optional(),
  filterParams: z.record(z.unknown()).optional(),
  cellRenderer: z.string().optional(),
  valueFormatter: z.string().optional(), // name of a registered formatter
  sortable: z.boolean().default(true),
  resizable: z.boolean().default(true),
  type: z.string().optional(),
});
export type GridColumnDef = z.infer<typeof GridColumnDef>;

export const GridDataResponse = z.object({
  rows: z.array(z.record(z.unknown())),
  count: z.number().int().nonnegative(),
  columns: z.array(GridColumnDef),
});
export type GridDataResponse = z.infer<typeof GridDataResponse>;

// Scraper
export const StartScraperRunRequest = z.object({ baseId: z.string() });
export type StartScraperRunRequest = z.infer<typeof StartScraperRunRequest>;

export const StartScraperRunResponse = z.object({ runId: z.string() });
export type StartScraperRunResponse = z.infer<typeof StartScraperRunResponse>;

export const ImportSessionRequest = z.object({
  cookieHeader: z
    .string()
    .trim()
    .min(20)
    .refine((s) => s.includes('__Host-airtable-session') || s.includes('airtable-session'), {
      message: 'Cookie header must include the Airtable session cookie.',
    }),
  appId: z
    .string()
    .trim()
    .regex(/^app[A-Za-z0-9]+$/),
});
export type ImportSessionRequest = z.infer<typeof ImportSessionRequest>;

// Realtime events
export const SocketEvents = {
  MFA_REQUIRED: 'mfa:required',
  MFA_SUCCESS: 'mfa:success',
  MFA_FAILED: 'mfa:failed',
  SYNC_PROGRESS: 'sync:progress',
  SCRAPE_PROGRESS: 'scrape:progress',
  OAUTH_COMPLETE: 'oauth:complete',
} as const;
export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];

export const MfaRequiredPayload = z.object({ sessionId: z.string() });
export const MfaFailedPayload = z.object({ sessionId: z.string().optional(), reason: z.string() });
export const SyncProgressPayload = z.object({
  baseId: z.string().optional(),
  tableId: z.string().optional(),
  fetched: z.number(),
  total: z.number().optional(),
});
export const ScrapeProgressPayload = z.object({
  runId: z.string(),
  completed: z.number(),
  total: z.number(),
  failed: z.number(),
});

export type MfaRequiredPayload = z.infer<typeof MfaRequiredPayload>;
export type MfaFailedPayload = z.infer<typeof MfaFailedPayload>;
export type SyncProgressPayload = z.infer<typeof SyncProgressPayload>;
export type ScrapeProgressPayload = z.infer<typeof ScrapeProgressPayload>;
