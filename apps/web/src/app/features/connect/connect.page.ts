import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Integration } from '@sred/shared';
import { IntegrationsApi } from '../../core/api/integrations.api';
import { GridApi } from '../../core/api/grid.api';
import { ScraperApi } from '../../core/api/scraper.api';
import { MfaDialogComponent } from './mfa-dialog.component';

interface SyncedBase {
  id: string;
  name: string;
}

type AirtableStatus = Integration['status'];
type ScraperStatus = 'valid' | 'expired' | 'never_connected';

@Component({
  selector: 'app-connect-page',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connect.page.html',
  styleUrl: './connect.page.scss',
})
export class ConnectPage implements OnInit {
  private readonly api = inject(IntegrationsApi);
  private readonly gridApi = inject(GridApi);
  private readonly scraperApi = inject(ScraperApi);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly airtableStatus = signal<AirtableStatus>('disconnected');
  readonly scraperStatus = signal<ScraperStatus>('never_connected');
  readonly syncedBases = signal<SyncedBase[]>([]);

  pastedCookieHeader = '';
  pastedAppId = '';

  async ngOnInit(): Promise<void> {
    await this.refreshStatus();
    await this.loadSyncedBases();

    const status = this.route.snapshot.queryParamMap.get('airtable');
    if (status === 'connected') {
      this.snack.open('Airtable connected.', 'Dismiss', { duration: 3000 });
    } else if (status === 'error') {
      const reason = this.route.snapshot.queryParamMap.get('reason') ?? 'Unknown error';
      this.snack.open(`Authorization failed: ${reason}`, 'Dismiss', { duration: 5000 });
    }
  }

  async disconnectAirtable(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.disconnectAirtable();
      await this.refreshStatus();
      this.snack.open('Airtable disconnected.', 'Dismiss', { duration: 2500 });
    } finally {
      this.busy.set(false);
    }
  }

  async connectViaBrowser(): Promise<void> {
    this.busy.set(true);
    try {
      const ref = this.dialog.open(MfaDialogComponent, {
        width: '460px',
        disableClose: true,
      });
      const result = await ref.afterClosed().toPromise();
      if (result?.cancelled !== true) {
        await this.refreshStatus();
      }
    } finally {
      this.busy.set(false);
    }
  }

  async importPastedSession(): Promise<void> {
    this.busy.set(true);
    try {
      await this.scraperApi.importManualSession({
        cookieHeader: this.pastedCookieHeader.trim(),
        appId: this.pastedAppId.trim(),
      });
      this.pastedCookieHeader = '';
      this.snack.open('Session imported. Try the scraper now.', 'Dismiss', { duration: 3000 });
      await this.refreshStatus();
    } catch {
      //
    } finally {
      this.busy.set(false);
    }
  }

  scraperIcon(): string {
    return this.scraperStatus() === 'valid'
      ? 'check_circle'
      : this.scraperStatus() === 'expired'
        ? 'error_outline'
        : 'radio_button_unchecked';
  }

  scraperLabel(): string {
    return this.scraperStatus() === 'valid'
      ? 'Connected'
      : this.scraperStatus() === 'expired'
        ? 'Expired — re-authenticate'
        : 'Not connected';
  }

  private async loadSyncedBases(): Promise<void> {
    const { entities } = await this.gridApi.listEntities();
    const seen = new Set<string>();
    const bases: SyncedBase[] = [];
    for (const e of entities) {
      if (!seen.has(e.baseId)) {
        seen.add(e.baseId);
        bases.push({ id: e.baseId, name: e.baseName });
      }
    }
    this.syncedBases.set(bases);
    if (!this.pastedAppId && bases[0]) {
      this.pastedAppId = bases[0].id;
    }
  }

  private async refreshStatus(): Promise<void> {
    try {
      const { integrations } = await this.api.list();
      const airtable = integrations.find((i) => i.id === 'airtable');
      this.airtableStatus.set(airtable?.status ?? 'disconnected');
      if (airtable?.status === 'connected') {
        try {
          const probe = await this.scraperApi.validateSession();
          this.scraperStatus.set(probe.status as ScraperStatus);
        } catch {
          this.scraperStatus.set('never_connected');
        }
      }
    } finally {
      this.loading.set(false);
    }
  }
}
