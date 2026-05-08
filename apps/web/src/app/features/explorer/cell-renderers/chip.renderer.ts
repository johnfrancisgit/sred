import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-chip-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (label) {
    <span class="chip" [style.--bg]="background">{{ label }}</span>
  }`,
  styles: `
    .chip {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--bg, var(--mat-sys-surface-variant));
      color: var(--mat-sys-on-surface);
      font-size: 0.85rem;
      font-weight: 500;
      line-height: 1.5;
    }
  `,
})
export class ChipRenderer implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);
  label: string | null = null;
  background = '';

  agInit(params: ICellRendererParams): void {
    this.refresh(params);
  }

  refresh(params: ICellRendererParams): boolean {
    const value = params.value;
    this.label = typeof value === 'string' ? value : (value?.name ?? null);
    this.background = this.label ? hashToHsl(this.label, 0.85) : '';
    this.cdr.markForCheck();
    return true;
  }
}

function hashToHsl(text: string, lightness: number): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% ${lightness * 100}%)`;
}
