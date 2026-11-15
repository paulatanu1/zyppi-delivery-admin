import type { TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPaise } from '../../shared/pipes/rupees.pipe';
import { Column, ReportTable, Row } from './reports.models';

/** Shown in the table and the PDF. */
export function formatCell(c: Column, v: string | number | undefined): string {
  if (v === undefined || v === '') return '';
  if (typeof v === 'string') return v;
  if (c.kind === 'paise') return formatPaise(v);
  if (c.kind === 'pct') return `${v}%`;
  if (c.kind === 'int') return v.toLocaleString('en-IN');
  return String(v);
}

/**
 * Rows for a spreadsheet: real numbers (money in rupees, so sums work in
 * Excel), the header first and the totals row last.
 */
export function sheetRows(t: ReportTable): (string | number)[][] {
  const value = (c: Column, v: string | number | undefined): string | number => {
    if (v === undefined) return '';
    if (typeof v === 'number' && c.kind === 'paise') return v / 100;
    return v;
  };
  const line = (r: Row) => t.columns.map((c) => value(c, r[c.key]));
  return [
    t.columns.map((c) => (c.kind === 'paise' ? `${c.label} (₹)` : c.label)),
    ...t.rows.map(line),
    ...(t.total ? [line(t.total)] : []),
  ];
}

export function fileName(t: ReportTable, ext: string): string {
  const slug = `${t.title} ${t.subtitle.split('·')[0]}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `zyppi-${slug}.${ext}`;
}

async function sheet(t: ReportTable) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(sheetRows(t));
  ws['!cols'] = t.columns.map((c) => ({ wch: c.kind === 'text' ? 28 : 14 }));
  return { XLSX, ws };
}

export async function exportXlsx(t: ReportTable): Promise<void> {
  const { XLSX, ws } = await sheet(t);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.title.slice(0, 31));
  XLSX.writeFile(wb, fileName(t, 'xlsx'));
}

export async function exportCsv(t: ReportTable): Promise<void> {
  const { XLSX, ws } = await sheet(t);
  // BOM so Excel reads ₹ and Indian names as UTF-8.
  const blob = new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(t, 'csv');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const BRAND = '#673ab7';
const MUTED = '#55585f';

export function pdfDefinition(t: ReportTable, generatedAt: Date): TDocumentDefinitions {
  const right = (c: Column) => (c.kind === 'text' ? 'left' : 'right');
  const body: TableCell[][] = [
    t.columns.map(
      (c) => ({ text: c.label, bold: true, color: MUTED, alignment: right(c) }) as TableCell,
    ),
    ...t.rows.map((r) =>
      t.columns.map((c) => ({ text: formatCell(c, r[c.key]), alignment: right(c) }) as TableCell),
    ),
    ...(t.total
      ? [
          t.columns.map(
            (c) =>
              ({
                text: formatCell(c, t.total![c.key]),
                bold: true,
                alignment: right(c),
              }) as TableCell,
          ),
        ]
      : []),
  ];
  return {
    pageOrientation: t.columns.length > 6 ? 'landscape' : 'portrait',
    pageMargins: [32, 40, 32, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    info: { title: `${t.title} · Zyppi` },
    content: [
      { text: 'Zyppi', color: BRAND, bold: true, fontSize: 16 },
      { text: t.title, bold: true, fontSize: 13, margin: [0, 8, 0, 2] },
      { text: t.subtitle, color: MUTED, margin: [0, 0, 0, 12] },
      t.rows.length
        ? {
            table: {
              headerRows: 1,
              widths: t.columns.map((c) => (c.kind === 'text' ? '*' : 'auto')),
              body,
            },
            layout: 'lightHorizontalLines',
          }
        : { text: 'No data for this period.', color: MUTED },
    ],
    footer: (page: number, pages: number) => ({
      text: `Generated ${generatedAt.toLocaleString('en-IN')} · page ${page} of ${pages}`,
      color: MUTED,
      fontSize: 8,
      margin: [32, 12, 32, 0],
    }),
  };
}

export async function exportPdf(t: ReportTable): Promise<void> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);
  await pdfMake.createPdf(pdfDefinition(t, new Date())).download(fileName(t, 'pdf'));
}
