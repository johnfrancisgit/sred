import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import type { Composition } from './composition.js';
import { errorHandler, notFoundHandler } from './core/errors/error-middleware.js';
import { createAirtableOauthRouter } from './modules/airtable-oauth/airtable-oauth.controller.js';
import { createAirtableRestRouter } from './modules/airtable-rest/airtable-rest.controller.js';
import { createIntegrationsRouter } from './modules/integrations/integrations.controller.js';
import { createEntitiesRouter } from './modules/entities/entities.controller.js';
import { createGridRouter } from './modules/grid/grid.controller.js';
import { createScraperRouter } from './modules/scraper/scraper.controller.js';

export function buildApp(composition: Composition): Express {
  const {
    env,
    logger,
    airtableOauthRepo,
    airtableOauthService,
    syncService,
    browserAuth,
    airtableInternalClient,
    scraperOrchestrator,
    scraperGateway,
  } = composition;
  const app = express();

  app.use(pinoHttp({ logger }));

  // CORP relaxed so the cross-origin SPA can read responses
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/api/airtable/oauth',
    createAirtableOauthRouter({ env, oauthService: airtableOauthService }),
  );
  app.use('/api/airtable', createAirtableRestRouter({ syncService }));
  app.use('/api/integrations', createIntegrationsRouter({ oauthRepo: airtableOauthRepo }));
  app.use('/api/entities', createEntitiesRouter());
  app.use('/api/grid', createGridRouter());
  app.use(
    '/api/scraper',
    createScraperRouter({
      browserAuth,
      internalClient: airtableInternalClient,
      orchestrator: scraperOrchestrator,
      gateway: scraperGateway,
      logger,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
