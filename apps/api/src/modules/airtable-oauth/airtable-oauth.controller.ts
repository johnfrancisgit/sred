import { Router } from 'express';
import { z } from 'zod';
import type { AirtableOauthService } from './airtable-oauth.service.js';
import { asyncHandler } from '../../core/http/async-handler.js';
import { validateQuery } from '../../core/http/zod.middleware.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Env } from '../../config/env.js';
import { SINGLETON_TENANT_ID } from '../../core/tenant.js';

const CallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export function createAirtableOauthRouter(deps: {
  env: Env;
  oauthService: AirtableOauthService;
}): Router {
  const router = Router();
  const { env, oauthService } = deps;

  router.get(
    '/start',
    asyncHandler(async (_req, res) => {
      const url = await oauthService.buildAuthorizeUrl(SINGLETON_TENANT_ID);
      res.redirect(302, url);
    }),
  );

  router.get(
    '/callback',
    validateQuery(CallbackQuery),
    asyncHandler(async (req, res) => {
      const { code, state, error, error_description } = req.query as z.infer<typeof CallbackQuery>;
      if (error) {
        res.redirect(
          302,
          `${env.WEB_ORIGIN}/connect?airtable=error&reason=${encodeURIComponent(error_description ?? error)}`,
        );
        return;
      }
      if (!code || !state) throw AppError.badRequest('Missing code or state');
      await oauthService.handleCallback(code, state);
      res.redirect(302, `${env.WEB_ORIGIN}/connect?airtable=connected`);
    }),
  );

  router.post(
    '/disconnect',
    asyncHandler(async (_req, res) => {
      await oauthService.disconnect(SINGLETON_TENANT_ID);
      res.status(204).end();
    }),
  );

  return router;
}
