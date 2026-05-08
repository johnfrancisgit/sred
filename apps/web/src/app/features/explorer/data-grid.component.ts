import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  type ColDef,
  type GetRowIdParams,
  type GridReadyEvent,
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
} from 'ag-grid-community';
import type { GridColumnDef } from '@sred/shared';
import { toAgColDefs } from './grid-config';
import { LastRevisedRenderer } from './cell-renderers/last-revised.renderer';

ModuleRegistry.registerModules([AllCommunityModule]);

const QUARTZ_THEME = themeQuartz.withParams({
  spacing: 6,
  headerHeight: 44,
  rowHeight: 40,
});

@Component({
  selector: 'app-data-grid',
  standalone: true,
  imports: [AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-grid.component.html',
  styles: `
    :host {
      display: block;
      height: calc(100vh - 200px);
      min-height: 480px;
    }
    ag-grid-angular {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class DataGridComponent {
  rows = input<unknown[]>([]);
  columns = input<GridColumnDef[]>([]);
  search = input<string>('');

  readonly historyClicked = output<string>();
  readonly theme = QUARTZ_THEME;

  readonly gridContext = {
    onHistory: (recordId: string) => this.historyClicked.emit(recordId),
  };

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
    floatingFilter: true,
  };

  readonly getRowId = (params: GetRowIdParams): string => {
    const data = params.data as { _recordId?: string; id?: string } | undefined;
    return data?._recordId ?? data?.id ?? `row-${params.level}-${JSON.stringify(data)}`;
  };

  readonly columnDefs = computed<ColDef[]>(() => {
    const fromSchema = toAgColDefs(this.columns());
    const lastRevisedCol: ColDef = {
      headerName: 'Last revised',
      colId: 'lastRevised',
      field: '_lastRevisedAt',
      cellRenderer: LastRevisedRenderer,
      width: 160,
      minWidth: 130,
      maxWidth: 200,
      pinned: 'left',
      resizable: true,
      sortable: true,
      filter: false,
      suppressMovable: true,
      comparator: (a, b) => {
        const at = a ? Date.parse(a as string) : 0;
        const bt = b ? Date.parse(b as string) : 0;
        return at - bt;
      },
    };
    return [lastRevisedCol, ...fromSchema];
  });

  onGridReady(e: GridReadyEvent): void {
    e.api.sizeColumnsToFit();
  }
}
