import { describe, expect, it } from 'vitest';
import { fieldToColDef } from './schema-to-coldefs.js';

describe('fieldToColDef', () => {
  it('maps text fields to a text filter', () => {
    expect(fieldToColDef({ id: 'fld1', name: 'Title', type: 'singleLineText' })).toMatchObject({
      field: 'Title',
      filter: 'agTextColumnFilter',
      sortable: true,
    });
  });

  it('maps numeric fields to a numeric column type', () => {
    expect(fieldToColDef({ id: 'fld1', name: 'Score', type: 'number' })).toMatchObject({
      filter: 'agNumberColumnFilter',
      type: 'numericColumn',
    });
  });

  it('maps date fields to a date filter with date formatter', () => {
    expect(fieldToColDef({ id: 'fld1', name: 'Due', type: 'date' })).toMatchObject({
      filter: 'agDateColumnFilter',
      valueFormatter: 'date',
    });
  });
});
