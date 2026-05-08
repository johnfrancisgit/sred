import type { Cookie } from 'playwright';
import { AirtableSessionModel } from './schemas.js';
import type { SecretBox } from '../../core/crypto/secret-box.js';
import { AppError } from '../../core/errors/app-error.js';

export interface AirtableCookies {
  cookies: Cookie[];
  appIdHeader?: string;
  pageLoadIdHeader?: string;
  userAgent?: string;
  expiresAt: Date;
}

export class CookieService {
  constructor(private readonly secretBox: SecretBox) {}

  async save(userId: string, value: AirtableCookies): Promise<void> {
    const serialized = JSON.stringify({
      cookies: value.cookies,
      appIdHeader: value.appIdHeader,
      pageLoadIdHeader: value.pageLoadIdHeader,
      userAgent: value.userAgent,
      expiresAt: value.expiresAt.toISOString(),
    });
    const encrypted = this.secretBox.encrypt(serialized);
    await AirtableSessionModel.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          cookiesEnc: encrypted,
          appIdHeader: value.appIdHeader,
          pageLoadIdHeader: value.pageLoadIdHeader,
          userAgent: value.userAgent,
          expiresAt: value.expiresAt,
        },
      },
      { upsert: true, new: true },
    );
  }

  async get(userId: string): Promise<AirtableCookies | null> {
    const doc = await AirtableSessionModel.findById(userId).lean();
    if (!doc) return null;
    return this.parse(this.secretBox.decrypt(doc.cookiesEnc));
  }

  async require(userId: string): Promise<AirtableCookies> {
    const cookies = await this.get(userId);
    if (!cookies) throw AppError.cookieExpired();
    return cookies;
  }

  async markExpired(userId: string): Promise<void> {
    await AirtableSessionModel.updateOne({ _id: userId }, { $set: { expiresAt: new Date(0) } });
  }

  private parse(serialized: string): AirtableCookies {
    const parsed = JSON.parse(serialized);
    return {
      cookies: parsed.cookies,
      appIdHeader: parsed.appIdHeader,
      pageLoadIdHeader: parsed.pageLoadIdHeader,
      userAgent: parsed.userAgent,
      expiresAt: new Date(parsed.expiresAt),
    };
  }
}
