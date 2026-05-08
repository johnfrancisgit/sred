import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from '../../../core/logger/logger.js';
import type { ScraperRunOrchestrator } from './scraper-orchestrator.service.js';

export const QUEUE_RECORD = 'scraper.record';
export const QUEUE_REAUTH = 'scraper.reauth';

export interface RecordJobData {
  runId: string;
  userId: string;
  baseId: string;
  recordId: string;
}
export interface ReauthJobData {
  userId: string;
  triggerSessionId: string;
}

export interface StartWorkersDeps {
  connection: ConnectionOptions;
  logger: Logger;
  orchestrator: ScraperRunOrchestrator;
}

export function startWorkers(deps: StartWorkersDeps): { close: () => Promise<void> } {
  const { connection, logger, orchestrator } = deps;

  const recordWorker = new Worker<RecordJobData>(
    QUEUE_RECORD,
    async (job: Job<RecordJobData>) => orchestrator.scrapeOneRecord(job.data),
    {
      connection,
      concurrency: 4,
      limiter: { max: 4, duration: 1000 },
    },
  );

  const reauthWorker = new Worker<ReauthJobData>(
    QUEUE_REAUTH,
    async (job: Job<ReauthJobData>) => orchestrator.reauth(job.data),
    { connection, concurrency: 1 },
  );

  for (const w of [recordWorker, reauthWorker]) {
    w.on('failed', (job, err) =>
      logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed'),
    );
    w.on('completed', (job) =>
      logger.debug({ queue: w.name, jobId: job.id }, 'job completed'),
    );
  }

  return {
    close: async () => {
      await Promise.all([recordWorker.close(), reauthWorker.close()]);
    },
  };
}
