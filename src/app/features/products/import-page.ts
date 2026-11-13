import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { IMAGE_TYPES } from '../../shared/util/image';
import { CatalogApi } from '../catalog/catalog.api';
import {
  ParsedRow,
  TEMPLATE_COLUMNS,
  chunkByGroup,
  missingColumns,
  parseRows,
} from './import.parse';

type Step = 0 | 1 | 2 | 3;

interface Outcome {
  row: number;
  name: string;
  status: 'created' | 'updated' | 'error' | 'skipped';
  message: string;
}

const COLUMN_HELP: [string, string][] = [
  [
    'product_id',
    'Leave empty for new products. To update one, paste its id (from the Products page export).',
  ],
  [
    'key',
    'Same key on several rows = one product with several sizes. Optional for single-size products.',
  ],
  ['name', 'Product name, e.g. “Amul Butter”. Needed once per new product.'],
  ['description', 'Optional.'],
  ['category', 'Top-level category name exactly as in Categories, e.g. “Dairy”.'],
  ['subcategory', 'Optional sub-category name under that category.'],
  ['variant', 'Size of this row, e.g. “500 g”. One row per size.'],
  ['price', 'Selling price in ₹, e.g. 56 or 56.50.'],
  ['mrp', 'MRP in ₹. Empty = same as price (no discount).'],
  ['image', 'An https:// link, or a photo file name you select below (e.g. butter.jpg).'],
  ['active', 'yes / no. Empty = yes for new products.'],
];

