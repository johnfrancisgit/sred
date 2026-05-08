import { Router } from 'express';
import type { Entity, ListEntitiesResponse } from '@sred/shared';
import { asyncHandler } from '../../core/http/async-handler.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';
import { AirtableBaseModel, AirtableTableModel, RecordModel } from '../airtable-rest/schemas.js';

export function createEntitiesRouter(): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const userId = SINGLETON_TENANT_ID;
      const bases = await AirtableBaseModel.find({ userId }).lean();
      if (bases.length === 0) {
        const body: ListEntitiesResponse = { entities: [] };
        res.json(body);
        return;
      }

      const baseIds = bases.map((b) => b._id);
      const tables = await AirtableTableModel.find({ baseId: { $in: baseIds } }).lean();
      const counts = await RecordModel.aggregate<{ _id: string; count: number }>([
        { $match: { baseId: { $in: baseIds } } },
        { $group: { _id: '$tableId', count: { $sum: 1 } } },
      ]);
      const countByTable = new Map(counts.map((c) => [c._id, c.count]));
      const baseById = new Map(bases.map((b) => [b._id, b.name]));

      const entities: Entity[] = tables.map((t) => ({
        baseId: t.baseId,
        baseName: baseById.get(t.baseId) ?? t.baseId,
        tableId: t._id,
        tableName: t.name,
        recordCount: countByTable.get(t._id) ?? 0,
      }));
      const body: ListEntitiesResponse = { entities };
      res.json(body);
    }),
  );

  return router;
}
