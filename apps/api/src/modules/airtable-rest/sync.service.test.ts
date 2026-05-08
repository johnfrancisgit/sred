import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { AirtableRecord } from '@sred/shared';
import { AirtableSyncService } from './sync.service.js';
import { RecordModel } from './schemas.js';
import type { AirtableRestClient } from './airtable-rest.client.js';
import type { Logger } from '../../core/logger/logger.js';

function makeLogger() {
  const calls: { level: string; fields: unknown; msg: unknown }[] = [];
  const fn =
    (level: string) =>
    (fields: unknown, msg?: unknown): void => {
      calls.push({ level, fields, msg });
    };
  const logger = {
    info: fn('info'),
    warn: fn('warn'),
    error: fn('error'),
    debug: fn('debug'),
    trace: fn('trace'),
    fatal: fn('fatal'),
    child: () => logger,
  } as unknown as Logger;
  return { logger, calls };
}

function makeRecord(id: string): AirtableRecord {
  return {
    id,
    createdTime: '2026-01-01T00:00:00.000Z',
    fields: { Name: id },
  };
}

function fakeClient(records: AirtableRecord[]): AirtableRestClient {
  return {
    iterateRecords: async function* () {
      for (const r of records) yield r;
    },
  } as unknown as AirtableRestClient;
}

describe('AirtableSyncService.syncRecords — partial failure', () => {
  // The Mongoose generic on bulkWrite clashes with vitests MockInstance helper.
  // Cast to a permissive shape. We only assert on the mocked return value.
  let bulkWriteSpy: {
    mockResolvedValueOnce: (value: unknown) => unknown;
    mockRejectedValueOnce: (err: unknown) => unknown;
    mockRestore: () => void;
  } & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bulkWriteSpy = vi.spyOn(RecordModel, 'bulkWrite') as unknown as typeof bulkWriteSpy;
  });

  afterEach(() => {
    bulkWriteSpy.mockRestore();
  });

  it('returns { ok: 2, failed: 1 } when one of three records fails to upsert', async () => {
    const records = [makeRecord('rec1'), makeRecord('rec2'), makeRecord('rec3')];
    const { logger, calls } = makeLogger();

    bulkWriteSpy.mockResolvedValueOnce({
      writeErrors: [{ index: 1, errmsg: 'simulated write conflict' }],
    } as never);

    const service = new AirtableSyncService(fakeClient(records), logger);
    const result = await service.syncRecords('user-1', 'appBase', 'tblTable');

    expect(result).toEqual({ count: 2, failed: 1 });
    expect(bulkWriteSpy).toHaveBeenCalledTimes(1);

    const errorCalls = calls.filter((c) => c.level === 'error');
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    const recordIds = errorCalls.map((c) => (c.fields as { recordId?: string }).recordId);
    expect(recordIds).toContain('rec2');
  });

  it('counts every record as failed if the bulk write itself rejects', async () => {
    const records = [makeRecord('rec1'), makeRecord('rec2'), makeRecord('rec3')];
    const { logger, calls } = makeLogger();

    bulkWriteSpy.mockRejectedValueOnce(new Error('mongo down'));

    const service = new AirtableSyncService(fakeClient(records), logger);
    const result = await service.syncRecords('user-1', 'appBase', 'tblTable');

    expect(result).toEqual({ count: 0, failed: 3 });
    const errorCalls = calls.filter((c) => c.level === 'error');
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('happy path: all records succeed -> { count: 3, failed: 0 }', async () => {
    const records = [makeRecord('rec1'), makeRecord('rec2'), makeRecord('rec3')];
    const { logger } = makeLogger();

    bulkWriteSpy.mockResolvedValueOnce({ writeErrors: [] } as never);

    const service = new AirtableSyncService(fakeClient(records), logger);
    const result = await service.syncRecords('user-1', 'appBase', 'tblTable');

    expect(result).toEqual({ count: 3, failed: 0 });
  });
});
