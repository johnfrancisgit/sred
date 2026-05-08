import {
  ChangeDetectionStrategy,
  Component,
  type OnChanges,
  type SimpleChanges,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { RevisionEventResponse } from '@sred/shared';
import { ScraperApi } from '../../core/api/scraper.api';

type DisplayKind = 'assignee' | 'status';

@Component({
  selector: 'app-revision-timeline',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revision-timeline.component.html',
  styleUrl: './revision-timeline.component.scss',
})
export class RevisionTimelineComponent implements OnChanges {
  recordId = input<string | null>(null);
  private readonly api = inject(ScraperApi);

  readonly events = signal<RevisionEventResponse[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnChanges(_changes: SimpleChanges): void {
    const id = this.recordId();
    if (!id) {
      this.events.set([]);
      this.error.set(null);
      return;
    }
    void this.load(id);
  }

  kind(event: RevisionEventResponse): DisplayKind {
    return /^(assignees?|assigned to|owners?)$/i.test(event.columnType) ? 'assignee' : 'status';
  }

  typeLabel(event: RevisionEventResponse): string {
    return this.kind(event) === 'assignee' ? 'Assignee' : 'Status';
  }

  retry(): void {
    const id = this.recordId();
    if (id) void this.load(id);
  }

  private async load(recordId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { events } = await this.api.listEvents(recordId);
      this.events.set(events);
    } catch {
      this.events.set([]);
      this.error.set('Could not load revision history. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
