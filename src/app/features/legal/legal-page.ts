import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { LoadStatus } from '../../core/firebase/live';
import { legalMarkdownToHtml } from '../../shared/legal/legal-markdown';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { LegalApi, LegalVersionRow } from './legal.api';
import {
  LEGAL_LANGS,
  LEGAL_META,
  LegalDraft,
  LegalHead,
  LegalLang,
  LegalType,
  draftProblems,
  findPlaceholders,
} from './legal.models';

const BLANK: LegalDraft = {
  title: '',
  body: { en: '', bn: '', hi: '', pa: '' },
  requiresReaccept: false,
};

/**
 * Settings → Legal documents (super admin): edit, preview and publish the
 * terms every app shows. Each publish is a new version (hash recorded,
 * audit-logged); "everyone must accept again" makes the apps ask again.
 */
@Component({
  selector: 'z-legal-page',
  imports: [
    DatePipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzInputModule,
    NzSegmentedModule,
    NzTableModule,
    NzTagModule,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-page.html',
  styleUrl: './legal-page.scss',
})
export class LegalPage {
  private readonly api = inject(LegalApi);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly meta = LEGAL_META;
  readonly langs = LEGAL_LANGS;
  readonly langOptions = LEGAL_LANGS.map((l) => ({ label: l.label, value: l.value }));

  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly heads = signal<LegalHead[]>([]);
  readonly selected = signal<LegalType | null>(null);
  readonly draft = signal<LegalDraft>({ ...BLANK, body: { ...BLANK.body } });
  readonly lang = signal<LegalLang>('en');
  readonly preview = signal(false);
  readonly versions = signal<LegalVersionRow[]>([]);
  readonly busy = signal(false);
  readonly dirty = signal(false);

  readonly head = computed(() => this.heads().find((h) => h.type === this.selected()) ?? null);
  readonly problems = computed(() => draftProblems(this.draft()));
  readonly gaps = computed(() => findPlaceholders(this.draft().body[this.lang()]));
  readonly html = computed(() => legalMarkdownToHtml(this.draft().body[this.lang()]));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      this.heads.set(await this.api.heads());
      this.status.set('ready');
      if (!this.selected()) await this.open(this.heads()[0].type);
    } catch (e) {
      this.error.set((e as Error).message);
      this.status.set('error');
    }
  }

  async open(type: LegalType): Promise<void> {
    if (this.dirty() && this.selected() !== type) {
      const ok = await this.confirm.ask({
        title: 'Discard your changes?',
        content: 'The edits to this document haven’t been published.',
        okText: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    this.selected.set(type);
    this.lang.set('en');
    this.preview.set(false);
    this.dirty.set(false);
    const head = this.heads().find((h) => h.type === type)!;
    const [current, versions] = await Promise.all([
      this.api.current(type, head.currentVersion),
      this.api.versions(type),
    ]);
    this.draft.set(current ?? { ...BLANK, title: LEGAL_META[type].label, body: { ...BLANK.body } });
    this.versions.set(versions);
  }

  setBody(text: string): void {
    const l = this.lang();
    this.draft.update((d) => ({ ...d, body: { ...d.body, [l]: text } }));
    this.dirty.set(true);
  }

  setTitle(title: string): void {
    this.draft.update((d) => ({ ...d, title }));
    this.dirty.set(true);
  }

  setReaccept(v: boolean): void {
    this.draft.update((d) => ({ ...d, requiresReaccept: v }));
  }

  /** Loads a docs/legal/*.md file (front matter is dropped). */
  async importFile(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
    const title = m ? /title:\s*(.+)/.exec(m[1])?.[1]?.trim() : null;
    const body = m ? m[2] : text;
    if (title) this.setTitle(title.replace(/^["']|["']$/g, ''));
    this.setBody(body.trim());
    (e.target as HTMLInputElement).value = '';
  }

  async publish(): Promise<void> {
    const type = this.selected();
    if (!type || this.problems().length) return;
    const d = this.draft();
    const reaccept = d.requiresReaccept;
    const ok = await this.confirm.ask({
      title: `Publish ${LEGAL_META[type].label}?`,
      content: reaccept
        ? 'This becomes the live version and everyone must read and accept it again before they continue.'
        : 'This becomes the live version for new sign-ups. People who already accepted keep their acceptance.',
      okText: 'Publish',
      danger: reaccept,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const res = await this.api.publish(type, d);
      this.toast.success(res.unchanged ? 'Nothing changed' : `Published version ${res.version}`);
      this.dirty.set(false);
      this.heads.set(await this.api.heads());
      this.versions.set(await this.api.versions(type));
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
