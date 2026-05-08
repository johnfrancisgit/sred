import { Router } from 'express';
import { z } from 'zod';
import type { AirtableSyncService } from './sync.service.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validateParams } from '../../core/http/zod.middleware.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';
import { AirtableBaseIdZ } from '../../core/validation/airtable-ids.js';

const BaseIdParam = z.object({ baseId: AirtableBaseIdZ });
const BaseTableParams = BaseIdParam.extend({ tableId: z.string().min(1) });

export function createAirtableRestRouter(deps: { syncService: AirtableSyncService }): Router {
  const router = Router();
  const { syncService } = deps;

  router.post(
    '/sync/bases',
    asyncHandler(async (req, res) => {
      const result = await syncService.syncBases(SINGLETON_TENANT_ID);
      res.json(result);
    }),
  );

  router.post(
    '/sync/bases/:baseId/tables',
    validateParams(BaseIdParam),
    asyncHandler(async (req, res) => {
      const { baseId } = req.params as z.infer<typeof BaseIdParam>;
      const result = await syncService.syncTables(SINGLETON_TENANT_ID, baseId);
      res.json(result);
    }),
  );

  router.post(
    '/sync/bases/:baseId/tables/:tableId/records',
    validateParams(BaseTableParams),
    asyncHandler(async (req, res) => {
      const { baseId, tableId } = req.params as z.infer<typeof BaseTableParams>;
      const result = await syncService.syncRecords(SINGLETON_TENANT_ID, baseId, tableId);
      res.json(result);
    }),
  );

  router.post(
    '/sync/bases/:baseId',
    validateParams(BaseIdParam),
    asyncHandler(async (req, res) => {
      const { baseId } = req.params as z.infer<typeof BaseIdParam>;
      const result = await syncService.syncBaseEverything(SINGLETON_TENANT_ID, baseId);
      res.json(result);
    }),
  );

  return router;
}
