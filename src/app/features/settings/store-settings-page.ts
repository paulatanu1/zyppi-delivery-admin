import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { SettingsApi } from './settings.api';
import {
  AppConfigDoc,
  AreaDoc,
  SlotDoc,
  StoreDoc,
  hoursLabel,
  osmEmbedUrl,
  paiseToRupees,
  rupeesToPaise,
} from './store-settings.models';

const NEW_AREA: AreaDoc = {
  id: '',
  name: '',
  centerLat: null,
  centerLng: null,
  radiusMeters: 5000,
  isActive: true,
};
const NEW_SLOT: SlotDoc = {
  id: '',
  label: '',
  etaMinutes: 30,
  isExpress: false,
  isActive: true,
  sortOrder: 0,
};

/**
 * Settings → Store (ops): delivery pricing, service areas, stores and
 * their hours, delivery slots, support contacts and the app announcement.
 */
@Component({
  selector: 'z-store-settings-page',
  imports: [
    FormsModule,
    NzButtonModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './store-settings-page.html',
})
export class StoreSettingsPage {
  private readonly api = inject(SettingsApi);
  private readonly message = inject(NzMessageService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly pricing = this.api.watchPricing();
  readonly areas = this.api.watchAreaDocs();
  readonly stores = this.api.watchStoreDocs();
  readonly slots = this.api.watchSlots();
  readonly appConfig = this.api.watchAppConfig();

  readonly hours = hoursLabel;
  readonly toneOptions = [
    { label: 'Info', value: 'info' },
    { label: 'Warning', value: 'warning' },
    { label: 'Offer', value: 'offer' },
  ];
  readonly busy = signal<string | null>(null);

  readonly areaNames = computed(
    () => new Map((this.areas.value() ?? []).map((a) => [a.id, a.name])),
  );
  readonly areaOptions = computed(() =>
    (this.areas.value() ?? []).map((a) => ({ label: a.name, value: a.id })),
  );

  // Delivery pricing, edited in rupees.
  readonly fee = signal<number | null>(null);
  readonly freeAbove = signal<number | null>(null);
  readonly minOrder = signal<number | null>(null);

  // App config form.
  readonly app = signal<AppConfigDoc | null>(null);

  // Edit dialogs.
  readonly area = signal<AreaDoc | null>(null);
  readonly store = signal<StoreDoc | null>(null);
  readonly slot = signal<SlotDoc | null>(null);

  /** Map preview for the area being edited. */
  readonly areaMap = computed<SafeResourceUrl | null>(() => {
    const a = this.area();
    if (!a || a.centerLat == null || a.centerLng == null || !a.radiusMeters) return null;
    if (Math.abs(a.centerLat) > 90 || Math.abs(a.centerLng) > 180) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      osmEmbedUrl(a.centerLat, a.centerLng, a.radiusMeters),
    );
  });

  constructor() {
    // Fill the forms from Firestore once loaded (and after each save).
    effect(() => {
      const p = this.pricing.value();
      if (!p) return;
      this.fee.set(paiseToRupees(p.feePaise));
      this.freeAbove.set(paiseToRupees(p.freeAbovePaise));
      this.minOrder.set(paiseToRupees(p.minOrderPaise));
    });
    effect(() => {
      const c = this.appConfig.value();
      if (c) this.app.set(structuredClone(c));
    });
  }

  private async run(key: string, f: () => Promise<unknown>, done: string): Promise<boolean> {
    this.busy.set(key);
    try {
      await f();
      this.message.success(done);
      return true;
    } catch (e) {
      this.message.error((e as Error).message);
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  savePricing(): Promise<boolean> {
    return this.run(
      'pricing',
      () =>
        this.api.savePricing({
          feePaise: rupeesToPaise(this.fee()),
          freeAbovePaise: rupeesToPaise(this.freeAbove()),
          minOrderPaise: rupeesToPaise(this.minOrder()),
        }),
      'Delivery pricing saved; checkout uses it now',
    );
  }

  saveApp(): Promise<boolean> {
    const a = this.app();
    return a
      ? this.run('app', () => this.api.saveAppConfig(a), 'App settings saved')
      : Promise.resolve(false);
  }

  patchApp(f: (a: AppConfigDoc) => void): void {
    const a = this.app();
    if (!a) return;
    const next = structuredClone(a);
    f(next);
    this.app.set(next);
  }

  // ---------------------------------------------------------------- dialogs

  editArea(a?: AreaDoc): void {
    this.area.set(structuredClone(a ?? NEW_AREA));
  }

  patchArea(f: (a: AreaDoc) => void): void {
    const a = this.area();
    if (!a) return;
    const next = structuredClone(a);
    f(next);
    this.area.set(next);
  }

  async saveArea(): Promise<void> {
    const a = this.area();
    if (a && (await this.run('area', () => this.api.saveArea(a), 'Service area saved'))) {
      this.area.set(null);
    }
  }

  editStore(s?: StoreDoc): void {
    this.store.set(
      structuredClone(
        s ?? {
          id: '',
          name: '',
          serviceAreaId: this.areas.value()?.[0]?.id ?? '',
          address: '',
          phone: '',
          open: '',
          close: '',
          isActive: true,
        },
      ),
    );
  }

  patchStore(f: (s: StoreDoc) => void): void {
    const s = this.store();
    if (!s) return;
    const next = structuredClone(s);
    f(next);
    this.store.set(next);
  }

  async saveStore(): Promise<void> {
    const s = this.store();
    if (s && (await this.run('store', () => this.api.saveStore(s), 'Store saved'))) {
      this.store.set(null);
    }
  }

  editSlot(s?: SlotDoc): void {
    this.slot.set(structuredClone(s ?? NEW_SLOT));
  }

  patchSlot(f: (s: SlotDoc) => void): void {
    const s = this.slot();
    if (!s) return;
    const next = structuredClone(s);
    f(next);
    this.slot.set(next);
  }

  async saveSlot(): Promise<void> {
    const s = this.slot();
    if (s && (await this.run('slot', () => this.api.saveSlot(s), 'Delivery slot saved'))) {
      this.slot.set(null);
    }
  }
}
