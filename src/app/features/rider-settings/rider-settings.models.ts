import { Timestamp } from 'firebase/firestore';

/** config/riders — zyppi-APP functions/src/dispatch/model.ts (parseRiderConfig). */
export interface PayRate {
  basePaise: number;
  perKmPaise: number;
  minPaise: number;
  maxPaise: number;
}

export interface SlotTemplate {
  start: string;
  end: string;
  capacity: number;
  bonusPaise: number;
}

export interface PeakWindow {
  start: string;
  end: string;
  extraPaise: number;
}

export interface RiderConfig {
  dispatch: {
    auto: boolean;
    assignAt: 'placed' | 'packed';
    offerSeconds: number;
    maxOffers: number;
    maxDistanceKm: number;
    pingFreshSeconds: number;
  };
  emergency: { ambulance: string; police: string; accident: string };
  cashLimitPaise: number;
  waitMinutes: number;
  pay: Record<string, PayRate>;
  surge: { enabled: boolean; extraPaise: number; label: string };
  peak: PeakWindow[];
  slots: { cancelHours: number; bookDaysAhead: number };
  slotTemplates: Record<string, SlotTemplate[]>;
}

export const DEFAULT_RATE: PayRate = {
  basePaise: 2500,
  perKmPaise: 600,
  minPaise: 2500,
  maxPaise: 12000,
};

export const DEFAULT_SLOTS: SlotTemplate[] = [
  { start: '07:00', end: '11:00', capacity: 5, bonusPaise: 0 },
  { start: '11:00', end: '15:00', capacity: 5, bonusPaise: 0 },
  { start: '15:00', end: '19:00', capacity: 5, bonusPaise: 0 },
  { start: '19:00', end: '23:00', capacity: 5, bonusPaise: 0 },
];

export function defaultRiderConfig(): RiderConfig {
  return {
    dispatch: {
      auto: true,
      assignAt: 'placed',
      offerSeconds: 30,
      maxOffers: 3,
      maxDistanceKm: 5,
      pingFreshSeconds: 180,
    },
    emergency: { ambulance: '108', police: '112', accident: '' },
    cashLimitPaise: 300000,
    waitMinutes: 10,
    pay: { default: { ...DEFAULT_RATE } },
    surge: { enabled: false, extraPaise: 1000, label: 'Rain bonus' },
    peak: [],
    slots: { cancelHours: 2, bookDaysAhead: 7 },
    slotTemplates: { default: DEFAULT_SLOTS.map((s) => ({ ...s })) },
  };
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const n = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const s = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);

/** The saved config over the defaults (the server already validated it). */
export function toRiderConfig(raw: Record<string, unknown> | undefined): RiderConfig {
  const d = defaultRiderConfig();
  const r = obj(raw);
  const dis = obj(r['dispatch']);
  const em = obj(r['emergency']);
  const rate = (v: unknown): PayRate => {
    const x = obj(v);
    return {
      basePaise: n(x['basePaise'], DEFAULT_RATE.basePaise),
      perKmPaise: n(x['perKmPaise'], DEFAULT_RATE.perKmPaise),
      minPaise: n(x['minPaise'], DEFAULT_RATE.minPaise),
      maxPaise: n(x['maxPaise'], DEFAULT_RATE.maxPaise),
    };
  };
  const pay: Record<string, PayRate> = { default: rate(obj(r['pay'])['default']) };
  for (const [k, v] of Object.entries(obj(r['pay']))) if (k !== 'default') pay[k] = rate(v);
  const templates: Record<string, SlotTemplate[]> = {};
  for (const [k, v] of Object.entries(obj(r['slotTemplates']))) {
    if (Array.isArray(v)) {
      templates[k] = v.map(obj).map((t) => ({
        start: s(t['start'], '09:00'),
        end: s(t['end'], '13:00'),
        capacity: n(t['capacity'], 5),
        bonusPaise: n(t['bonusPaise'], 0),
      }));
    }
  }
  if (!templates['default']) templates['default'] = d.slotTemplates['default'];
  const surge = obj(r['surge']);
  const slots = obj(r['slots']);
  return {
    dispatch: {
      auto: typeof dis['auto'] === 'boolean' ? dis['auto'] : d.dispatch.auto,
      assignAt: dis['assignAt'] === 'packed' ? 'packed' : 'placed',
      offerSeconds: n(dis['offerSeconds'], d.dispatch.offerSeconds),
      maxOffers: n(dis['maxOffers'], d.dispatch.maxOffers),
      maxDistanceKm: n(dis['maxDistanceKm'], d.dispatch.maxDistanceKm),
      pingFreshSeconds: n(dis['pingFreshSeconds'], d.dispatch.pingFreshSeconds),
    },
    emergency: {
      ambulance: s(em['ambulance'], d.emergency.ambulance),
      police: s(em['police'], d.emergency.police),
      accident: s(em['accident'], ''),
    },
    cashLimitPaise: n(r['cashLimitPaise'], d.cashLimitPaise),
    waitMinutes: n(r['waitMinutes'], d.waitMinutes),
    pay,
    surge: {
      enabled: surge['enabled'] === true,
      extraPaise: n(surge['extraPaise'], d.surge.extraPaise),
      label: s(surge['label'], d.surge.label),
    },
    peak: (Array.isArray(r['peak']) ? r['peak'] : []).map(obj).map((p) => ({
      start: s(p['start'], '18:00'),
      end: s(p['end'], '21:00'),
      extraPaise: n(p['extraPaise'], 0),
    })),
    slots: {
      cancelHours: n(slots['cancelHours'], d.slots.cancelHours),
      bookDaysAhead: n(slots['bookDaysAhead'], d.slots.bookDaysAhead),
    },
    slotTemplates: templates,
  };
}

/** One example delivery's pay (same formula as the server's earningFor). */
export function examplePay(r: PayRate, straightKm: number): number {
  const distance = Math.round(straightKm * 1.3 * r.perKmPaise);
  return Math.min(r.maxPaise, Math.max(r.minPaise, r.basePaise + distance));
}

/** riderOffers/{id}: an incentive campaign. */
export interface Campaign {
  id: string;
  title: string;
  description: string;
  kind: 'daily_target' | 'weekly_target';
  target: number;
  rewardPaise: number;
  serviceAreaIds: string[];
  startDate: string;
  endDate: string;
  active: boolean;
  updatedAt: Timestamp | null;
}

export function toCampaign(id: string, d: Record<string, unknown>): Campaign {
  return {
    id,
    title: s(d['title'], ''),
    description: s(d['description'], ''),
    kind: d['kind'] === 'weekly_target' ? 'weekly_target' : 'daily_target',
    target: n(d['target'], 10),
    rewardPaise: n(d['rewardPaise'], 10000),
    serviceAreaIds: Array.isArray(d['serviceAreaIds'])
      ? d['serviceAreaIds'].filter((x): x is string => typeof x === 'string')
      : [],
    startDate: s(d['startDate'], ''),
    endDate: s(d['endDate'], ''),
    active: d['active'] !== false,
    updatedAt: d['updatedAt'] instanceof Timestamp ? d['updatedAt'] : null,
  };
}

/** Rupees typed in a form ↔ int paise. */
export const toPaise = (rupees: number | null | undefined) =>
  rupees == null || !Number.isFinite(rupees) ? 0 : Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;
