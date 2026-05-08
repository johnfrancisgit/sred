export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: 'none' | 'read' | 'comment' | 'edit' | 'create';
}

export interface AirtableFieldOptionChoice {
  name: string;
  color?: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: AirtableFieldType;
  options?: {
    choices?: AirtableFieldOptionChoice[];
    linkedTableId?: string;
    dateFormat?: { name: string; format?: string };
    precision?: number;
    symbol?: string;
    [extra: string]: unknown;
  };
}

export type AirtableFieldType =
  | 'singleLineText'
  | 'multilineText'
  | 'email'
  | 'number'
  | 'currency'
  | 'percent'
  | 'count'
  | 'rating'
  | 'duration'
  | 'date'
  | 'dateTime'
  | 'createdTime'
  | 'lastModifiedTime'
  | 'singleSelect'
  | 'multipleSelects'
  | 'singleCollaborator'
  | 'multipleCollaborators'
  | 'multipleRecordLinks'
  | 'multipleAttachments'
  | 'checkbox'
  | 'formula'
  | 'rollup'
  | 'lookup'
  | 'autoNumber'
  | 'button'
  | 'createdBy'
  | 'lastModifiedBy';

export interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableField[];
}

export interface AirtableRecord<F extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}
