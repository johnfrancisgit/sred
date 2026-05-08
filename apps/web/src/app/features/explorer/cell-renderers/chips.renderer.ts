import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-chips-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (label of labels; track label) {
    <span class="chip" [style.--bg]="bgFor(label)">{{ label }}</span>
  }`,
  styles: `
    :host {
      display: inline-flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .chip {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg, var(--mat-sys-surface-variant));
      color: var(--mat-sys-on-surface);
      font-size: 0.8rem;
      line-height: 1.4;
    }
  `,
})
export class ChipsRenderer implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);
  labels: string[] = [];

  agInit(params: ICellRendererParams): void {
    this.refresh(params);
  }

  refresh(params: ICellRendererParams): boolean {
    const value = params.value;
    if (Array.isArray(value)) {
      this.labels = value.map((v) => (typeof v === 'string' ? v : v?.name ?? String(v)));
    } else {
      this.labels = [];
    }
    this.cdr.markForCheck();
    return true;
  }

  bgFor(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 88%)`;
  }
}
