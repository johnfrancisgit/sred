import { Router } from 'express';
import type { Integration, ListIntegrationsResponse } from '@sred/shared';
import type { AirtableOauthRepository } from '../airtable-oauth/airtable-oauth.repository.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';

export function createIntegrationsRouter(deps: {
  oauthRepo: AirtableOauthRepository;
}): Router {
  const router = Router();
  const { oauthRepo } = deps;

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const connected = await oauthRepo.exists(SINGLETON_TENANT_ID);
      const airtable: Integration = {
        id: 'airtable',
        name: 'Airtable',
        status: connected ? 'connected' : 'disconnected',
      };
      const body: ListIntegrationsResponse = { integrations: [airtable] };
      res.json(body);
    }),
  );

  return router;
}
