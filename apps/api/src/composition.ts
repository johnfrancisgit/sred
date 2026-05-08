import type { ConnectionOptions } from 'bullmq';
import { loadEnv } from './config/env.js';
import { createLogger } from './core/logger/logger.js';
import { SecretBox } from './core/crypto/secret-box.js';
import { connectMongo } from './core/db/mongo.js';
import { createRedis } from './core/db/redis.js';

import { AirtableOauthRepository } from './modules/airtable-oauth/airtable-oauth.repository.js';
import { AirtableOauthService } from './modules/airtable-oauth/airtable-oauth.service.js';
import { AirtableRestClient } from './modules/airtable-rest/airtable-rest.client.js';
import { AirtableSyncService } from './modules/airtable-rest/sync.service.js';

import { CookieService } from './modules/scraper/cookie.service.js';
import { AirtableInternalClient } from './modules/scraper/client/airtable-internal.client.js';
import { ScraperGateway } from './modules/scraper/realtime/scraper.gateway.js';
import { BrowserAuthService } from './modules/scraper/browser/browser-auth.service.js';
import { ScraperRunOrchestrator } from './modules/scraper/queue/scraper-orchestrator.service.js';

export interface Composition {
  env: ReturnType<typeof loadEnv>;
  logger: ReturnType<typeof createLogger>;
  redisConnection: ConnectionOptions;
  airtableOauthRepo: AirtableOauthRepository;
  airtableOauthService: AirtableOauthService;
  syncService: AirtableSyncService;
  airtableInternalClient: AirtableInternalClient;
  scraperGateway: ScraperGateway;
  browserAuth: BrowserAuthService;
  scraperOrchestrator: ScraperRunOrchestrator;
}

export async function compose(): Promise<Composition> {
  const env = loadEnv();
  const logger = createLogger(env);
  const secretBox = new SecretBox(env.DATA_ENCRYPTION_KEY);

  await connectMongo(env.MONGO_URI, logger);
  const redis = createRedis(env.REDIS_URL, logger);

  const redisConnection: ConnectionOptions = { url: env.REDIS_URL };

  const airtableOauthRepo = new AirtableOauthRepository(secretBox);
  const airtableOauthService = new AirtableOauthService(
    env,
    redis,
    airtableOauthRepo,
    logger,
  );
  const airtableRestClient = new AirtableRestClient(airtableOauthService, logger);
  const syncService = new AirtableSyncService(airtableRestClient, logger);

  const cookieJar = new CookieService(secretBox);
  const airtableInternalClient = new AirtableInternalClient(cookieJar, logger);
  const scraperGateway = new ScraperGateway(env, logger);
  const browserAuth = new BrowserAuthService(env, logger, cookieJar, scraperGateway);
  const scraperOrchestrator = new ScraperRunOrchestrator(
    redisConnection,
    logger,
    scraperGateway,
    airtableInternalClient,
    cookieJar,
    browserAuth,
  );

  return {
    env,
    logger,
    redisConnection,
    airtableOauthRepo,
    airtableOauthService,
    syncService,
    airtableInternalClient,
    scraperGateway,
    browserAuth,
    scraperOrchestrator,
  };
}
