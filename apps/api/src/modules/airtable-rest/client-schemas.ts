import { z } from 'zod';
import type { AirtableBase, AirtableRecord, AirtableTable } from '@sred/shared';

const AirtableBaseZ: z.ZodType<AirtableBase> = z.object({
  id: z.string().min(1),
  name: z.string(),
  permissionLevel: z.enum(['none', 'read', 'comment', 'edit', 'create']),
});

const AirtableFieldChoiceZ = z.object({
  name: z.string(),
  color: z.string().optional(),
});

const AirtableFieldZ = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.string(),
  options: z
    .object({
      choices: z.array(AirtableFieldChoiceZ).optional(),
      linkedTableId: z.string().optional(),
      dateFormat: z.object({ name: z.string(), format: z.string().optional() }).optional(),
      precision: z.number().optional(),
      symbol: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

const AirtableTableZ: z.ZodType<AirtableTable> = z.object({
  id: z.string().min(1),
  name: z.string(),
  primaryFieldId: z.string().min(1),
  fields: z.array(AirtableFieldZ),
}) as unknown as z.ZodType<AirtableTable>;

const AirtableRecordZ: z.ZodType<AirtableRecord> = z.object({
  id: z.string().min(1),
  createdTime: z.string().min(1),
  fields: z.record(z.unknown()),
});

export const ListBasesRespZ = z.object({
  bases: z.array(AirtableBaseZ),
  offset: z.string().optional(),
});
export type ListBasesResp = z.infer<typeof ListBasesRespZ>;

export const BaseSchemaRespZ = z.object({
  tables: z.array(AirtableTableZ),
});

export const ListRecordsRespZ = z.object({
  records: z.array(AirtableRecordZ),
  offset: z.string().optional(),
});
export type ListRecordsResp = z.infer<typeof ListRecordsRespZ>;
