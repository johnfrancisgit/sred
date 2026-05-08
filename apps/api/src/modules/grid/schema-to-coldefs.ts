import type { AirtableField, GridColumnDef } from '@sred/shared';

export function fieldToColDef(field: AirtableField): GridColumnDef {
  const base: GridColumnDef = {
    field: field.name,
    headerName: field.name,
    airtableType: field.type,
    sortable: true,
    resizable: true,
  };

  switch (field.type) {
    case 'number':
    case 'currency':
    case 'percent':
      return { ...base, filter: 'agNumberColumnFilter', type: 'numericColumn' };

    case 'date':
      return { ...base, filter: 'agDateColumnFilter', valueFormatter: 'date' };

    case 'singleSelect':
      return { ...base, filter: 'agTextColumnFilter', cellRenderer: 'chip' };

    case 'multipleSelects':
      return {
        ...base,
        filter: 'agTextColumnFilter',
        cellRenderer: 'chips',
        valueFormatter: 'joinList',
      };

    case 'checkbox':
      return { ...base, filter: true as unknown as string, cellRenderer: 'agCheckboxCellRenderer' };

    case 'multipleRecordLinks':
      return {
        ...base,
        filter: 'agTextColumnFilter',
        cellRenderer: 'recordLinks',
        valueFormatter: 'joinList',
      };

    default:
      return { ...base, filter: 'agTextColumnFilter' };
  }
}

export function fieldsToColDefs(fields: AirtableField[]): GridColumnDef[] {
  return fields.map(fieldToColDef);
}
