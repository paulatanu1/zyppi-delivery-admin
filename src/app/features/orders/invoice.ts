import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPaise } from '../../shared/pipes/rupees.pipe';
import { formatWhen } from '../../shared/pipes/when.pipe';
import { Customer } from './orders.api';
import { Order, isOnline } from './orders.models';

const BRAND = '#673ab7';

const right = (text: string, extra: Record<string, unknown> = {}): TableCell =>
  ({ text, alignment: 'right', ...extra }) as TableCell;
const head = (text: string, alignRight = false): TableCell =>
  ({
    text,
    bold: true,
    color: '#55585f',
    ...(alignRight ? { alignment: 'right' } : {}),
  }) as TableCell;

/** pdfmake + Roboto (has ₹) loaded on first use only. */
async function pdf() {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}

function addressLines(o: Order): string[] {
  const a = o.address;
  if (!a) return [o.addressText];
  return [
    a.line1,
    [a.area, a.city].filter(Boolean).join(', '),
    [a.state, a.postalCode].filter(Boolean).join(' '),
    a.landmark ? `Landmark: ${a.landmark}` : '',
  ].filter(Boolean);
}

export function invoiceDefinition(
  o: Order,
  c: Customer | null,
  area: string,
): TDocumentDefinitions {
  const money = (p: number) => formatPaise(p);
  const rows: TableCell[][] = o.items.map((i) => [
    { text: i.name, bold: true },
    i.unit,
    right(String(i.quantity)),
    right(money(i.pricePaise)),
    right(money(i.pricePaise * i.quantity)),
  ]);
  const bill: [string, number][] = [
    ['Item total', o.itemTotalPaise],
    ['Delivery fee', o.deliveryFeePaise],
    ['Handling fee', o.handlingFeePaise],
    ...(o.tipPaise ? ([['Rider tip', o.tipPaise]] as [string, number][]) : []),
    ...(o.discountPaise
      ? ([[`Discount${o.couponCode ? ` (${o.couponCode})` : ''}`, -o.discountPaise]] as [
          string,
          number,
        ][])
      : []),
  ];
  return {
    info: { title: `Zyppi invoice #${o.shortId}` },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#141519' },
    footer: (page: number, pages: number) => ({
      text: `Zyppi · Purulia, West Bengal · Page ${page} of ${pages}`,
      alignment: 'center',
      fontSize: 8,
      color: '#83868d',
    }),
    content: [
      {
        columns: [
          { text: 'Zyppi', fontSize: 24, bold: true, color: BRAND },
          {
            stack: [
              { text: 'TAX INVOICE / BILL OF SUPPLY', bold: true, fontSize: 9, color: '#55585f' },
              { text: `Order #${o.shortId}`, fontSize: 14, bold: true, margin: [0, 4, 0, 0] },
              { text: formatWhen(o.placedAt), color: '#55585f' },
            ],
            alignment: 'right',
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineColor: '#e4e1da' }] },
      {
        margin: [0, 14, 0, 14],
        columns: [
          {
            stack: [
              { text: 'Delivered to', bold: true, color: '#83868d', fontSize: 9 },
              { text: c?.name || o.address?.label || 'Customer', bold: true, margin: [0, 2, 0, 0] },
              ...addressLines(o).map((t) => ({ text: t })),
              ...(c?.phone ? [{ text: c.phone }] : []),
            ],
          },
          {
            stack: [
              { text: 'Payment', bold: true, color: '#83868d', fontSize: 9 },
              { text: o.paymentMethod, bold: true, margin: [0, 2, 0, 0] },
              { text: isOnline(o) ? `PayU ref ${o.providerReference ?? '—'}` : 'Paid on delivery' },
              { text: `Area: ${area}` },
            ],
            alignment: 'right',
          },
        ],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 60, 30, 60, 70],
          body: [
            [
              head('Item'),
              head('Size'),
              head('Qty', true),
              head('Price', true),
              head('Amount', true),
            ],
            ...rows,
          ],
        },
        layout: {
          hLineColor: () => '#e4e1da',
          vLineWidth: () => 0,
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
      {
        margin: [0, 12, 0, 0],
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            table: {
              widths: ['*', 80],
              body: [
                ...bill.map(([k, v]): TableCell[] => [k, right(money(v))]),
                [
                  { text: 'Total', bold: true, fontSize: 12 },
                  right(money(o.totalPaise), { bold: true, fontSize: 12 }),
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
      ...(o.status === 'cancelled'
        ? ([
            {
              margin: [0, 16, 0, 0],
              text: `Cancelled: ${o.cancelReason ?? ''}${o.refundedPaise ? ` · Refunded ${money(o.refundedPaise)}` : ''}`,
              color: '#c2263a',
              bold: true,
            },
          ] as Content[])
        : []),
      {
        text: 'Thank you for ordering with Zyppi!',
        margin: [0, 24, 0, 0],
        color: BRAND,
        bold: true,
      },
    ],
  };
}

/** Big, plain, for the packer: items with quantities and a tick box. */
export function packingSlipDefinition(o: Order, area: string): TDocumentDefinitions {
  return {
    pageSize: 'A5',
    pageMargins: [28, 28, 28, 28],
    defaultStyle: { font: 'Roboto', fontSize: 12 },
    content: [
      { text: `#${o.shortId}`, fontSize: 26, bold: true },
      {
        text: `${formatWhen(o.placedAt)} · ${area} · ${o.paymentMethod}`,
        color: '#55585f',
        margin: [0, 2, 0, 12],
      },
      {
        table: {
          widths: [18, 34, '*'],
          body: o.items.map((i): TableCell[] => [
            { text: '[  ]', fontSize: 12, color: '#83868d' },
            { text: `${i.quantity}×`, bold: true, fontSize: 14 },
            { text: `${i.name} — ${i.unit}`, fontSize: 13 },
          ]),
        },
        layout: 'noBorders',
      },
      {
        text: `${o.items.reduce((s, i) => s + i.quantity, 0)} items`,
        bold: true,
        margin: [0, 12, 0, 0],
      },
      { text: o.addressText, margin: [0, 8, 0, 0], color: '#55585f' },
      ...(o.paymentMethod === 'Cash on delivery'
        ? [
            {
              text: `Collect ${formatPaise(o.totalPaise)} cash`,
              fontSize: 16,
              bold: true,
              margin: [0, 10, 0, 0],
            } as Content,
          ]
        : []),
    ],
  };
}

export async function downloadInvoice(o: Order, c: Customer | null, area: string): Promise<void> {
  const pdfMake = await pdf();
  await pdfMake.createPdf(invoiceDefinition(o, c, area)).download(`zyppi-invoice-${o.shortId}.pdf`);
}

export async function printPackingSlip(o: Order, area: string): Promise<void> {
  const pdfMake = await pdf();
  await pdfMake.createPdf(packingSlipDefinition(o, area)).print();
}
