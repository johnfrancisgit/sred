import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

interface RevisionContext {
  onHistory?: (recordId: string) => void;
}

@Component({
  selector: 'app-last-revised-renderer',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './last-revised.renderer.html',
  styleUrl: './last-revised.renderer.scss',
})
export class LastRevisedRenderer implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);
  recordId: string | null = null;
  hasRevisions = false;
  label = '';
  private context: RevisionContext = {};

  agInit(params: ICellRendererParams): void {
    this.refresh(params);
  }

  refresh(params: ICellRendererParams): boolean {
    const data = params.data as
      | { _recordId?: string; _lastRevisedAt?: string | null; _revisionCount?: number }
      | undefined;
    this.recordId = data?._recordId ?? null;
    this.hasRevisions = (data?._revisionCount ?? 0) > 0;
    this.label = data?._lastRevisedAt ? formatRelative(new Date(data._lastRevisedAt)) : 'Never';
    this.context = (params.context as RevisionContext) ?? {};
    this.cdr.markForCheck();
    return true;
  }

  onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.hasRevisions) return;
    if (this.recordId && this.context.onHistory) {
      this.context.onHistory(this.recordId);
    }
  }
}

// Locale aware time phrasing
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelative(date: Date): string {
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  if (abs < 60 * 60) return RTF.format(Math.round(diffSec / 60), 'minute');
  if (abs < 60 * 60 * 24) return RTF.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 60 * 60 * 24 * 7) return RTF.format(Math.round(diffSec / 86400), 'day');
  if (abs < 60 * 60 * 24 * 30) return RTF.format(Math.round(diffSec / (86400 * 7)), 'week');
  if (abs < 60 * 60 * 24 * 365) return RTF.format(Math.round(diffSec / (86400 * 30)), 'month');
  return RTF.format(Math.round(diffSec / (86400 * 365)), 'year');
}
