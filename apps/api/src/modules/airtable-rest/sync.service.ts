import type { AnyBulkWriteOperation } from 'mongoose';
import type { AirtableRecord } from '@sred/shared';
import type { AirtableRestClient } from './airtable-rest.client.js';
import { AirtableBaseModel, AirtableTableModel, RecordModel, type RecordDoc } from './schemas.js';
import type { Logger } from '../../core/logger/logger.js';

const RECORD_BULK_CHUNK_SIZE = 100;

export interface SyncResult {
  count: number;
  failed: number;
}

export interface SyncBasesResult extends SyncResult {
  baseIds: string[];
}

export class AirtableSyncService {
  constructor(
    private readonly client: AirtableRestClient,
    private readonly logger: Logger,
  ) {}

  async syncBases(userId: string): Promise<SyncBasesResult> {
    const baseIds: string[] = [];
    let failed = 0;
    for await (const base of this.client.iterateBases(userId)) {
      try {
        await AirtableBaseModel.findOneAndUpdate(
          { _id: base.id },
          {
            $set: {
              userId,
              name: base.name,
              permissionLevel: base.permissionLevel,
              syncedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );
        baseIds.push(base.id);
      } catch (err) {
        failed++;
        this.logger.error({ err, userId, baseId: base.id }, 'syncBases: upsert failed');
      }
    }
    this.logger.info({ userId, count: baseIds.length, failed }, 'syncBases complete');
    return { count: baseIds.length, failed, baseIds };
  }

  async syncTables(userId: string, baseId: string): Promise<SyncResult> {
    const tables = await this.client.getBaseSchema(userId, baseId);
    let ok = 0;
    let failed = 0;
    for (const table of tables) {
      try {
        await AirtableTableModel.findOneAndUpdate(
          { _id: table.id },
          {
            $set: {
              baseId,
              name: table.name,
              primaryFieldId: table.primaryFieldId,
              fields: table.fields,
              syncedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );
        ok++;
      } catch (err) {
        failed++;
        this.logger.error(
          { err, userId, baseId, tableId: table.id },
          'syncTables: upsert failed',
        );
      }
    }
    this.logger.info({ userId, baseId, count: ok, failed }, 'syncTables complete');
    return { count: ok, failed };
  }

  async syncRecords(
    userId: string,
    baseId: string,
    tableId: string,
  ): Promise<SyncResult> {
    let ok = 0;
    let failed = 0;
    let buffer: AirtableRecord[] = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const chunk = buffer;
      buffer = [];
      const result = await this.bulkUpsertRecords(userId, baseId, tableId, chunk);
      ok += result.count;
      failed += result.failed;
    };

    for await (const record of this.client.iterateRecords(userId, baseId, tableId)) {
      buffer.push(record);
      if (buffer.length >= RECORD_BULK_CHUNK_SIZE) {
        await flush();
      }
    }
    await flush();

    this.logger.info({ userId, baseId, tableId, count: ok, failed }, 'syncRecords complete');
    return { count: ok, failed };
  }

  private async bulkUpsertRecords(
    userId: string,
    baseId: string,
    tableId: string,
    chunk: AirtableRecord[],
  ): Promise<SyncResult> {
    if (chunk.length === 0) return { count: 0, failed: 0 };

    const ops: AnyBulkWriteOperation<RecordDoc>[] = chunk.map((record) => ({
      updateOne: {
        filter: { _id: record.id },
        update: {
          $set: {
            baseId,
            tableId,
            fields: record.fields,
            createdTime: new Date(record.createdTime),
            syncedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    try {
      const result = await RecordModel.bulkWrite(ops, { ordered: false });
      const writeErrors =
        (result as unknown as { writeErrors?: Array<{ index?: number; errmsg?: string }> })
          .writeErrors ?? [];
      for (const we of writeErrors) {
        const idx = we.index ?? -1;
        const recordId = idx >= 0 && idx < chunk.length ? chunk[idx]?.id : undefined;
        this.logger.error(
          { userId, baseId, tableId, recordId, errmsg: we.errmsg },
          'syncRecords: bulk upsert rejected one record',
        );
      }
      const failed = writeErrors.length;
      return { count: chunk.length - failed, failed };
    } catch (err) {
      this.logger.error(
        { err, userId, baseId, tableId, chunkSize: chunk.length },
        'syncRecords: bulk upsert chunk failed entirely',
      );
      return { count: 0, failed: chunk.length };
    }
  }

  async syncBaseEverything(
    userId: string,
    baseId: string,
  ): Promise<{ tables: number; tablesFailed: number; records: number; recordsFailed: number }> {
    const { count: tableCount, failed: tablesFailed } = await this.syncTables(userId, baseId);
    const tables = await AirtableTableModel.find({ baseId }, { _id: 1 }).lean();
    let recordTotal = 0;
    let recordsFailed = 0;
    for (const t of tables) {
      const { count, failed } = await this.syncRecords(userId, baseId, t._id);
      recordTotal += count;
      recordsFailed += failed;
    }
    return { tables: tableCount, tablesFailed, records: recordTotal, recordsFailed };
  }
}
