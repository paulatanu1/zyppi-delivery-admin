import { Timestamp } from 'firebase/firestore';

/** Matches zyppi-APP functions/src/admin/orders.ts. */
export type OrderStatus = 'placed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled';

export const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; next?: OrderStatus; nextLabel?: string }
> = {
  placed: { label: 'New', color: 'purple', next: 'packed', nextLabel: 'Mark packed' },
  packed: {
    label: 'Packed',
    color: 'blue',
    next: 'out_for_delivery',
    nextLabel: 'Out for delivery',
  },
  out_for_delivery: {
    label: 'On the way',
    color: 'gold',
    next: 'delivered',
    nextLabel: 'Mark delivered',
  },
  delivered: { label: 'Delivered', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const BOARD_COLUMNS: OrderStatus[] = ['placed', 'packed', 'out_for_delivery', 'delivered'];

export interface OrderItem {
  productId: string;
  variantId: string;
  name: string;
  unit: string;
  image: string | null;
  quantity: number;
  pricePaise: number;
  /** Marketplace seller ('zyppi' for Zyppi's own stock). */
  sellerId: string;
  sellerName: string;
}

export interface OrderAddress {
  label: string;
  line1: string;
  area: string;
  city: string;
  state: string;
  postalCode: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Order {
  id: string;
  shortId: string;
  userId: string | null;
  status: OrderStatus;
  placedAt: Timestamp | null;
  serviceAreaId: string;
  address: OrderAddress | null;
  addressText: string;
  paymentMethod: string;
  paymentStatus: string;
  providerReference: string | null;
  items: OrderItem[];
  itemTotalPaise: number;
  deliveryFeePaise: number;
  handlingFeePaise: number;
  tipPaise: number;
  discountPaise: number;
  totalPaise: number;
  couponCode: string | null;
  etaMinutes: number | null;
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  cancelReason: string | null;
  refundStatus: string | null;
  refundedPaise: number;
  /** Units returned per item line (adminReturnSellerItem). */
  returns: Record<string, number>;
}

export interface OrderEvent {
  id: string;
  status: OrderStatus;
  createdAt: Timestamp | null;
  by: string | null;
  note: string | null;
}

/** Same rule as the app and the support bot: first UUID block, upper-cased. */
export function shortOrderId(id: string): string {
  return /^[0-9a-f]{8}-/i.test(id) ? id.slice(0, 8).toUpperCase() : id;
}

export const isOnline = (o: Pick<Order, 'paymentMethod'>) => o.paymentMethod !== 'Cash on delivery';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function toOrder(id: string, d: Record<string, unknown>): Order {
  const payment = (d['payment'] ?? {}) as Record<string, unknown>;
  const a = d['address'] as Record<string, unknown> | undefined;
  const status = str(d['status']) as OrderStatus;
  return {
    id,
    shortId: shortOrderId(id),
    userId: str(d['userId']) || null,
    status: status in STATUS_META ? status : 'placed',
    placedAt: d['placedAt'] instanceof Timestamp ? d['placedAt'] : null,
    serviceAreaId: str(d['serviceAreaId']),
    address: a
      ? {
          label: str(a['label']),
          line1: str(a['line1']),
          area: str(a['area']),
          city: str(a['city']),
          state: str(a['state']),
          postalCode: str(a['postalCode']),
          landmark: str(a['landmark']) || null,
          lat: typeof a['lat'] === 'number' ? a['lat'] : null,
          lng: typeof a['lng'] === 'number' ? a['lng'] : null,
        }
      : null,
    addressText: str(d['addressText']),
    paymentMethod: str(d['paymentMethod']) || str(payment['method']),
    paymentStatus: str(payment['status']),
    providerReference: str(payment['providerReference']) || null,
    items: ((d['items'] as Record<string, unknown>[] | undefined) ?? []).map((i) => ({
      productId: str(i['productId']),
      variantId: str(i['variantId']),
      name: str(i['name']),
      unit: str(i['unit']),
      image: str(i['image']) || null,
      quantity: num(i['quantity']),
      pricePaise: num(i['pricePaise']),
      sellerId: str(i['sellerId']) || 'zyppi',
      sellerName: str(i['sellerName']),
    })),
    itemTotalPaise: num(d['itemTotalPaise']),
    deliveryFeePaise: num(d['deliveryFeePaise']),
    handlingFeePaise: num(d['handlingFeePaise']),
    tipPaise: num(d['tipPaise']),
    discountPaise: num(d['discountPaise']),
    totalPaise: num(d['totalPaise']),
    couponCode: str(d['couponCode']) || null,
    etaMinutes: typeof d['etaMinutes'] === 'number' ? d['etaMinutes'] : null,
    riderId: str(d['riderId']) || null,
    riderName: str(d['riderName']) || null,
    riderPhone: str(d['riderPhone']) || null,
    cancelReason: str(d['cancelReason']) || null,
    refundStatus: str(d['refundStatus']) || null,
    refundedPaise: num(d['refundedPaise']),
    returns: Object.fromEntries(
      Object.entries((d['returns'] as Record<string, unknown> | undefined) ?? {}).map(([k, v]) => [
        k,
        num(v),
      ]),
    ),
  };
}

/** Google Maps directions to the drop point (rider navigates on their phone). */
export function navigateUrl(a: OrderAddress | null): string | null {
  if (!a || a.lat == null || a.lng == null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
}

/** "5 min", "2 h", "3 d" since a timestamp. */
export function ago(t: Timestamp | null, now = Date.now()): string {
  if (!t) return '';
  const min = Math.max(0, Math.round((now - t.toMillis()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export const CANCEL_REASONS = [
  'Customer asked to cancel',
  'Item out of stock',
  'Customer unreachable',
  'Address not serviceable',
  'Duplicate order',
];
