import { chromium, type Cookie, type Page, type Request } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Env } from '../../../config/env.js';
import type { Logger } from '../../../core/logger/logger.js';
import type { CookieService } from '../cookie.service.js';
import type { ScraperGateway } from '../realtime/scraper.gateway.js';
import { AirtableBaseModel } from '../../airtable-rest/schemas.js';
import { AppError } from '../../../core/errors/app-error.js';
import { parseCookieHeader } from '../../../core/http/cookie-parser.js';

const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60_000;
const POST_LOGIN_URL_PATTERN =
  /airtable\.com\/($|home|create|workspace|appBlanks|apps?\/|spaces?\/)/;

export interface AcquireCookiesOptions {
  userId: string;
  sessionId: string;
}

export class BrowserAuthService {
  constructor(
    private readonly env: Env,
    private readonly logger: Logger,
    private readonly cookieJar: CookieService,
    private readonly gateway: ScraperGateway,
  ) {}

  async importManualSession(
    userId: string,
    params: { cookieHeader: string; appId: string },
  ): Promise<void> {
    const parsed = parseCookieHeader(params.cookieHeader);
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
      throw AppError.badRequest('Cookie header parsed to zero cookies.');
    }
    // Either name authenticates the request; without one of them every
    // downstream scrape will 401, so reject up front with a clear hint.
    if (!('__Host-airtable-session' in parsed) && !('brw' in parsed)) {
      throw AppError.badRequest(
        'Imported cookies invalud. Sign in at airtable.com, then copy the Cookie header again.',
      );
    }
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const expiresEpoch = Math.floor(expiresAt.getTime() / 1000);
    const cookies: Cookie[] = entries.map(([name, value]) => ({
      name,
      value,
      domain: 'airtable.com',
      path: '/',
      expires: expiresEpoch,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    }));
    await this.cookieJar.save(userId, {
      cookies,
      appIdHeader: params.appId,
      expiresAt,
    });
    this.logger.info(
      { userId, appId: params.appId, cookieCount: cookies.length },
      'manual session import saved',
    );
  }

  async acquireCookies(opts: AcquireCookiesOptions): Promise<void> {
    const profileDir = path.resolve(this.env.AIRTABLE_SCRAPER_PROFILE_DIR, opts.userId);
    await this.clearStaleSingletonLocks(profileDir);
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    let appId: string | undefined;
    let pageLoadId: string | undefined;
    let userAgent: string | undefined;
    page.on('request', (req: Request) => {
      const url = req.url();
      if (url.includes('/v0.3/application/') && url.includes('/read')) {
        const headers = req.headers();
        appId ??= headers['x-airtable-application-id'];
        pageLoadId ??= headers['x-airtable-page-load-id'];
        userAgent ??= headers['user-agent'];
      }
    });

    try {
      await this.driveManualLogin(page, opts);
      await this.navigateIntoBaseForAppIdCapture(page, opts.userId);
      if (!appId || !pageLoadId) {
        await this.waitForApplicationProbe(page);
      }
      const cookies = await context.cookies();
      if (!userAgent) {
        userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
      }
      await this.cookieJar.save(opts.userId, {
        cookies,
        appIdHeader: appId,
        pageLoadIdHeader: pageLoadId,
        userAgent,
        expiresAt: computeMaxCookieExpiry(cookies),
      });
      this.gateway.emitMfaSuccess(opts.userId);
      this.logger.info(
        { userId: opts.userId, appId: !!appId, pageLoadId: !!pageLoadId },
        'cookies acquired',
      );
    } finally {
      await context.close().catch(() => {});
      await fs
        .rm(profileDir, { recursive: true, force: true })
        .catch((err) =>
          this.logger.warn({ err, profileDir }, 'failed to drop profile (continuing)'),
        );
    }
  }

  private async driveManualLogin(page: Page, opts: AcquireCookiesOptions): Promise<void> {
    await page.goto('https://airtable.com/login', { waitUntil: 'domcontentloaded' });
    this.gateway.emitMfaRequired(opts.userId, { sessionId: opts.sessionId });
    await page
      .waitForURL(POST_LOGIN_URL_PATTERN, { timeout: MANUAL_LOGIN_TIMEOUT_MS })
      .catch(() => {
        throw AppError.unauthorized(
          `Login did not complete within ${MANUAL_LOGIN_TIMEOUT_MS / 1000}s. Close the browser and try again.`,
        );
      });
  }

  private async navigateIntoBaseForAppIdCapture(page: Page, userId: string): Promise<void> {
    const base = await AirtableBaseModel.findOne({ userId }, { _id: 1 }).lean();
    if (!base) {
      return;
    }
    await page.goto(`https://airtable.com/${base._id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
  }

  private async waitForApplicationProbe(page: Page): Promise<void> {
    // In some cases the appId doesn't come through until a request is made to the application read endpoint
    try {
      await page.waitForRequest(
        (req) => req.url().includes('/v0.3/application/') && req.url().includes('/read'),
        { timeout: 15_000 },
      );
    } catch {
      this.logger.warn('did not observe application-id probe within 15s; continuing');
    }
  }

  private async clearStaleSingletonLocks(profileDir: string): Promise<void> {
    // Cleanup leftover locks when chrome doesn't close cleanly
    const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    await Promise.all(
      names.map(async (name) => {
        const target = path.join(profileDir, name);
        await fs.rm(target, { force: true });
      }),
    );
  }
}

function computeMaxCookieExpiry(cookies: Cookie[]): Date {
  const expiries = cookies
    .map((c) => c.expires)
    .filter((e): e is number => typeof e === 'number' && e > 0);
  if (expiries.length === 0) return new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
  return new Date(Math.max(...expiries) * 1000);
}
