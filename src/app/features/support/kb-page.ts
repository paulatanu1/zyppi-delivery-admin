import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { KbImportRow, parseKbImport, pruneRelated } from './kb-import';
import { SupportApi } from './support.api';
import {
  KB_ACTIONS,
  KB_LANGS,
  KB_LANG_NAMES,
  KbEntry,
  KbLang,
  emptyKbEntry,
  kbIdFrom,
  linesOf,
} from './support.models';

/** Editable copy of an entry: questions as one-per-line text. */
interface Draft {
  isNew: boolean;
  id: string;
  action: KbEntry['action'];
  hidden: boolean;
  title: Record<KbLang, string>;
  questions: Record<KbLang, string>;
  answers: Record<KbLang, string>;
  keywords: string;
  related: string[];
}

/** An import row and how saving it went. */
interface ImportRow extends KbImportRow {
  state: 'ready' | 'saving' | 'saved' | 'failed' | 'skipped';
  error: string | null;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function toDraft(e: KbEntry, isNew: boolean): Draft {
  const per = <T>(f: (l: KbLang) => T) =>
    Object.fromEntries(KB_LANGS.map((l) => [l, f(l)])) as Record<KbLang, T>;
  return {
    isNew,
    id: e.id,
    action: e.action,
    hidden: e.hidden,
    title: per((l) => e.title[l]),
    questions: per((l) => e.questions[l].join('\n')),
    answers: per((l) => e.answers[l]),
    keywords: e.keywords.join(', '),
    related: [...e.related],
  };
}

/** The support bot's knowledge base, in the app's four languages. */
@Component({
  selector: 'z-kb-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    PageHeader,
    PageState,
    RouterLink,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kb-page.html',
  styles: `
    .dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-left: 4px;
      vertical-align: middle;
      border-radius: 50%;
      background: var(--z-warn);
    }
  `,
})
export class KbPage {
  private readonly api = inject(SupportApi);
  private readonly message = inject(NzMessageService);
  private readonly confirm = inject(Confirm);

  readonly entries = this.api.watchKb();
  readonly langs = KB_LANGS;
  readonly langNames = KB_LANG_NAMES;
  readonly actions = KB_ACTIONS;
  readonly search = signal('');
  readonly draft = signal<Draft | null>(null);
  readonly saving = signal(false);
  readonly deleting = signal(false);

  readonly importRows = signal<ImportRow[] | null>(null);
  readonly importFile = signal('');
  readonly importing = signal(false);
  private stopRequested = false;

  readonly importStats = computed(() => {
    const rows = this.importRows() ?? [];
    const todo = rows.filter((r) => r.state === 'ready' || r.state === 'failed');
    return {
      todo: todo.length,
      replacing: todo.filter((r) => r.exists).length,
      skipped: rows.filter((r) => r.state === 'skipped').length,
      saved: rows.filter((r) => r.state === 'saved').length,
      failed: rows.filter((r) => r.state === 'failed').length,
    };
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const all = this.entries.value() ?? [];
    return q
      ? all.filter(
          (e) =>
            e.id.includes(q) ||
            e.title.en.toLowerCase().includes(q) ||
            e.questions.en.some((x) => x.toLowerCase().includes(q)),
        )
      : all;
  });

  readonly relatedOptions = computed(() =>
    (this.entries.value() ?? [])
      .filter((e) => e.id !== this.draft()?.id)
      .map((e) => ({ label: e.title.en || e.id, value: e.id })),
  );

  /** Which languages still need text (shown as a dot on the tab). */
  missing(d: Draft, l: KbLang): boolean {
    return !d.title[l].trim() || (d.action !== 'order_status' && !d.answers[l].trim());
  }

  actionLabel(a: KbEntry['action']): string {
    return KB_ACTIONS.find((x) => x.value === a)?.label ?? a;
  }

  edit(e: KbEntry): void {
    this.draft.set(toDraft(e, false));
  }

  create(): void {
    this.draft.set(toDraft(emptyKbEntry(), true));
  }

  closeDrawer(): void {
    if (!this.saving()) this.draft.set(null);
  }

  /** Mutates the draft in place; signals see a new object. */
  patch(f: (d: Draft) => void): void {
    const d = this.draft();
    if (!d) return;
    const next = structuredClone(d);
    f(next);
    this.draft.set(next);
  }

  setTitle(l: KbLang, v: string): void {
    this.patch((d) => {
      // New entries take their id from the English title until it's edited.
      if (d.isNew && l === 'en' && (d.id === '' || d.id === kbIdFrom(d.title.en))) {
        d.id = kbIdFrom(v);
      }
      d.title[l] = v;
    });
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    try {
      const per = <T>(f: (l: KbLang) => T) =>
        Object.fromEntries(KB_LANGS.map((l) => [l, f(l)])) as Record<KbLang, T>;
      const res = await this.api.saveKb({
        id: d.id.trim(),
        action: d.action,
        hidden: d.hidden,
        title: per((l) => d.title[l].trim()),
        questions: per((l) => linesOf(d.questions[l])),
        answers: per((l) => d.answers[l].trim()),
        keywords: d.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        related: d.related,
      });
      this.message.success(res.created ? 'Entry added; the bot knows it now' : 'Entry saved');
      this.draft.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  // ---- Import (supportKb-import.json from chatbot-knowledge-base/) -------

  async onImportPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      this.message.error('Choose a .json file.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.message.error('That file is over 2 MB. Split it into smaller files.');
      return;
    }
    try {
      const ids = new Set((this.entries.value() ?? []).map((e) => e.id));
      const rows = pruneRelated(parseKbImport(await file.text(), ids), ids);
      this.importFile.set(file.name);
      this.importRows.set(
        rows.map((r) => ({ ...r, state: r.problem ? 'skipped' : 'ready', error: null })),
      );
    } catch (e) {
      this.message.error((e as Error).message);
    }
  }

  private setRow(i: number, patch: Partial<ImportRow>): void {
    this.importRows.update(
      (rows) => rows?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null,
    );
  }

  /**
   * Saves entries one by one through adminSaveKbEntry, so each is validated,
   * re-embedded and audited like an edit in the drawer. Never deletes anything.
   */
  async runImport(): Promise<void> {
    const rows = this.importRows();
    if (!rows || this.importing()) return;
    this.importing.set(true);
    this.stopRequested = false;
    try {
      for (let i = 0; i < rows.length; i++) {
        if (this.stopRequested) break;
        const r = rows[i];
        if (r.state !== 'ready' && r.state !== 'failed') continue;
        this.setRow(i, { state: 'saving', error: null });
        try {
          await this.api.saveKb(r.entry);
          this.setRow(i, { state: 'saved' });
        } catch (e) {
          this.setRow(i, { state: 'failed', error: (e as Error).message });
        }
      }
    } finally {
      this.importing.set(false);
    }
    const s = this.importStats();
    if (s.failed) this.message.warning(`${s.saved} saved, ${s.failed} failed. Retry to try again.`);
    else this.message.success(`${s.saved} entries saved; the bot knows them now`);
  }

  stopImport(): void {
    this.stopRequested = true;
  }

  closeImport(): void {
    if (!this.importing()) this.importRows.set(null);
  }

  async remove(): Promise<void> {
    const d = this.draft();
    if (!d || d.isNew) return;
    const ok = await this.confirm.ask({
      title: `Delete “${d.title.en || d.id}”?`,
      content: 'The bot stops answering this topic. Other entries linking to it lose the link.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.deleting.set(true);
    try {
      await this.api.deleteKb(d.id);
      this.message.success('Entry deleted');
      this.draft.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.deleting.set(false);
    }
  }
}
