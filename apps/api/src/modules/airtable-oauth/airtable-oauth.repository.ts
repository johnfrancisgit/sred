import { Schema, model, type Model } from 'mongoose';
import type { SecretBox } from '../../core/crypto/secret-box.js';

interface AirtableOauthTokenDoc {
  _id: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
}

const AirtableOauthTokenSchema = new Schema<AirtableOauthTokenDoc>(
  {
    _id: { type: String, required: true },
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    scope: { type: String, required: true },
  },
  { timestamps: true, _id: false, collection: 'airtable_oauth_tokens' },
);

const AirtableOauthTokenModel: Model<AirtableOauthTokenDoc> = model<AirtableOauthTokenDoc>(
  'AirtableOauthToken',
  AirtableOauthTokenSchema,
);

export interface OauthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export class AirtableOauthRepository {
  constructor(private readonly secretBox: SecretBox) {}

  async upsert(userId: string, tokens: OauthTokens): Promise<void> {
    await AirtableOauthTokenModel.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          accessTokenEnc: this.secretBox.encrypt(tokens.accessToken),
          refreshTokenEnc: this.secretBox.encrypt(tokens.refreshToken),
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async get(userId: string): Promise<OauthTokens | null> {
    const doc = await AirtableOauthTokenModel.findById(userId).lean();
    if (!doc) return null;
    return {
      accessToken: this.secretBox.decrypt(doc.accessTokenEnc),
      refreshToken: this.secretBox.decrypt(doc.refreshTokenEnc),
      expiresAt: doc.expiresAt,
      scope: doc.scope,
    };
  }

  async exists(userId: string): Promise<boolean> {
    return (await AirtableOauthTokenModel.exists({ _id: userId })) !== null;
  }

  async delete(userId: string): Promise<void> {
    await AirtableOauthTokenModel.deleteOne({ _id: userId });
  }
}
