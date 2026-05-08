import { Schema, model, type Model } from 'mongoose';
import type { RevisionEvent } from '@sred/shared';

interface AirtableSessionDoc {
  _id: string;
  cookiesEnc: string;
  appIdHeader?: string;
  pageLoadIdHeader?: string;
  userAgent?: string;
  expiresAt: Date;
  updatedAt: Date;
}
const sessionSchema = new Schema<AirtableSessionDoc>(
  {
    _id: { type: String, required: true },
    cookiesEnc: { type: String, required: true },
    appIdHeader: { type: String },
    pageLoadIdHeader: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
  },
  {
    _id: false,
    timestamps: { createdAt: false, updatedAt: true },
    collection: 'airtable_sessions',
  },
);
export const AirtableSessionModel: Model<AirtableSessionDoc> = model<AirtableSessionDoc>(
  'AirtableSession',
  sessionSchema,
);
export type { AirtableSessionDoc };

type RevisionEventDoc = Omit<RevisionEvent, 'createdDate' | 'scrapedAt'> & {
  createdDate: Date;
  scrapedAt: Date;
};
const revisionEventSchema = new Schema<RevisionEventDoc>(
  {
    uuid: { type: String, required: true },
    issueId: { type: String, required: true },
    baseId: { type: String, required: true },
    columnType: { type: String, required: true },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    createdDate: { type: Date, required: true },
    authoredBy: { type: String, required: true },
    runId: { type: String, required: true },
    scrapedAt: { type: Date, required: true },
  },
  { collection: 'revision_events' },
);
revisionEventSchema.index({ uuid: 1 }, { unique: true });
revisionEventSchema.index({ issueId: 1, createdDate: -1 });
revisionEventSchema.index({ baseId: 1, columnType: 1, createdDate: -1 });
export const RevisionEventModel: Model<RevisionEventDoc> = model<RevisionEventDoc>(
  'RevisionEvent',
  revisionEventSchema,
);
export type { RevisionEventDoc };

interface AirtableUserDoc {
  _id: string;
  name: string;
  email?: string;
  updatedAt: Date;
}
const userSchema = new Schema<AirtableUserDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String },
  },
  { _id: false, timestamps: { createdAt: false, updatedAt: true }, collection: 'airtable_users' },
);
export const AirtableUserModel: Model<AirtableUserDoc> = model<AirtableUserDoc>(
  'AirtableUser',
  userSchema,
);
export type { AirtableUserDoc };

interface RevisionParseFailureDoc {
  recordId: string;
  baseId: string;
  runId: string;
  html: string;
  error: string;
  createdAt: Date;
}
const parseFailureSchema = new Schema<RevisionParseFailureDoc>(
  {
    recordId: { type: String, required: true, index: true },
    baseId: { type: String, required: true },
    runId: { type: String, required: true },
    html: { type: String, default: '' },
    error: { type: String, required: true },
  },
  {
    collection: 'revision_parse_failures',
    capped: { size: 50 * 1024 * 1024, max: 500 },
    timestamps: { createdAt: true, updatedAt: false },
  },
);
export const RevisionParseFailureModel: Model<RevisionParseFailureDoc> =
  model<RevisionParseFailureDoc>('RevisionParseFailure', parseFailureSchema);

interface ScraperRunDoc {
  _id: string;
  userId: string;
  baseId: string;
  status: 'pending' | 'running' | 'paused_awaiting_mfa' | 'completed' | 'failed';
  totalRecords: number;
  completedRecords: number;
  failedRecords: number;
  startedAt: Date;
  finishedAt?: Date;
  mfaDeadlineAt?: Date;
}
const runSchema = new Schema<ScraperRunDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    baseId: { type: String, required: true },
    status: { type: String, required: true },
    totalRecords: { type: Number, default: 0 },
    completedRecords: { type: Number, default: 0 },
    failedRecords: { type: Number, default: 0 },
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
    mfaDeadlineAt: { type: Date },
  },
  { _id: false, collection: 'scraper_runs' },
);
export const ScraperRunModel: Model<ScraperRunDoc> = model<ScraperRunDoc>('ScraperRun', runSchema);
export type { ScraperRunDoc };
