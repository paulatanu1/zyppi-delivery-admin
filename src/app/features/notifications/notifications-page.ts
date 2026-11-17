import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { collection, getDocs } from 'firebase/firestore';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { FIRESTORE } from '../../core/firebase/firebase';
import { allReady } from '../../core/firebase/live';
import { formatWhen } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { CatalogApi } from '../catalog/catalog.api';
import { ImagePicker } from '../catalog/image-picker';
import { fromLocalInput, toLocalInput } from '../home/home.models';
import { SettingsApi } from '../settings/settings.api';
import { Audience, NotificationsApi } from './notifications.api';
import {
  BEHAVIOURS,
  Campaign,
  CampaignDraft,
  Copy,
  LANGS,
  Lang,
  LinkType,
  STATUS,
  Segment,
  Template,
  blankDraft,
  describeSegment,
  draftProblems,
  openRate,
  toDraft,
} from './notifications.models';

/** Catalog & growth → Notifications: offer pushes to opted-in customers. */
@Component({
  selector: 'z-notifications-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzSegmentedModule,
    NzSelectModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    PageHeader,
    PageState,
    ImagePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
})
export class NotificationsPage {
  private readonly api = inject(NotificationsApi);
  private readonly catalog = inject(CatalogApi);
  private readonly db = inject(FIRESTORE);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly campaigns = this.api.watchCampaigns();
  readonly templates = this.api.watchTemplates();
  readonly areas = inject(SettingsApi).watchServiceAreas();
  readonly categories = this.catalog.watchCategories();
  readonly products = this.catalog.watchProducts();
  readonly status = allReady(this.campaigns, this.templates, this.areas);

  readonly coupons = signal<{ label: string; value: string }[]>([]);
  readonly draft = signal<CampaignDraft | null>(null);
  /** The campaign being edited (null = new). */
  readonly editingCampaign = signal<Campaign | null>(null);
  readonly lang = signal<Lang>('en');
  readonly audience = signal<Audience | null>(null);
  readonly counting = signal(false);
  readonly sendAt = signal('');
  readonly testPhone = signal('');
  readonly busy = signal<null | 'save' | 'send' | 'schedule' | 'test' | 'template'>(null);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly viewing = signal<Campaign | null>(null);

  readonly langs = LANGS;
  readonly behaviours = BEHAVIOURS.map((b) => ({ label: b.label, value: b.value }));
  readonly statusLabels = STATUS;
  readonly linkOptions: { label: string; value: LinkType }[] = [
    { label: 'Open app', value: 'none' },
    { label: 'Product', value: 'product' },
    { label: 'Category', value: 'category' },
    { label: 'Coupon', value: 'coupon' },
    { label: 'Web link', value: 'url' },
  ];
  readonly width = computed(() => (globalThis.innerWidth < 900 ? '100%' : 860));

  readonly areaOptions = computed(() =>
    (this.areas.value() ?? []).map((a) => ({ label: a.name, value: a.id })),
  );
  readonly categoryOptions = computed(() =>
    (this.categories.value() ?? []).map((c) => ({ label: c.name, value: c.id })),
  );
  readonly productOptions = computed(() =>
    (this.products.value() ?? [])
      .filter((p) => p.isActive)
      .map((p) => ({ label: p.name, value: p.id })),
  );
  readonly templateOptions = computed(() =>
    (this.templates.value() ?? []).map((t) => ({ label: t.name, value: t.id })),
  );
  readonly unit = computed(() => {
    const b = this.draft()?.segment.behaviour;
    return BEHAVIOURS.find((x) => x.value === b)?.unit ?? null;
  });
  readonly problems = computed(() => {
    const d = this.draft();
    return d ? draftProblems(d) : [];
  });
  /** What the preview shows: the chosen language, English where it's blank. */
  readonly previewCopy = computed<Copy>(() => {
    const d = this.draft();
    if (!d) return { title: '', body: '' };
    const c = d.copy[this.lang()];
    const own = c.title.trim() || c.body.trim();
    return own ? c : d.copy.en;
  });

  constructor() {
    // Coupon codes for the link picker (staff can read coupons).
    void getDocs(collection(this.db, 'coupons'))
      .then((s) =>
        this.coupons.set(
          s.docs
            .filter((d) => d.get('isActive') === true)
            .map((d) => ({ label: `${d.id} · ${d.get('description') ?? ''}`, value: d.id })),
        ),
      )
      .catch(() => undefined);
  }

  // ---- history helpers ----

  areaName = (id: string): string =>
    (this.areas.value() ?? []).find((a) => a.id === id)?.name ?? 'Removed area';

  segmentText(s: Segment): string {
    return describeSegment(s, this.areaName);
  }

  rate(c: Campaign): string {
    const r = openRate(c);
    return r == null ? '—' : `${r}%`;
  }

  when(c: Campaign): string {
    if (c.status === 'scheduled') return `Sends ${formatWhen(c.sendAt)}`;
    if (c.sentAt) return `Sent ${formatWhen(c.sentAt)}`;
    return `Created ${formatWhen(c.createdAt)}`;
  }

  hasCopy(l: Lang): boolean {
    const c = this.draft()?.copy[l];
    return !!c && (c.title.trim() !== '' || c.body.trim() !== '');
  }

  // ---- composer ----

