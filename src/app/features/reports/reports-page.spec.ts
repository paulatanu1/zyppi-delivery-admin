import { TestBed } from '@angular/core/testing';
import { appConfig } from '../../app.config';
import { ReportsPage } from './reports-page';
import { StatsApi } from './stats.api';

// jsdom has no ResizeObserver (NG-ZORRO tabs use it).
const noop = (): undefined => undefined;
globalThis.ResizeObserver ??= class {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
} as unknown as typeof ResizeObserver;

/** The page with the app's real providers (no Firestore: StatsApi is faked). */
describe('ReportsPage', () => {
  it('renders with the app providers (date picker needs a date adapter)', async () => {
    const api: Partial<StatsApi> = {
      days: async () => [],
      areaDays: async () => [],
      refunds: async () => [],
      areaNames: async () => new Map(),
    };
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: StatsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.status()).toBe('ready');
    expect(fixture.nativeElement.querySelector('nz-range-picker')).not.toBeNull();
  });
});
