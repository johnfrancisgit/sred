import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { GridColumnDef } from '@sred/shared';
import { ChipRenderer } from './cell-renderers/chip.renderer';
import { ChipsRenderer } from './cell-renderers/chips.renderer';

const CELL_RENDERERS = {
  chip: ChipRenderer,
  chips: ChipsRenderer,
  recordLinks: ChipsRenderer,
  agCheckboxCellRenderer: 'agCheckboxCellRenderer',
} as const;

const VALUE_FORMATTERS: Record<string, (p: ValueFormatterParams) => string> = {
  date: (p) => {
    if (!p.value) return '';
    const d = new Date(p.value as string);
    if (Number.isNaN(d.getTime())) return String(p.value);
    return d.toISOString().slice(0, 10);
  },
  joinList: (p) => (Array.isArray(p.value) ? p.value.join(', ') : String(p.value ?? '')),
};

export function toAgColDefs(serverDefs: GridColumnDef[]): ColDef[] {
  return serverDefs.map((def) => {
    const colDef: ColDef = {
      field: def.field,
      headerName: def.headerName,
      sortable: def.sortable,
      resizable: def.resizable,
      filter: def.filter,
      floatingFilter: typeof def.filter === 'string' && def.filter !== 'true',
      type: def.type,
      minWidth: 140,
      flex: 1,
    };
    if (def.cellRenderer) {
      const r = CELL_RENDERERS[def.cellRenderer as keyof typeof CELL_RENDERERS];
      if (r) colDef.cellRenderer = r;
    }
    if (def.valueFormatter && VALUE_FORMATTERS[def.valueFormatter]) {
      colDef.valueFormatter = VALUE_FORMATTERS[def.valueFormatter];
    }
    return colDef;
  });
}
