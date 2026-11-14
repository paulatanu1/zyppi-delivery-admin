import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { allReady } from '../../core/firebase/live';
import { formatWhen } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { CatalogApi } from '../catalog/catalog.api';
import { ImagePicker } from '../catalog/image-picker';
import { SettingsApi } from '../settings/settings.api';
import { HomeApi } from './home.api';
import {
  BANNER_TYPE,
  Banner,
  BannerState,
  HomeSection,
  LinkType,
  SECTION_LABELS,
  STATE_LABELS,
  bannerProblems,
  bannerState,
  fromLocalInput,
  toLocalInput,
} from './home.models';

const MAX_BANNERS = 10;

const blankBanner = (): Banner => ({
  id: '',
  title: '',
  ctaText: 'Shop now',
  linkType: 'category',
  linkTarget: null,
  imageUrl: null,
  startAt: null,
  endAt: null,
  serviceAreaIds: [],
  isActive: true,
});

interface SectionDraft {
  id: string;
  title: string;
  isActive: boolean;
  type: string;
}

/** Catalog & growth → Banners & home: the app's Home screen, top to bottom. */
@Component({
  selector: 'z-home-page',
  imports: [
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSwitchModule,
    NzTagModule,
    PageHeader,
    PageState,
    ImagePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly api = inject(HomeApi);
  private readonly catalog = inject(CatalogApi);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly sections = this.api.watchSections();
  readonly clicks = this.api.watchClicks();
  readonly categories = this.catalog.watchCategories();
  readonly products = this.catalog.watchProducts();
  readonly areas = inject(SettingsApi).watchServiceAreas();
  readonly status = allReady(this.sections, this.categories, this.products, this.areas);

  /** Re-evaluated every 30 s so Live / Scheduled / Ended stay current. */
  readonly now = signal(new Date());

  readonly selectedId = signal<string | null>(null);
  private readonly pendingOrder = signal<string[] | null>(null);
  /** Banners while a save is in flight, so the list doesn't jump back. */
  private readonly pendingBanners = signal<{ id: string; banners: Banner[] } | null>(null);

  readonly editing = signal<{ index: number; banner: Banner } | null>(null);
  readonly sectionDraft = signal<SectionDraft | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly labels = SECTION_LABELS;
  readonly states = STATE_LABELS;
  readonly maxBanners = MAX_BANNERS;
  readonly linkOptions: { label: string; value: LinkType }[] = [
    { label: 'Category', value: 'category' },
    { label: 'Product', value: 'product' },
    { label: 'Web link', value: 'url' },
    { label: 'Nothing', value: 'none' },
  ];

  readonly ordered = computed(() => {
    const list = this.sections.value() ?? [];
    const pending = this.pendingOrder();
    if (!pending) return list;
    const byId = new Map(list.map((s) => [s.id, s]));
    return pending.map((id) => byId.get(id)).filter((s): s is HomeSection => !!s);
  });

  readonly selected = computed(() => {
    const carousels = this.ordered().filter((s) => s.type === BANNER_TYPE);
    const id = this.selectedId() ?? carousels[0]?.id ?? null;
    return carousels.find((s) => s.id === id) ?? null;
  });

  readonly banners = computed(() => {
    const s = this.selected();
    if (!s) return [];
    const pending = this.pendingBanners();
    return pending?.id === s.id ? pending.banners : s.banners;
  });

  readonly categoryOptions = computed(() => {
    const cats = this.categories.value() ?? [];
    const name = new Map(cats.map((c) => [c.id, c.name]));
    return cats.map((c) => ({
      label: c.parentId ? `${name.get(c.parentId) ?? '…'} › ${c.name}` : c.name,
      value: c.id,
    }));
  });
  readonly productOptions = computed(() =>
    (this.products.value() ?? []).map((p) => ({
      label: p.isActive ? p.name : `${p.name} (hidden)`,
      value: p.id,
    })),
  );
  readonly areaOptions = computed(() =>
    (this.areas.value() ?? []).map((a) => ({
      label: a.isActive ? a.name : `${a.name} (off)`,
      value: a.id,
    })),
  );

  readonly problems = computed(() => {
    const e = this.editing();
    return e ? bannerProblems(e.banner) : [];
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  // ---- read helpers for the template ----

  stateOf(b: Banner): BannerState {
    return bannerState(b, this.now());
  }

  liveCount(s: HomeSection): number {
    return s.banners.filter((b) => this.stateOf(b) === 'live').length;
  }

  clicksOf(b: Banner): number {
    const s = this.selected();
    return s ? (this.clicks.value()?.get(`${s.id}__${b.id}`) ?? 0) : 0;
  }

  schedule(b: Banner): string {
    if (!b.startAt && !b.endAt) return 'Always';
    if (b.startAt && b.endAt) return `${formatWhen(b.startAt)} → ${formatWhen(b.endAt)}`;
    return b.startAt ? `From ${formatWhen(b.startAt)}` : `Until ${formatWhen(b.endAt)}`;
  }

  areaNames(b: Banner): string {
    if (!b.serviceAreaIds.length) return 'All areas';
    const names = new Map((this.areas.value() ?? []).map((a) => [a.id, a.name]));
    return b.serviceAreaIds.map((id) => names.get(id) ?? 'Removed area').join(', ');
  }

  linkLabel(b: Banner): string {
    switch (b.linkType) {
      case 'none':
        return 'Opens nothing';
      case 'url':
        return b.linkTarget ?? '';
      case 'category':
        return (
          this.categoryOptions().find((o) => o.value === b.linkTarget)?.label ?? 'Missing category'
        );
      case 'product':
        return (
          this.productOptions().find((o) => o.value === b.linkTarget)?.label ?? 'Missing product'
        );
    }
  }

  local(d: Date | null): string {
    return toLocalInput(d);
  }

  // ---- sections ----

  async dropSection(e: CdkDragDrop<HomeSection[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const ids = this.ordered().map((s) => s.id);
    moveItemInArray(ids, e.previousIndex, e.currentIndex);
    this.pendingOrder.set(ids);
    try {
      await this.api.reorder(ids);
      this.toast.success('Home order saved');
    } catch (err) {
      this.toast.error(`Order not saved: ${(err as Error).message}`);
    } finally {
      this.pendingOrder.set(null);
    }
  }

  async toggleSection(s: HomeSection, isActive: boolean): Promise<void> {
    try {
      await this.api.saveSection({ id: s.id, isActive });
      this.toast.success(isActive ? 'Shown in the app' : 'Hidden from the app');
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  async newCarousel(): Promise<void> {
    try {
      const { id } = await this.api.saveSection({ title: null, isActive: false, banners: [] });
      this.selectedId.set(id);
      this.toast.success('Carousel added at the bottom (hidden). Add banners, then show it.');
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  openSection(s: HomeSection): void {
    this.error.set(null);
    this.sectionDraft.set({ id: s.id, title: s.title ?? '', isActive: s.isActive, type: s.type });
  }

  patchSection(p: Partial<SectionDraft>): void {
    this.sectionDraft.update((d) => (d ? { ...d, ...p } : d));
  }

  async saveSectionDraft(): Promise<void> {
    const d = this.sectionDraft();
    if (!d) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.saveSection({ id: d.id, title: d.title.trim() || null, isActive: d.isActive });
      this.toast.success('Section saved');
      this.sectionDraft.set(null);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSection(): Promise<void> {
    const d = this.sectionDraft();
    if (!d) return;
    const ok = await this.confirm.ask({
      title: 'Delete this carousel?',
      content: 'Its banners and their click counts go too. This can’t be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.api.deleteSection(d.id);
      this.toast.success('Carousel deleted');
      if (this.selectedId() === d.id) this.selectedId.set(null);
      this.sectionDraft.set(null);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  // ---- banners ----

  /** Saves the whole list (the callable replaces it, in this order). */
  private async saveBanners(banners: Banner[], done: string): Promise<boolean> {
    const s = this.selected();
    if (!s) return false;
    this.pendingBanners.set({ id: s.id, banners });
    try {
      await this.api.saveSection({ id: s.id, banners });
      this.toast.success(done);
      return true;
    } catch (err) {
      this.toast.error((err as Error).message);
      return false;
    } finally {
      this.pendingBanners.set(null);
    }
  }

  dropBanner(e: CdkDragDrop<Banner[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    const list = [...this.banners()];
    moveItemInArray(list, e.previousIndex, e.currentIndex);
    void this.saveBanners(list, 'Banner order saved');
  }

  toggleBanner(i: number, isActive: boolean): void {
    const list = this.banners().map((b, j) => (j === i ? { ...b, isActive } : b));
    void this.saveBanners(list, isActive ? 'Banner on' : 'Banner off');
  }

  openBanner(index: number): void {
    this.error.set(null);
    this.submitted.set(false);
    const b = index < 0 ? blankBanner() : this.banners()[index];
    this.editing.set({ index, banner: { ...b, serviceAreaIds: [...b.serviceAreaIds] } });
  }

  patch(p: Partial<Banner>): void {
    this.editing.update((e) => (e ? { ...e, banner: { ...e.banner, ...p } } : e));
  }

  setLinkType(linkType: LinkType): void {
    this.patch({ linkType, linkTarget: null });
  }

  setDate(field: 'startAt' | 'endAt', value: string): void {
    this.patch({ [field]: fromLocalInput(value) });
  }

  async saveBanner(): Promise<void> {
    const e = this.editing();
    if (!e) return;
    this.submitted.set(true);
    if (this.problems().length) return;
    const list = [...this.banners()];
    if (e.index < 0) list.push(e.banner);
    else list[e.index] = e.banner;
    this.saving.set(true);
    const ok = await this.saveBanners(list, e.index < 0 ? 'Banner added' : 'Banner saved');
    this.saving.set(false);
    if (ok) this.editing.set(null);
  }

  async deleteBanner(): Promise<void> {
    const e = this.editing();
    if (!e || e.index < 0) return;
    const ok = await this.confirm.ask({
      title: `Delete “${e.banner.title}”?`,
      content: 'To keep it for later, turn it off or give it an end date instead.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    const done = await this.saveBanners(
      this.banners().filter((_, j) => j !== e.index),
      'Banner deleted',
    );
    this.saving.set(false);
    if (done) this.editing.set(null);
  }

  retry(): void {
    this.sections.retry();
    this.clicks.retry();
    this.categories.retry();
    this.products.retry();
    this.areas.retry();
  }
}
