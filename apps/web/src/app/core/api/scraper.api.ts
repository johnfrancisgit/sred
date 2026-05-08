import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ImportSessionRequest,
  StartScraperRunResponse,
  RevisionEventResponse,
} from '@sred/shared';

interface ValidateResp {
  status: 'valid' | 'expired' | 'never_connected';
}

interface ScraperRun {
  _id: string;
  baseId: string;
  status: 'pending' | 'running' | 'paused_awaiting_mfa' | 'completed' | 'failed';
  totalRecords: number;
  completedRecords: number;
  failedRecords: number;
}

@Injectable({ providedIn: 'root' })
export class ScraperApi {
  private readonly http = inject(HttpClient);

  startSession(): Promise<{ sessionId: string }> {
    return firstValueFrom(
      this.http.post<{ sessionId: string }>(
        '/api/scraper/sessions',
        {},
        { withCredentials: true },
      ),
    );
  }

  importManualSession(req: ImportSessionRequest): Promise<void> {
    return firstValueFrom(
      this.http.post<void>('/api/scraper/sessions/manual', req, { withCredentials: true }),
    );
  }

  validateSession(): Promise<ValidateResp> {
    return firstValueFrom(
      this.http.post<ValidateResp>('/api/scraper/sessions/validate', {}, { withCredentials: true }),
    );
  }

  startRun(baseId: string): Promise<StartScraperRunResponse> {
    return firstValueFrom(
      this.http.post<StartScraperRunResponse>('/api/scraper/runs', { baseId }, { withCredentials: true }),
    );
  }

  getRun(runId: string): Promise<ScraperRun> {
    return firstValueFrom(
      this.http.get<ScraperRun>(`/api/scraper/runs/${runId}`, { withCredentials: true }),
    );
  }

  listEvents(recordId: string): Promise<{ events: RevisionEventResponse[] }> {
    return firstValueFrom(
      this.http.get<{ events: RevisionEventResponse[] }>(`/api/scraper/events`, {
        params: { recordId },
        withCredentials: true,
      }),
    );
  }
}
