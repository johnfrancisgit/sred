import { Router } from 'express';
import { z } from 'zod';
import {
  ImportSessionRequest,
  StartScraperRunRequest,
  type StartScraperRunResponse,
} from '@sred/shared';
import { asyncHandler } from '../../core/http/async-handler.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';
import { validateBody } from '../../core/http/zod.middleware.js';
import { AppError } from '../../core/errors/app-error.js';
import type { BrowserAuthService } from './browser/browser-auth.service.js';
import type { AirtableInternalClient } from './client/airtable-internal.client.js';
import type { ScraperRunOrchestrator } from './queue/scraper-orchestrator.service.js';
import type { ScraperGateway } from './realtime/scraper.gateway.js';
import type { Logger } from '../../core/logger/logger.js';
import { randomUUID } from 'node:crypto';
import { AirtableUserModel, RevisionEventModel, ScraperRunModel } from './schemas.js';
import { AirtableBaseModel, RecordModel } from '../airtable-rest/schemas.js';

const RecordIdQuery = z.object({ recordId: z.string().min(1) });

export function createScraperRouter(deps: {
  browserAuth: BrowserAuthService;
  internalClient: AirtableInternalClient;
  orchestrator: ScraperRunOrchestrator;
  gateway: ScraperGateway;
  logger: Logger;
}): Router {
  const router = Router();
  const { browserAuth, internalClient, orchestrator, gateway, logger } = deps;

  router.post(
    '/sessions',
    asyncHandler(async (req, res) => {
      const sessionId = randomUUID();
      const userId = SINGLETON_TENANT_ID;
      void browserAuth.acquireCookies({ userId, sessionId }).catch((err) => {
        gateway.emitMfaFailed(userId, {
          sessionId,
          reason: err instanceof Error ? err.message : 'Browser session failed',
        });
      });
      res.status(202).json({ sessionId });
    }),
  );

  router.post(
    '/sessions/manual',
    validateBody(ImportSessionRequest),
    asyncHandler(async (req, res) => {
      const body = req.body as ImportSessionRequest;
      await browserAuth.importManualSession(SINGLETON_TENANT_ID, body);
      res.status(204).end();
    }),
  );

  router.post(
    '/sessions/validate',
    asyncHandler(async (req, res) => {
      const userId = SINGLETON_TENANT_ID;
      const anyBase = await AirtableBaseModel.findOne({ userId }).lean();
      if (!anyBase) {
        res.json({ status: 'never_connected' });
        return;
      }
      const status = await internalClient.probeValidity(userId, anyBase._id);
      res.json({ status });
    }),
  );

  router.post(
    '/runs',
    validateBody(StartScraperRunRequest),
    asyncHandler(async (req, res) => {
      const userId = SINGLETON_TENANT_ID;
      const { baseId } = req.body as z.infer<typeof StartScraperRunRequest>;
      const ownsBase = await AirtableBaseModel.exists({ _id: baseId, userId });
      if (!ownsBase) throw AppError.notFound('Unknown base');
      const { runId, total } = await orchestrator.startRun(userId, baseId);
      if (total === 0)
        throw AppError.badRequest('No synced records for that base. Run REST sync first.');
      void orchestrator
        .fanout({ runId, userId, baseId })
        .catch((err) => logger.error({ err, runId }, 'fanout failed'));
      const body: StartScraperRunResponse = { runId };
      res.status(202).json(body);
    }),
  );

  router.get(
    '/runs/:runId',
    asyncHandler(async (req, res) => {
      const { runId } = req.params as { runId: string };
      const userId = SINGLETON_TENANT_ID;
      const run = await ScraperRunModel.findOne({ _id: runId, userId }).lean();
      if (!run) throw AppError.notFound('Run not found');
      res.json(run);
    }),
  );

  router.get(
    '/events',
    asyncHandler(async (req, res) => {
      const parsed = RecordIdQuery.safeParse(req.query);
      if (!parsed.success) throw AppError.badRequest('recordId is required');
      const userId = SINGLETON_TENANT_ID;
      const record = await RecordModel.findById(parsed.data.recordId, { baseId: 1 }).lean();
      if (!record) {
        res.json({ events: [] });
        return;
      }
      const ownsBase = await AirtableBaseModel.exists({ _id: record.baseId, userId });
      if (!ownsBase) throw AppError.notFound('Record not found');
      const events = await RevisionEventModel.find({ issueId: parsed.data.recordId })
        .sort({ createdDate: -1 })
        .lean();
      const userIds = [...new Set(events.map((e) => e.authoredBy))];
      const users = userIds.length
        ? await AirtableUserModel.find({ _id: { $in: userIds } }, { name: 1 }).lean()
        : [];
      const nameById = new Map(users.map((u) => [u._id, u.name]));
      const decorated = events.map((e) => ({
        ...e,
        createdDate: e.createdDate.toISOString(),
        scrapedAt: e.scrapedAt.toISOString(),
        authoredByName: nameById.get(e.authoredBy),
      }));
      res.json({ events: decorated });
    }),
  );

  return router;
}
