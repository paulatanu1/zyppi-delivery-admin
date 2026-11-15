import { Timestamp } from 'firebase/firestore';

/** zyppi-APP functions/src/dispatch (rider app). */
export type DispatchState =
  'searching' | 'offered' | 'assigned' | 'manual' | 'unassigned' | 'issue';

export interface OnlineRider {
  id: string;
  name: string;
  phone: string;
  serviceAreaId: string;
  activeOrderId: string | null;
  offerOrderId: string | null;
  onBreakUntil: Timestamp | null;
  pingAt: Timestamp | null;
  lat: number | null;
  lng: number | null;
  inSlot: boolean;
  codBalancePaise: number;
}

export interface QueueOrder {
  id: string;
  shortId: string;
  status: string;
  serviceAreaId: string;
  placedAt: Timestamp | null;
  totalPaise: number;
  cod: boolean;
  state: DispatchState;
  tried: number;
  offerRiderId: string | null;
  offerExpiresAt: Timestamp | null;
  riderId: string | null;
  riderName: string | null;
  cannotDeliver: { reason: string; note: string | null } | null;
  addressText: string;
}

export interface SosAlert {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  kinds: string[];
  lastKind: string;
  lat: number | null;
  lng: number | null;
  orderId: string | null;
  at: Timestamp | null;
}

const ts = (v: unknown) => (v instanceof Timestamp ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export function toOnlineRider(id: string, d: Record<string, unknown>): OnlineRider {
  const p = obj(d['presence']);
  return {
    id,
    name: str(d['fullName']) || 'Rider',
    phone: str(d['phone']),
    serviceAreaId: str(d['serviceAreaId']),
    activeOrderId: str(p['activeOrderId']) || null,
    offerOrderId: str(p['offerOrderId']) || null,
    onBreakUntil: ts(p['onBreakUntil']),
    pingAt: ts(p['at']),
    lat: num(p['lat']),
    lng: num(p['lng']),
    inSlot: (ts(p['slotEndsAt'])?.toMillis() ?? 0) > Date.now(),
    codBalancePaise: num(d['codBalancePaise']) ?? 0,
  };
}

export function toQueueOrder(id: string, d: Record<string, unknown>): QueueOrder {
  const dispatch = obj(d['dispatch']);
  const offer = obj(d['offer']);
  const cd = obj(d['cannotDeliver']);
  return {
    id,
    shortId: /^[0-9a-f]{8}-/i.test(id) ? id.slice(0, 8).toUpperCase() : id,
    status: str(d['status']),
    serviceAreaId: str(d['serviceAreaId']),
    placedAt: ts(d['placedAt']),
    totalPaise: num(d['totalPaise']) ?? 0,
    cod: obj(d['payment'])['method'] === 'Cash on delivery',
    state: (str(dispatch['state']) || 'searching') as DispatchState,
    tried: Array.isArray(dispatch['tried']) ? dispatch['tried'].length : 0,
    offerRiderId: str(offer['riderId']) || null,
    offerExpiresAt: ts(offer['expiresAt']),
    riderId: str(d['riderId']) || null,
    riderName: str(d['riderName']) || null,
    cannotDeliver: cd['reason']
      ? { reason: str(cd['reason']), note: str(cd['note']) || null }
      : null,
    addressText: str(d['addressText']),
  };
}

export function toSos(id: string, d: Record<string, unknown>): SosAlert {
  const p = obj(d['position']);
  return {
    id,
    riderId: str(d['riderId']),
    riderName: str(d['riderName']) || 'Rider',
    riderPhone: str(d['riderPhone']),
    kinds: Array.isArray(d['kinds'])
      ? d['kinds'].filter((k): k is string => typeof k === 'string')
      : [],
    lastKind: str(d['lastKind']),
    lat: num(p['lat']),
    lng: num(p['lng']),
    orderId: str(d['orderId']) || null,
    at: ts(d['at']),
  };
}

export type RiderActivity = 'delivering' | 'offered' | 'break' | 'idle' | 'stale';

/** What an online rider is doing; "stale" when the app stopped pinging (3 min). */
export function activityOf(r: OnlineRider, nowMs = Date.now()): RiderActivity {
  if (r.activeOrderId) return 'delivering';
  if (r.offerOrderId) return 'offered';
  if ((r.onBreakUntil?.toMillis() ?? 0) > nowMs) return 'break';
  if (!r.pingAt || nowMs - r.pingAt.toMillis() > 3 * 60_000) return 'stale';
  return 'idle';
}

export const ACTIVITY_META: Record<RiderActivity, { label: string; color: string }> = {
  delivering: { label: 'On a delivery', color: 'blue' },
  offered: { label: 'Offered an order', color: 'purple' },
  break: { label: 'On a break', color: 'gold' },
  idle: { label: 'Free', color: 'green' },
  stale: { label: 'No signal', color: 'default' },
};

export const CANNOT_DELIVER_LABELS: Record<string, string> = {
  customer_unreachable: 'Customer not reachable',
  customer_refused: 'Customer refused',
  wrong_address: 'Wrong address',
  unsafe_location: 'Unsafe location',
  other: 'Other',
};

export const SOS_LABELS: Record<string, string> = {
  ambulance: 'Called ambulance',
  accident: 'Called accident team',
  police: 'Called police',
};

/** "2 min ago". */
export function ago(t: Timestamp | null, nowMs = Date.now()): string {
  if (!t) return '—';
  const s = Math.max(0, Math.round((nowMs - t.toMillis()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function mapsLink(lat: number | null, lng: number | null): string | null {
  return lat != null && lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : null;
}
