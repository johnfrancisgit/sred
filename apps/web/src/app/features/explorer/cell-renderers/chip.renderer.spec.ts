import { TestBed } from '@angular/core/testing';
import type { ICellRendererParams } from 'ag-grid-community';
import { ChipRenderer } from './chip.renderer';

function makeParams(value: unknown): ICellRendererParams {
  return { value } as ICellRendererParams;
}

describe('ChipRenderer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChipRenderer] });
  });

  function createInstance(): ChipRenderer {
    const fixture = TestBed.createComponent(ChipRenderer);
    return fixture.componentInstance;
  }

  it('renders a string value as the chip label', () => {
    const renderer = createInstance();
    renderer.agInit(makeParams('In Progress'));
    expect(renderer.label).toBe('In Progress');
    expect(renderer.background).toContain('hsl(');
  });

  it('renders nothing when the value is null', () => {
    const renderer = createInstance();
    renderer.agInit(makeParams(null));
    expect(renderer.label).toBeNull();
    expect(renderer.background).toBe('');
  });

  it('renders nothing when the value is undefined', () => {
    const renderer = createInstance();
    renderer.agInit(makeParams(undefined));
    expect(renderer.label).toBeNull();
  });

  it('renders nothing for an object without a `name` field', () => {
    const renderer = createInstance();
    renderer.agInit(makeParams({ id: 'sel123' }));
    expect(renderer.label).toBeNull();
  });

  it('produces a deterministic background color for the same label', () => {
    const a = createInstance();
    const b = createInstance();
    a.agInit(makeParams('To Do'));
    b.agInit(makeParams('To Do'));
    expect(a.background).toBe(b.background);
  });
});
