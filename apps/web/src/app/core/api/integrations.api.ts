import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ListIntegrationsResponse } from '@sred/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class IntegrationsApi {
  private readonly http = inject(HttpClient);

  list(): Promise<ListIntegrationsResponse> {
    return firstValueFrom(
      this.http.get<ListIntegrationsResponse>('/api/integrations', { withCredentials: true }),
    );
  }

  disconnectAirtable(): Promise<void> {
    return firstValueFrom(
      this.http.post<void>('/api/airtable/oauth/disconnect', {}, { withCredentials: true }),
    );
  }
}