  openNew(from?: Template): void {
    this.reset();
    this.editingCampaign.set(null);
    this.draft.set(from ? toDraft(from) : blankDraft());
  }

  open(c: Campaign): void {
    if (c.status !== 'draft' && c.status !== 'scheduled') {
      this.viewing.set(c);
      return;
    }
    this.reset();
    this.editingCampaign.set(c);
    this.draft.set(toDraft(c));
    this.sendAt.set(toLocalInput(c.sendAt));
  }

  duplicate(c: Campaign): void {
    this.viewing.set(null);
    this.reset();
    this.editingCampaign.set(null);
    this.draft.set({ ...toDraft(c), id: null, name: `${c.name} (copy)` });
  }

  private reset(): void {
    this.error.set(null);
    this.submitted.set(false);
    this.audience.set(null);
    this.lang.set('en');
    this.sendAt.set('');
  }

  close(): void {
    this.draft.set(null);
  }

  patch(p: Partial<CampaignDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  patchCopy(field: keyof Copy, value: string): void {
    const l = this.lang();
    this.draft.update((d) =>
      d ? { ...d, copy: { ...d.copy, [l]: { ...d.copy[l], [field]: value } } } : d,
    );
  }

  patchSegment(p: Partial<Segment>): void {
    this.audience.set(null);
    this.draft.update((d) => (d ? { ...d, segment: { ...d.segment, ...p } } : d));
  }

  setLinkType(linkType: LinkType): void {
    this.patch({ linkType, linkTarget: null });
  }

  useTemplate(id: string | null): void {
    const t = (this.templates.value() ?? []).find((x) => x.id === id);
    if (!t) return;
    this.draft.update((d) => (d ? { ...d, copy: toDraft(t).copy, name: d.name || t.name } : d));
  }

  async countAudience(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.counting.set(true);
    this.error.set(null);
    try {
      this.audience.set(await this.api.estimate(d.segment));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.counting.set(false);
    }
  }

  langCount(code: Lang): number {
    return this.audience()?.byLang[code] ?? 0;
  }

  private valid(): boolean {
    this.submitted.set(true);
    return this.problems().length === 0;
  }

  /** Saves the draft and returns its id. */
  private async persist(): Promise<string> {
    const d = this.draft()!;
    const { id } = await this.api.save(d);
    this.patch({ id });
    return id;
  }

  async saveDraft(): Promise<void> {
    if (!this.valid()) return;
    await this.run('save', async () => {
      await this.persist();
      this.toast.success('Saved');
      this.close();
    });
  }

  async sendNow(): Promise<void> {
    if (!this.valid()) return;
    const d = this.draft()!;
    const audience = this.audience() ?? (await this.api.estimate(d.segment).catch(() => null));
    const n = audience?.count ?? 0;
    if (n === 0) {
      this.error.set(
        'Nobody matches this audience yet. Widen it, or check that customers allow offers.',
      );
      return;
    }
    const ok = await this.confirm.ask({
      title: `Send to ${n} customer${n === 1 ? '' : 's'} now?`,
      content: 'Pushes can’t be recalled once sent.',
      okText: 'Send now',
    });
    if (!ok) return;
    await this.run('send', async () => {
      const id = await this.persist();
      const res = await this.api.schedule(id, null);
      // Big audiences go out in batches (Cloud Tasks); the list shows progress.
      this.toast.success(
        res.status === 'sending'
          ? `Sending to ${res.targeted ?? 0} customers in batches…`
          : `Sent to ${res.sent ?? 0} device${res.sent === 1 ? '' : 's'}`,
      );
      this.close();
    });
  }

  async schedule(): Promise<void> {
    if (!this.valid()) return;
    const at = fromLocalInput(this.sendAt());
    if (!at) {
      this.error.set('Pick the date and time to send.');
      return;
    }
    await this.run('schedule', async () => {
      const id = await this.persist();
      await this.api.schedule(id, at.getTime());
      this.toast.success(`Scheduled for ${formatWhen(at)}`);
      this.close();
    });
  }

  async cancelScheduled(c: Campaign): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Cancel “${c.name}”?`,
      content: 'It won’t be sent. You can duplicate it later.',
      okText: 'Cancel campaign',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.cancel(c.id);
      this.toast.success('Cancelled');
      this.close();
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }

  async sendTest(): Promise<void> {
    if (!this.valid()) return;
    await this.run('test', async () => {
      const res = await this.api.test(this.draft()!, this.testPhone());
      this.toast.success(
        `Test sent (in ${LANGS.find((l) => l.value === res.lang)?.label ?? 'English'})`,
      );
    });
  }

  async saveAsTemplate(): Promise<void> {
    if (!this.valid()) return;
    await this.run('template', async () => {
      await this.api.saveTemplate(this.draft()!);
      this.toast.success('Saved to templates');
    });
  }

  async deleteTemplate(t: Template): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete template “${t.name}”?`,
      content: 'Campaigns already sent keep their text.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteTemplate(t.id);
      this.toast.success('Template deleted');
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }

  private async run(
    kind: NonNullable<ReturnType<typeof this.busy>>,
    fn: () => Promise<void>,
  ): Promise<void> {
    this.busy.set(kind);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(null);
    }
  }

  local(d: Date | null): string {
    return toLocalInput(d);
  }

  retry(): void {
    this.campaigns.retry();
    this.templates.retry();
    this.areas.retry();
  }
}
