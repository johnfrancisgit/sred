import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Inject,
  Optional,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ScraperApi } from '../../core/api/scraper.api';
import { SocketService } from '../../core/realtime/socket.service';

export interface MfaDialogData {
  passive?: boolean;
}

@Component({
  selector: 'app-mfa-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mfa-dialog.component.html',
  styleUrl: './mfa-dialog.component.scss',
})
export class MfaDialogComponent {
  private readonly scraperApi = inject(ScraperApi);
  private readonly socket = inject(SocketService);
  private readonly dialogRef = inject(MatDialogRef<MfaDialogComponent>);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<'awaiting-prompt' | 'awaiting-code' | 'success' | 'failed'>(
    'awaiting-prompt',
  );
  readonly errorMessage = signal<string | null>(null);
  readonly passive: boolean;

  constructor(@Optional() @Inject(MAT_DIALOG_DATA) data: MfaDialogData | null) {
    this.passive = data?.passive ?? false;

    this.socket.connect();
    this.socket
      .mfaRequired()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.state.set('awaiting-code');
        this.errorMessage.set(null);
      });
    this.socket
      .mfaSuccess()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.state.set('success');
      });
    this.socket
      .mfaFailed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ reason }) => {
        this.state.set('failed');
        this.errorMessage.set(reason);
      });

    if (!this.passive) {
      void this.scraperApi.startSession();
    } else {
      this.state.set('awaiting-code');
    }
  }

  cancel(): void {
    this.dialogRef.close({ cancelled: true });
  }

  close(): void {
    this.dialogRef.close({ cancelled: false });
  }
}
