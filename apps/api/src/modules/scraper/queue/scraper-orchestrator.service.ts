import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import type { Logger } from '../../../core/logger/logger.js';
import type { ScraperGateway } from '../realtime/scraper.gateway.js';
import type { AirtableInternalClient } from '../client/airtable-internal.client.js';
import { CookieExpiredError, RateLimitedError } from '../client/airtable-internal.client.js';
import { AppError } from '../../../core/errors/app-error.js';
import { parseJsonActivities } from '../parser/revision-json.parser.js';
import type { CookieService } from '../cookie.service.js';
import type { BrowserAuthService } from '../browser/browser-auth.service.js';
import {
  AirtableUserModel,
  RevisionEventModel,
  RevisionParseFailureModel,
  ScraperRunModel,
} from '../schemas.js';
import { RecordModel } from '../../airtable-rest/schemas.js';
import {
  QUEUE_REAUTH,
  QUEUE_RECORD,
  type RecordJobData,
  type ReauthJobData,
} from './scraper.queue.js';
import { randomUUID } from 'node:crypto';

const MFA_DEADLINE_MS = 10 * 60 * 1000;

export class ScraperRunOrchestrator {
  private readonly recordQueue: Queue<RecordJobData>;
  private readonly reauthQueue: Queue<ReauthJobData>;

  constructor(
    connection: ConnectionOptions,
    private readonly logger: Logger,
    private readonly gateway: ScraperGateway,
    private readonly client: AirtableInternalClient,
    private readonly cookieJar: CookieService,
    private readonly browserAuth: BrowserAuthService,
  ) {
    this.recordQueue = new Queue<RecordJobData>(QUEUE_RECORD, { connection });
    this.reauthQueue = new Queue<ReauthJobData>(QUEUE_REAUTH, { connection });
  }

  async startRun(userId: string, baseId: string): Promise<{ runId: string; total: number }> {
    const runId = randomUUID();
    const total = await RecordModel.countDocuments({ baseId });
    await ScraperRunModel.create({
      _id: runId,
      userId,
      baseId,
      status: 'pending',
      totalRecords: total,
    });
    return { runId, total };
  }

