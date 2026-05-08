import { Schema, model, type Model } from 'mongoose';
import type { AirtableField } from '@sred/shared';

// ----- airtable_bases ---------------------------------------------------
interface AirtableBaseDoc {
  _id: string;
  userId: string;
  name: string;
  permissionLevel: string;
  syncedAt: Date;
}
const baseSchema = new Schema<AirtableBaseDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    permissionLevel: { type: String, required: true },
    syncedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false, collection: 'airtable_bases' },
);
export const AirtableBaseModel: Model<AirtableBaseDoc> = model<AirtableBaseDoc>(
  'AirtableBase',
  baseSchema,
);

// ----- airtable_tables --------------------------------------------------
interface AirtableTableDoc {
  _id: string;
  baseId: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableField[];
  syncedAt: Date;
}
const tableSchema = new Schema<AirtableTableDoc>(
  {
    _id: { type: String, required: true },
    baseId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    primaryFieldId: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false, collection: 'airtable_tables' },
);
export const AirtableTableModel: Model<AirtableTableDoc> = model<AirtableTableDoc>(
  'AirtableTable',
  tableSchema,
);

// ----- records --------------------------
interface RecordDoc {
  _id: string;
  baseId: string;
  tableId: string;
  fields: Record<string, unknown>;
  createdTime: Date;
  syncedAt: Date;
}
const recordSchema = new Schema<RecordDoc>(
  {
    _id: { type: String, required: true },
    baseId: { type: String, required: true },
    tableId: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, required: true },
    createdTime: { type: Date, required: true },
    syncedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false, collection: 'records' },
);
recordSchema.index({ tableId: 1, _id: 1 });
recordSchema.index({ baseId: 1, tableId: 1 });
recordSchema.index({ tableId: 1, syncedAt: -1 });

export const RecordModel: Model<RecordDoc> = model<RecordDoc>('AirtableRecord', recordSchema);
export type { RecordDoc };
