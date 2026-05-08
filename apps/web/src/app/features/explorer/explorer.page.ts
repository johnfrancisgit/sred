import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule, type MatDrawer } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import type { Entity, GridColumnDef, ScrapeProgressPayload } from '@sred/shared';
import { GridApi } from '../../core/api/grid.api';
import { IntegrationsApi } from '../../core/api/integrations.api';
import { ScraperApi } from '../../core/api/scraper.api';
import { SocketService } from '../../core/realtime/socket.service';
import { DataGridComponent } from './data-grid.component';
import { RevisionTimelineComponent } from '../revisions/revision-timeline.component';
import { MfaDialogComponent } from '../connect/mfa-dialog.component';

@Component({
  selector: 'app-explorer-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSidenavModule,
    DataGridComponent,
    RevisionTimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './explorer.page.html',
  styleUrl: './explorer.page.scss',
})
export class ExplorerPage implements OnInit {
  private readonly api = inject(GridApi);
  private readonly integrationsApi = inject(IntegrationsApi);
  private readonly scraperApi = inject(ScraperApi);
  private readonly socket = inject(SocketService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private reauthDialogOpen = false;

  readonly drawer = viewChild<MatDrawer>('drawer');

  readonly integrationId = signal<'airtable'>('airtable');
  readonly entities = signal<Entity[]>([]);
  readonly selectedEntity = signal<{ baseId: string; tableId: string } | null>(null);
  readonly entityKey = computed(() => {
    const e = this.selectedEntity();
    return e ? `${e.baseId}:${e.tableId}` : null;
  });

  readonly rows = signal<unknown[]>([]);
  readonly columns = signal<GridColumnDef[]>([]);
  readonly loading = signal(true);
  readonly syncing = signal(false);
  readonly scraping = signal(false);
  readonly scrapeProgress = signal<ScrapeProgressPayload | null>(null);
  readonly selectedRecordId = signal<string | null>(null);
  readonly drawerOpen = signal(false);

  searchText = '';

  constructor() {
    effect(async () => {
      const e = this.selectedEntity();
      if (!e) {
        this.rows.set([]);
        this.columns.set([]);
        return;
      }
      const data = await this.api.loadRecords(e.baseId, e.tableId);
      this.rows.set(data.rows);
      this.columns.set(data.columns);
    });
  }

  async ngOnInit(): Promise<void> {
    this.socket.connect();
    this.socket
      .scrapeProgress()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => {
        this.scrapeProgress.set(p);
        if (p.completed >= p.total && p.total > 0) {
          this.scraping.set(false);
          this.snack.open(
            `Scrape complete: ${p.completed} records${p.failed ? `, ${p.failed} failed` : ''}.`,
            'Dismiss',
            { duration: 4000 },
          );
        }
      });

    this.socket
      .mfaRequired()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.reauthDialogOpen || !this.scraping()) return;
        this.reauthDialogOpen = true;
        this.snack.open('Re-authentication needed. Sign in the browser popup.', 'Dismiss', {
          duration: 5000,
        });
        const ref = this.dialog.open(MfaDialogComponent, {
          width: '460px',
          disableClose: true,
          data: { mode: 'manual', passive: true },
        });
        void ref
          .afterClosed()
          .toPromise()
          .then(() => {
            this.reauthDialogOpen = false;
          });
      });

    this.socket
      .mfaSuccess()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.scraping()) {
          this.snack.open('Re-authenticated. Resuming scrape…', 'Dismiss', { duration: 3000 });
        }
      });

    await this.loadEntities(true);
    this.loading.set(false);
  }

  onEntityChange(value: string | null): void {
    if (!value) {
      this.selectedEntity.set(null);
      return;
    }
    const [baseId, tableId] = value.split(':');
    if (baseId && tableId) this.selectedEntity.set({ baseId, tableId });
    this.closeDrawer();
  }

  onHistoryClicked(recordId: string): void {
    this.selectedRecordId.set(recordId);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.selectedRecordId.set(null);
  }

  async syncBases(): Promise<void> {
    this.syncing.set(true);
    try {
      const { integrations } = await this.integrationsApi.list();
      if (integrations[0]?.status !== 'connected') {
        this.snack
          .open('Authorize Airtable first.', 'Connect', { duration: 4000 })
          .onAction()
          .subscribe(() => this.router.navigate(['/connect']));
        return;
      }
      const { count, baseIds } = await this.api.syncBases();
      this.snack.open(`Synced ${count} base${count === 1 ? '' : 's'}; pulling tables…`, 'Dismiss', {
        duration: 2500,
      });
      for (const baseId of baseIds) await this.api.syncBase(baseId);
      await this.loadEntities();
      this.snack.open('Sync complete.', 'Dismiss', { duration: 2500 });
    } finally {
      this.syncing.set(false);
    }
  }

  async startScrape(): Promise<void> {
    const e = this.selectedEntity();
    if (!e) return;
    this.scraping.set(true);
    this.scrapeProgress.set(null);
    try {
      const validity = await this.scraperApi.validateSession();
      if (validity.status !== 'valid') {
        this.scraping.set(false);
        this.snack
          .open('Connect the scraper first (Airtable browser session).', 'Connect', {
            duration: 5000,
          })
          .onAction()
          .subscribe(() => this.router.navigate(['/connect']));
        return;
      }
      await this.scraperApi.startRun(e.baseId);
      this.snack.open('Scrape started.', 'Dismiss', { duration: 2000 });
    } catch {
      this.scraping.set(false);
    }
  }

  progressPct(p: ScrapeProgressPayload): number {
    return p.total === 0 ? 0 : Math.round((p.completed / p.total) * 100);
  }

  private async loadEntities(preserveSelection = false): Promise<void> {
    const { entities } = await this.api.listEntities();
    this.entities.set(entities);
    if (!preserveSelection || !this.selectedEntity()) {
      const first = entities[0];
      this.selectedEntity.set(first ? { baseId: first.baseId, tableId: first.tableId } : null);
    }
  }
}
