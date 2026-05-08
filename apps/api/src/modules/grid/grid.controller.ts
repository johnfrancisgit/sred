import { Router } from 'express';
import { z } from 'zod';
import type { GridDataResponse } from '@sred/shared';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validateParams } from '../../core/http/zod.middleware.js';
import { AppError } from '../../core/errors/app-error.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';
import { AirtableBaseModel, AirtableTableModel, RecordModel } from '../airtable-rest/schemas.js';
import { AirtableBaseIdZ } from '../../core/validation/airtable-ids.js';
import { fieldsToColDefs } from './schema-to-coldefs.js';

interface RecordWithRevisions {
  _id: string;
  fields: Record<string, unknown>;
  createdTime: Date;
  _revisionCount: number;
  _lastRevisedAt: Date | null;
}

const Params = z.object({
  baseId: AirtableBaseIdZ,
  tableId: z.string().min(1),
});

export function createGridRouter(): Router {
  const router = Router();

  router.get(
    '/:baseId/:tableId/records',
    validateParams(Params),
    asyncHandler(async (req, res) => {
      const { baseId, tableId } = req.params as z.infer<typeof Params>;
      const userId = SINGLETON_TENANT_ID;

      const ownsBase = await AirtableBaseModel.exists({ _id: baseId, userId });
      if (!ownsBase) throw AppError.notFound('Unknown base/table');

      const table = await AirtableTableModel.findById(tableId).lean();
      if (!table || table.baseId !== baseId) throw AppError.notFound('Unknown base/table');

      const docs = await RecordModel.aggregate<RecordWithRevisions>([
        { $match: { tableId } },
        { $sort: { _id: 1 } },
        {
          $lookup: {
            from: 'revision_events',
            let: { rid: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$issueId', '$$rid'] } } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  last: { $max: '$createdDate' },
                },
              },
            ],
            as: '_rev',
          },
        },
        {
          $addFields: {
            _revisionCount: {
              $ifNull: [{ $arrayElemAt: ['$_rev.count', 0] }, 0],
            },
            _lastRevisedAt: { $arrayElemAt: ['$_rev.last', 0] },
          },
        },
        { $project: { _rev: 0 } },
      ]);
      const linkFields = table.fields.filter(
        (f) => f.type === 'multipleRecordLinks' && f.options?.linkedTableId,
      );
      const idsByLinkedTable = new Map<string, Set<string>>();
      for (const f of linkFields) {
        const linkedTableId = f.options!.linkedTableId!;
        let bucket = idsByLinkedTable.get(linkedTableId);
        if (!bucket) {
          bucket = new Set<string>();
          idsByLinkedTable.set(linkedTableId, bucket);
        }
        for (const d of docs) {
          const v = d.fields[f.name];
          if (Array.isArray(v)) {
            for (const id of v) if (typeof id === 'string') bucket.add(id);
          }
        }
      }

      const lookups = await Promise.all(
        Array.from(idsByLinkedTable.entries()).map(async ([linkedTableId, ids]) => {
          if (ids.size === 0) return [linkedTableId, new Map<string, string>()] as const;
          const linkedTable = await AirtableTableModel.findById(linkedTableId).lean();
          const primaryFieldName = linkedTable?.fields.find(
            (f) => f.id === linkedTable.primaryFieldId,
          )?.name;
          const map = new Map<string, string>();
          if (!primaryFieldName) return [linkedTableId, map] as const;
          const linkedDocs = await RecordModel.find(
            { tableId: linkedTableId, _id: { $in: Array.from(ids) } },
            { _id: 1, fields: 1 },
          ).lean();
          for (const doc of linkedDocs) {
            const raw = (doc.fields as Record<string, unknown>)[primaryFieldName];
            map.set(doc._id, raw !== null && raw !== '' ? String(raw) : doc._id);
          }
          return [linkedTableId, map] as const;
        }),
      );
      const lookupByTable = new Map(lookups);

      const rows = docs.map((d) => {
        const fields: Record<string, unknown> = { ...d.fields };
        for (const f of linkFields) {
          const v = fields[f.name];
          if (Array.isArray(v)) {
            const map = lookupByTable.get(f.options!.linkedTableId!);
            fields[f.name] = v.map((id) => (typeof id === 'string' ? (map?.get(id) ?? id) : id));
          }
        }
        return {
          _recordId: d._id,
          _createdTime: d.createdTime,
          _revisionCount: d._revisionCount,
          _lastRevisedAt: d._lastRevisedAt ? new Date(d._lastRevisedAt).toISOString() : null,
          ...fields,
        };
      });
      const columns = fieldsToColDefs(table.fields);
      const body: GridDataResponse = { rows, count: rows.length, columns };
      res.json(body);
    }),
  );

  return router;
}
