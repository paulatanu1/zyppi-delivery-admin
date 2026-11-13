import { Timestamp } from 'firebase/firestore';
import { invoiceDefinition, packingSlipDefinition } from './invoice';
import { toOrder } from './orders.models';

const order = toOrder('3f2a9c1b-0000-4000-8000-000000000000', {
  status: 'cancelled',
  placedAt: Timestamp.fromMillis(Date.UTC(2026, 10, 14, 6, 0)),
  paymentMethod: 'UPI',
  payment: { status: 'succeeded', providerReference: 'mih1' },
  address: {
    label: 'Home',
    line1: '12 Station Rd',
    area: 'Ward 5',
    city: 'Purulia',
    state: 'WB',
    postalCode: '723101',
    landmark: 'Kali Mandir',
    lat: 1,
    lng: 2,
  },
  items: [{ name: 'Milk', unit: '1 L', quantity: 2, pricePaise: 6400 }],
  itemTotalPaise: 12800,
  handlingFeePaise: 500,
  discountPaise: 1000,
  couponCode: 'ZYPPI10',
  totalPaise: 12300,
  cancelReason: 'Item out of stock',
  refundedPaise: 12300,
});

describe('invoice', () => {
  it('lists items, the bill, payment reference and the cancellation', () => {
    const text = JSON.stringify(
      invoiceDefinition(order, { name: 'Rina', phone: '+9198', email: null }, 'Purulia'),
    );
    for (const want of [
      '#3F2A9C1B',
      'Milk',
      '₹128',
      'Discount (ZYPPI10)',
      '₹123',
      'PayU ref mih1',
      'Rina',
      'Landmark: Kali Mandir',
      'Cancelled: Item out of stock',
    ]) {
      expect(text).toContain(want);
    }
  });

  it('packing slip shows quantities and cash to collect only for COD', () => {
    expect(JSON.stringify(packingSlipDefinition(order, 'Purulia'))).not.toContain('Collect');
    const cod = { ...order, paymentMethod: 'Cash on delivery' };
    const slip = JSON.stringify(packingSlipDefinition(cod, 'Purulia'));
    expect(slip).toContain('2×');
    expect(slip).toContain('Collect ₹123 cash');
  });

  it('renders to a real PDF', async () => {
    const { default: pdfMake } = await import('pdfmake/build/pdfmake');
    const { default: vfs } = await import('pdfmake/build/vfs_fonts');
    pdfMake.addVirtualFileSystem(vfs);
    const buffer = await pdfMake.createPdf(invoiceDefinition(order, null, 'Purulia')).getBuffer();
    expect(new TextDecoder().decode(buffer.slice(0, 5))).toBe('%PDF-');
  });
});