@Component({
  selector: 'z-import-page',
  imports: [
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzProgressModule,
    NzStepsModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    RupeesPipe,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-page.html',
  styles: `
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 32px 16px;
      border: 1.5px dashed var(--z-line-2);
      border-radius: var(--z-radius-card);
      background: var(--z-surface-2);
      text-align: center;
      cursor: pointer;
    }
    .drop:hover,
    .drop:focus-within,
    .drop.drag {
      border-color: var(--z-brand);
    }
    code {
      font-size: 12px;
      font-weight: 700;
    }
  `,
})
export class ImportPage {
  private readonly api = inject(CatalogApi);
  private readonly categories = this.api.watchCategories();

  readonly step = signal<Step>(0);
  readonly fileName = signal<string | null>(null);
  readonly images = signal<File[]>([]);
  readonly rows = signal<ParsedRow[]>([]);
  readonly fileError = signal<string | null>(null);
  readonly onlyProblems = signal(false);
  readonly dragging = signal(false);
  readonly progress = signal(0);
  readonly progressText = signal('');
  readonly outcomes = signal<Outcome[]>([]);
  readonly fatal = signal<string | null>(null);
  readonly help = COLUMN_HELP;
  protected readonly imageTypes = IMAGE_TYPES.join(',');

  /** Products whose every row is clean are imported; the rest are skipped. */
  readonly badGroups = computed(
    () =>
      new Set(
        this.rows()
          .filter((r) => r.problems.length)
          .map((r) => r.group),
      ),
  );
  readonly summary = computed(() => {
    const rows = this.rows();
    const groups = new Set(rows.map((r) => r.group));
    const bad = this.badGroups();
    return {
      rows: rows.length,
      products: groups.size,
      ready: [...groups].filter((g) => !bad.has(g)).length,
      problemRows: rows.filter((r) => r.problems.length).length,
      updates: [...groups].filter((g) => g.startsWith('id:')).length,
    };
  });
  readonly visibleRows = computed(() =>
    this.onlyProblems() ? this.rows().filter((r) => this.badGroups().has(r.group)) : this.rows(),
  );
  readonly result = computed(() => {
    const o = this.outcomes();
    const products = (s: Outcome['status']) =>
      new Set(o.filter((x) => x.status === s).map((x) => x.name)).size;
    return {
      created: products('created'),
      updated: products('updated'),
      failed: o.filter((x) => x.status === 'error' || x.status === 'skipped'),
    };
  });

  rowName(r: ParsedRow): string {
    return (
      r.data.name ||
      this.rows().find((x) => x.group === r.group && x.data.name)?.data.name ||
      r.data.productId ||
      '—'
    );
  }

  // ---- Step 0: template ------------------------------------------------

  async downloadTemplate(): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const sample = [
      [
        '',
        'amul-butter',
        'Amul Butter',
        'Pasteurised salted butter',
        'Dairy',
        'Butter & Cheese',
        '100 g',
        56,
        60,
        'butter.jpg',
        'yes',
      ],
      ['', 'amul-butter', '', '', '', '', '500 g', 275, 290, '', ''],
      ['', '', 'Robusta Banana', '', 'Fresh Fruits & Vegetables', '', '6 pcs', 48, '', '', ''],
    ];
    const sheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_COLUMNS], ...sample]);
    sheet['!cols'] = TEMPLATE_COLUMNS.map((c) => ({
      wch: c === 'description' ? 32 : c === 'name' ? 24 : 14,
    }));
    XLSX.utils.book_append_sheet(wb, sheet, 'Products');

    const cats = this.categories.value() ?? [];
    const catRows = cats
      .filter((c) => !c.parentId)
      .flatMap((top) => {
        const subs = cats.filter((c) => c.parentId === top.id);
        return subs.length ? subs.map((s) => [top.name, s.name]) : [[top.name, '']];
      });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['category', 'subcategory'], ...catRows]),
      'Categories',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['column', 'what to put'], ...COLUMN_HELP]),
      'How to fill',
    );
    XLSX.writeFile(wb, 'zyppi-products-template.xlsx');
  }

  // ---- Step 1: files ---------------------------------------------------

  onSheetPicked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.readSheet(file);
  }

  onSheetDropped(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.readSheet(file);
  }

  onImagesPicked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const picked = [...(input.files ?? [])].filter((f) => IMAGE_TYPES.includes(f.type));
    input.value = '';
    const byName = new Map(this.images().map((f) => [f.name.toLowerCase(), f]));
    for (const f of picked) byName.set(f.name.toLowerCase(), f);
    this.images.set([...byName.values()]);
    this.reparse();
  }

  clearImages(): void {
    this.images.set([]);
    this.reparse();
  }

  private sheetRaw: Record<string, unknown>[] = [];

  private async readSheet(file: File): Promise<void> {
    this.fileError.set(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      this.fileError.set('Use an .xlsx or .csv file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.fileError.set('That file is over 5 MB. Split it into smaller files.');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });
      const nonEmpty = raw.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
      if (nonEmpty.length === 0) {
        this.fileError.set('The first sheet has no rows under the header.');
        return;
      }
      if (nonEmpty.length > 2000) {
        this.fileError.set('Up to 2,000 rows per file. Split it into smaller files.');
        return;
      }
      const missing = missingColumns(Object.keys(raw[0] ?? {}));
      if (missing.length) {
        this.fileError.set(`Missing column(s): ${missing.join(', ')}. Start from the template.`);
        return;
      }
      this.sheetRaw = nonEmpty;
      this.fileName.set(file.name);
      this.reparse();
    } catch {
      this.fileError.set('Couldn’t read that file. Save it as .xlsx and try again.');
    }
  }

  private reparse(): void {
    if (!this.sheetRaw.length) return;
    this.rows.set(
      parseRows(
        this.sheetRaw,
        this.images().map((f) => f.name),
      ),
    );
  }

  review(): void {
    this.onlyProblems.set(this.summary().problemRows > 0);
    this.step.set(2);
  }

  startOver(): void {
    this.sheetRaw = [];
    this.rows.set([]);
    this.fileName.set(null);
    this.images.set([]);
    this.outcomes.set([]);
    this.fatal.set(null);
    this.step.set(1);
  }

  // ---- Step 3: import --------------------------------------------------

  async runImport(): Promise<void> {
    this.step.set(3);
    this.fatal.set(null);
    this.progress.set(0);
    const bad = this.badGroups();
    const good = this.rows().filter((r) => !bad.has(r.group));
    const outcomes: Outcome[] = this.rows()
      .filter((r) => bad.has(r.group))
      .map((r) => ({
        row: r.row,
        name: this.rowName(r),
        status: 'skipped' as const,
        message: r.problems.join('; ') || 'Another row of this product has a problem',
      }));

    try {
      // 1) Photos referenced by file name → upload once each.
      const wanted = [
        ...new Set(
          good.map((r) => r.imageRef).filter((x): x is string => !!x && !/^https:/i.test(x)),
        ),
      ];
      const urls = new Map<string, string>();
      for (const [i, name] of wanted.entries()) {
        this.progressText.set(`Uploading photo ${i + 1} of ${wanted.length}…`);
        const file = this.images().find((f) => f.name.toLowerCase() === name.toLowerCase())!;
        urls.set(name.toLowerCase(), await this.api.uploadImage(file, 'products'));
        this.progress.set(Math.round(((i + 1) / Math.max(wanted.length, 1)) * 30));
      }

      // 2) Rows → callable, whole products per request.
      const chunks = chunkByGroup(good);
      for (const [i, chunk] of chunks.entries()) {
        this.progressText.set(`Saving products (batch ${i + 1} of ${chunks.length})…`);
        const res = await this.api.importProducts(
          chunk.map((r) => ({
            ...r.data,
            imageUrl: r.imageRef
              ? /^https:/i.test(r.imageRef)
                ? r.imageRef
                : (urls.get(r.imageRef.toLowerCase()) ?? null)
              : null,
          })),
        );
        const byRow = new Map(chunk.map((r) => [r.row, r]));
        for (const x of res.results) {
          const r = byRow.get(x.row)!;
          outcomes.push({
            row: x.row,
            name: this.rowName(r),
            status: x.status,
            message: x.message ?? '',
          });
        }
        this.progress.set(30 + Math.round(((i + 1) / chunks.length) * 70));
      }
      this.progressText.set('Done');
    } catch (e) {
      this.fatal.set(
        `${(e as Error).message} Products saved before this point are kept. Check the Products page before uploading the same file again, or its new products would be added twice.`,
      );
    } finally {
      this.outcomes.set(outcomes.sort((a, b) => a.row - b.row));
      this.progress.set(100);
    }
  }

  async downloadErrors(): Promise<void> {
    const XLSX = await import('xlsx');
    const failed = new Set(this.result().failed.map((f) => f.row));
    const messages = new Map(this.result().failed.map((f) => [f.row, f.message]));
    const rows = this.sheetRaw
      .map((r, i) => ({ ...r, error: messages.get(i + 2) ?? '' }))
      .filter((_, i) => failed.has(i + 2));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Fix and re-upload');
    XLSX.writeFile(wb, 'zyppi-products-errors.xlsx');
  }
}
