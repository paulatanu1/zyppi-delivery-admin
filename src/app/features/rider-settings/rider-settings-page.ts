import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { SettingsApi } from '../settings/settings.api';
import { RiderSettingsApi } from './rider-settings.api';
import {
  Campaign,
  DEFAULT_RATE,
  RiderConfig,
  examplePay,
  toPaise,
  toRupees,
} from './rider-settings.models';

type Draft = Omit<Campaign, 'updatedAt'>;

function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Rider settings (ops): how orders are offered, what riders earn, gig
 * slots, safety numbers, and incentive campaigns. Everything the rider
 * app shows comes from here (config/riders, riderOffers).
 */
@Component({
  selector: 'z-rider-settings-page',
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
    RupeesPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rider-settings-page.html',
})
export class RiderSettingsPage {
  private readonly api = inject(RiderSettingsApi);
  private readonly message = inject(NzMessageService);

  readonly config = this.api.watchConfig();
  readonly campaigns = this.api.watchCampaigns();
  readonly areas = inject(SettingsApi).watchServiceAreas();
  readonly rupees = toRupees;
  readonly paise = toPaise;
  readonly example = examplePay;

  /** Edited copy; saved as a whole. */
  readonly cfg = signal<RiderConfig | null>(null);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  /** Which area's pay / slots are being edited ('default' = every area without its own). */
  readonly payArea = signal('default');
  readonly slotArea = signal('default');

  readonly areaOptions = computed(() => [
    { label: 'All areas (default)', value: 'default' },
    ...(this.areas.value() ?? []).map((a) => ({ label: a.name, value: a.id })),
  ]);
  readonly areaNames = computed(
    () => new Map((this.areas.value() ?? []).map((a) => [a.id, a.name])),
  );
  readonly assignOptions = [
    { label: 'As soon as it’s placed', value: 'placed' },
    { label: 'Once it’s packed', value: 'packed' },
  ];

  constructor() {
    effect(() => {
      const c = this.config.value();
      if (c && !this.dirty()) this.cfg.set(structuredClone(c));
    });
  }

  patch(f: (c: RiderConfig) => void): void {
    const c = this.cfg();
    if (!c) return;
    const next = structuredClone(c);
    f(next);
    this.cfg.set(next);
    this.dirty.set(true);
  }

  // ---------------------------------------------------------- pay

  rateFor(area: string) {
    const c = this.cfg();
    return c?.pay[area] ?? c?.pay['default'] ?? DEFAULT_RATE;
  }

  hasOwnRate(area: string): boolean {
    return area === 'default' || !!this.cfg()?.pay[area];
  }

  setOwnRate(area: string, own: boolean): void {
    this.patch((c) => {
      if (own) c.pay[area] = { ...(c.pay['default'] ?? DEFAULT_RATE) };
      else delete c.pay[area];
    });
  }

  setRate(area: string, field: keyof typeof DEFAULT_RATE, rupees: number | null): void {
    this.patch((c) => {
      c.pay[area] ??= { ...(c.pay['default'] ?? DEFAULT_RATE) };
      c.pay[area][field] = toPaise(rupees);
    });
  }

  addPeak(): void {
    this.patch((c) => c.peak.push({ start: '18:00', end: '21:00', extraPaise: 1000 }));
  }

  // ---------------------------------------------------------- slots

  slotsFor(area: string) {
    const c = this.cfg();
    return c?.slotTemplates[area] ?? c?.slotTemplates['default'] ?? [];
  }

  hasOwnSlots(area: string): boolean {
    return area === 'default' || !!this.cfg()?.slotTemplates[area];
  }

  setOwnSlots(area: string, own: boolean): void {
    this.patch((c) => {
      if (own) c.slotTemplates[area] = structuredClone(c.slotTemplates['default'] ?? []);
      else delete c.slotTemplates[area];
    });
  }

  addSlot(area: string): void {
    this.patch((c) => {
      c.slotTemplates[area] ??= [];
      c.slotTemplates[area].push({ start: '09:00', end: '13:00', capacity: 5, bonusPaise: 0 });
    });
  }

  // ---------------------------------------------------------- save

  async save(): Promise<void> {
    const c = this.cfg();
    if (!c) return;
    for (const list of Object.values(c.slotTemplates)) {
      if (list.some((s) => !(s.start < s.end))) {
        this.message.error('Each slot must end after it starts (no slots past midnight).');
        return;
      }
    }
    this.saving.set(true);
    try {
      const saved = await this.api.saveConfig(c);
      this.dirty.set(false);
      this.cfg.set(structuredClone(saved));
      this.message.success('Rider settings saved; the app picks them up straight away');
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  discard(): void {
    this.dirty.set(false);
    const c = this.config.value();
    if (c) this.cfg.set(structuredClone(c));
  }

  // ---------------------------------------------------------- campaigns

  readonly draft = signal<Draft | null>(null);

  newCampaign(): void {
    const today = istToday();
    this.draft.set({
      id: '',
      title: '',
      description: '',
      kind: 'daily_target',
      target: 15,
      rewardPaise: 15000,
      serviceAreaIds: [],
      startDate: today,
      endDate: today,
      active: true,
    });
  }

  editCampaign(c: Campaign): void {
    this.draft.set({
      id: c.id,
      title: c.title,
      description: c.description,
      kind: c.kind,
      target: c.target,
      rewardPaise: c.rewardPaise,
      serviceAreaIds: [...c.serviceAreaIds],
      startDate: c.startDate,
      endDate: c.endDate,
      active: c.active,
    });
  }

  patchDraft(f: (d: Draft) => void): void {
    const d = this.draft();
    if (!d) return;
    const next = structuredClone(d);
    f(next);
    this.draft.set(next);
  }

  async saveCampaign(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    try {
      await this.api.saveCampaign(d);
      this.message.success('Offer saved');
      this.draft.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  campaignState(c: Campaign): { label: string; color: string } {
    const today = istToday();
    if (!c.active) return { label: 'Off', color: 'default' };
    if (c.endDate < today) return { label: 'Ended', color: 'default' };
    if (c.startDate > today) return { label: 'Scheduled', color: 'blue' };
    return { label: 'Live', color: 'green' };
  }
}