  async fanout(data: { runId: string; userId: string; baseId: string }): Promise<void> {
    const { runId, userId, baseId } = data;
    await ScraperRunModel.updateOne({ _id: runId }, { $set: { status: 'running' } });

    const cursor = RecordModel.find({ baseId }, { _id: 1 }).cursor();
    let enqueued = 0;
    for await (const doc of cursor) {
      await this.recordQueue.add(
        'scrape-record',
        { runId, userId, baseId, recordId: doc._id },
        {
          jobId: `scrape-${runId}-${doc._id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 3600, count: 5000 },
          removeOnFail: { age: 24 * 3600 },
        },
      );
      enqueued++;
    }
    this.logger.info({ runId, baseId, enqueued }, 'fanout complete');
  }

  async scrapeOneRecord(data: RecordJobData): Promise<void> {
    const { runId, userId, baseId, recordId } = data;
    if (await this.expireIfMfaDeadlinePassed(runId, userId)) return;
    try {
      const resp = await this.client.fetchRowActivities({ rowId: recordId, userId });
      const { events, ignored } = parseJsonActivities({
        resp,
        recordId,
        baseId,
        runId,
        logger: this.logger,
      });

      await this.snapshotUsers(resp.users);

      if (events.length > 0) {
        const ops = events.map((e) => ({
          updateOne: {
            filter: { uuid: e.uuid },
            update: {
              $setOnInsert: {
                ...e,
                createdDate: new Date(e.createdDate),
                scrapedAt: new Date(e.scrapedAt),
              },
            },
            upsert: true,
          },
        }));
        try {
          await RevisionEventModel.bulkWrite(ops, { ordered: false });
        } catch (err) {
          const writeErrors = (err as { writeErrors?: unknown[] }).writeErrors;
          if (!Array.isArray(writeErrors) || writeErrors.length === 0) throw err;
          this.logger.warn(
            {
              recordId,
              runId,
              count: writeErrors.length,
              sample: writeErrors
                .slice(0, 3)
                .map((e) =>
                  e instanceof Error ? e.message : String((e as { errmsg?: string }).errmsg ?? e),
                ),
            },
            'revision_events bulkWrite had partial failures',
          );
        }
      }
      this.logger.debug({ recordId, events: events.length, ignored }, 'record scraped');
      await this.emitProgress(runId, userId, { completedRecords: 1 });
    } catch (err) {
      const isCookieExpired =
        err instanceof CookieExpiredError ||
        (err instanceof AppError && err.code === 'COOKIE_EXPIRED');
      if (isCookieExpired) {
        await this.cookieJar.markExpired(userId);
        await this.recordQueue.pause();
        await this.reauthQueue.add(
          'reauth',
          { userId, triggerSessionId: randomUUID() },
          { jobId: `reauth-${userId}` },
        );

        // Only set mfaDeadlineAt on the first pause, otherwise a failing reauth would extend the deadline on every record retry
        await ScraperRunModel.updateOne(
          { _id: runId, status: { $ne: 'paused_awaiting_mfa' } },
          {
            $set: {
              status: 'paused_awaiting_mfa',
              mfaDeadlineAt: new Date(Date.now() + MFA_DEADLINE_MS),
            },
          },
        );
        throw err;
      }
      if (err instanceof RateLimitedError) {
        await new Promise((r) => setTimeout(r, err.retryAfterMs));
        throw err;
      }
      this.logger.error({ recordId, err }, 'record scrape failed');
      await this.recordParseFailure({
        recordId,
        baseId,
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.emitProgress(runId, userId, { failedRecords: 1, completedRecords: 1 });
    }
  }

  async reauth(data: ReauthJobData): Promise<void> {
    const { userId, triggerSessionId } = data;
    this.logger.warn({ userId }, 'starting job reauth');
    try {
      await this.browserAuth.acquireCookies({
        userId,
        sessionId: triggerSessionId,
      });
      await ScraperRunModel.updateMany(
        { userId, status: 'paused_awaiting_mfa' },
        { $set: { status: 'running' }, $unset: { mfaDeadlineAt: 1 } },
      );
      this.logger.info({ userId }, 'reauth completed');
    } catch (err) {
      this.logger.error({ userId, err }, 'reauth failed');
      throw err;
    } finally {
      await this.recordQueue.resume();
    }
  }

  private async snapshotUsers(
    users: Record<string, { id: string; name: string; email?: string }>,
  ): Promise<void> {
    const ops = Object.values(users).map((u) => ({
      updateOne: {
        filter: { _id: u.id },
        update: {
          $set: {
            name: u.name,
            ...(u.email ? { email: u.email } : {}),
          },
        },
        upsert: true,
      },
    }));
    if (ops.length > 0) await AirtableUserModel.bulkWrite(ops, { ordered: false });
  }

  async recordParseFailure(opts: {
    recordId: string;
    baseId: string;
    runId: string;
    html?: string;
    error: string;
  }): Promise<void> {
    await RevisionParseFailureModel.create({
      recordId: opts.recordId,
      baseId: opts.baseId,
      runId: opts.runId,
      error: opts.error,
      ...(opts.html ? { html: opts.html.slice(0, 64 * 1024) } : {}),
    });
  }

  private async expireIfMfaDeadlinePassed(runId: string, userId: string): Promise<boolean> {
    const run = await ScraperRunModel.findById(runId, {
      status: 1,
      mfaDeadlineAt: 1,
    }).lean();
    if (!run) return false;
    if (run.status !== 'paused_awaiting_mfa') return false;
    if (!run.mfaDeadlineAt || run.mfaDeadlineAt.getTime() > Date.now()) return false;
    await ScraperRunModel.updateOne(
      { _id: runId, status: 'paused_awaiting_mfa' },
      { $set: { status: 'failed', finishedAt: new Date() } },
    );
    this.logger.warn({ runId, userId }, 'run failed: MFA deadline elapsed without reauth');
    await this.emitProgress(runId, userId, {});
    return true;
  }

  private async emitProgress(
    runId: string,
    userId: string,
    inc: { completedRecords?: number; failedRecords?: number },
  ): Promise<void> {
    const update = Object.keys(inc).length > 0 ? { $inc: inc } : {};
    const run = await ScraperRunModel.findOneAndUpdate({ _id: runId }, update, {
      new: true,
      projection: { status: 1, completedRecords: 1, totalRecords: 1, failedRecords: 1 },
    }).lean();
    if (!run) return;
    if (
      run.status !== 'completed' &&
      run.totalRecords > 0 &&
      run.completedRecords >= run.totalRecords
    ) {
      await ScraperRunModel.updateOne(
        { _id: runId, status: { $ne: 'completed' } },
        { $set: { status: 'completed', finishedAt: new Date() } },
      );
    }
    this.gateway.emitScrapeProgress(userId, {
      runId,
      completed: run.completedRecords,
      total: run.totalRecords,
      failed: run.failedRecords,
    });
  }
}
