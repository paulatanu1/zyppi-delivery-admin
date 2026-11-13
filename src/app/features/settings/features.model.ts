import { Timestamp } from 'firebase/firestore';

/**
 * Mirror of zyppi-APP functions/src/shared/features.ts (config/features).
 * A missing field means ON, exactly as the server reads it.
 */
export interface Features {
  placesSearch: boolean;
  supportBot: boolean;
  phoneOtp: boolean;
  payments: { upi: boolean; card: boolean };
  maintenance: { enabled: boolean; message: string };
  closedAreaIds: string[];
  minAppVersion: string | null;
}

export interface FeaturesDoc extends Features {
  updatedAt: Timestamp | null;
  updatedBy: string | null;
}

export type FeaturesPatch = Partial<
  Omit<Features, 'payments' | 'maintenance'> & {
    payments: Partial<Features['payments']>;
    maintenance: Partial<Features['maintenance']>;
  }
>;

export const MAX_MAINTENANCE_MESSAGE = 300;
export const VERSION_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function parseFeatures(raw: Record<string, unknown> | undefined): FeaturesDoc {
  const r = raw ?? {};
  const payments = (r['payments'] ?? {}) as Record<string, unknown>;
  const maintenance = (r['maintenance'] ?? {}) as Record<string, unknown>;
  const version = r['minAppVersion'];
  return {
    placesSearch: bool(r['placesSearch'], true),
    supportBot: bool(r['supportBot'], true),
    phoneOtp: bool(r['phoneOtp'], true),
    payments: { upi: bool(payments['upi'], true), card: bool(payments['card'], true) },
    maintenance: {
      enabled: bool(maintenance['enabled'], false),
      message: typeof maintenance['message'] === 'string' ? maintenance['message'] : '',
    },
    closedAreaIds: Array.isArray(r['closedAreaIds'])
      ? r['closedAreaIds'].filter((x): x is string => typeof x === 'string')
      : [],
    minAppVersion: typeof version === 'string' && VERSION_PATTERN.test(version) ? version : null,
    updatedAt: r['updatedAt'] instanceof Timestamp ? r['updatedAt'] : null,
    updatedBy: typeof r['updatedBy'] === 'string' ? r['updatedBy'] : null,
  };
}

/** One switch card on the Services page. */
export interface ServiceSwitch {
  id: 'placesSearch' | 'supportBot' | 'phoneOtp' | 'upi' | 'card';
  title: string;
  icon: string;
  whenOff: string;
  saves: string;
}

export const SERVICE_SWITCHES: ServiceSwitch[] = [
  {
    id: 'placesSearch',
    title: 'Google Places address search',
    icon: 'pi pi-map-marker',
    whenOff: 'Customers find their address with GPS and the phone’s own geocoder.',
    saves: 'Places API bill (charged per search)',
  },
  {
    id: 'supportBot',
    title: 'Support chatbot',
    icon: 'pi pi-comments',
    whenOff: 'New chat messages go straight to the support team.',
    saves: '1 GiB function time and model downloads on cold start',
  },
  {
    id: 'phoneOtp',
    title: 'Phone OTP sign-in',
    icon: 'pi pi-mobile',
    whenOff: 'The app offers Google and guest sign-in only (needs the app update).',
    saves: 'SMS charges per OTP',
  },
  {
    id: 'upi',
    title: 'UPI payments (PayU)',
    icon: 'pi pi-qrcode',
    whenOff: 'UPI is refused at checkout; card and cash on delivery still work.',
    saves: 'PayU UPI transaction fees',
  },
  {
    id: 'card',
    title: 'Card payments (PayU)',
    icon: 'pi pi-credit-card',
    whenOff: 'Cards are refused at checkout; UPI and cash on delivery still work.',
    saves: 'PayU card transaction fees',
  },
];

export function switchValue(f: Features, id: ServiceSwitch['id']): boolean {
  return id === 'upi' || id === 'card' ? f.payments[id] : f[id];
}

export function switchPatch(id: ServiceSwitch['id'], on: boolean): FeaturesPatch {
  return id === 'upi' || id === 'card' ? { payments: { [id]: on } } : { [id]: on };
}
