import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { GridDataResponse, ListEntitiesResponse } from '@sred/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GridApi {
  private readonly http = inject(HttpClient);

  listEntities(): Promise<ListEntitiesResponse> {
    return firstValueFrom(
      this.http.get<ListEntitiesResponse>('/api/entities', { withCredentials: true }),
    );
  }

  loadRecords(baseId: string, tableId: string): Promise<GridDataResponse> {
    return firstValueFrom(
      this.http.get<GridDataResponse>(`/api/grid/${baseId}/${tableId}/records`, {
        withCredentials: true,
      }),
    );
  }

  syncBases(): Promise<{ count: number; baseIds: string[] }> {
    return firstValueFrom(
      this.http.post<{ count: number; baseIds: string[] }>(
        '/api/airtable/sync/bases',
        {},
        { withCredentials: true },
      ),
    );
  }

  syncBase(baseId: string): Promise<{ tables: number; records: number }> {
    return firstValueFrom(
      this.http.post<{ tables: number; records: number }>(
        `/api/airtable/sync/bases/${baseId}`,
        {},
        { withCredentials: true },
      ),
    );
  }
}
