import { Timestamp } from 'firebase/firestore';

/** Mirrors zyppi-APP functions/src/riders/model.ts. */
export type RiderStatus =
  'draft' | 'submitted' | 'changes_requested' | 'approved' | 'rejected' | 'suspended' | 'deleted';

export type VehicleType = 'bike' | 'scooter' | 'ev_scooter' | 'cycle';
export type DocKey = 'aadhaarFront' | 'aadhaarBack' | 'selfie' | 'drivingLicence' | 'rc';

export const STATUS_META: Record<RiderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'default' },
  submitted: { label: 'To review', color: 'purple' },
  changes_requested: { label: 'Changes asked', color: 'gold' },
  approved: { label: 'Active', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  suspended: { label: 'Suspended', color: 'volcano' },
  // Deleted their account in the app; records kept, personal data removed.
  deleted: { label: 'Deleted', color: 'default' },
};

export const VEHICLES: { value: VehicleType; label: string }[] = [
  { value: 'bike', label: 'Motorbike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'ev_scooter', label: 'Electric scooter' },
  { value: 'cycle', label: 'Bicycle' },
];

export const DOCS: { key: DocKey; label: string; hint: string; motorOnly?: boolean }[] = [
  { key: 'aadhaarFront', label: 'Aadhaar — front', hint: 'You may cover the first 8 digits.' },
  { key: 'aadhaarBack', label: 'Aadhaar — back', hint: 'Address side.' },
  { key: 'selfie', label: 'Selfie', hint: 'Face clearly visible, no sunglasses.' },
  {
    key: 'drivingLicence',
    label: 'Driving licence',
    hint: 'Front side, all text readable.',
    motorOnly: true,
  },
  {
    key: 'rc',
    label: 'Vehicle RC',
    hint: 'Registration certificate of your vehicle.',
    motorOnly: true,
  },
];

export const CHECKLIST: { key: string; label: string }[] = [
  { key: 'idMatches', label: 'Name on Aadhaar matches the application' },
  { key: 'photoMatches', label: 'Selfie matches the Aadhaar photo' },
  { key: 'ageOk', label: 'Age is 18 or above' },
  { key: 'licenceValid', label: 'Driving licence is valid (motor vehicles)' },
  { key: 'rcMatches', label: 'RC matches the vehicle number (motor vehicles)' },
];

export interface Rider {
  uid: string;
  status: RiderStatus;
  fullName: string;
  phone: string;
  dob: string;
  gender: string | null;
  address: string;
  serviceAreaId: string;
  vehicleType: VehicleType | '';
  vehicleNumber: string;
  drivingLicenceNumber: string;
  docs: Partial<Record<DocKey, string>>;
  payout: {
    method: 'upi' | 'bank';
    upiId: string | null;
    accountLast4: string | null;
    ifsc: string | null;
  } | null;
  reviewNote: string | null;
  checklist: Record<string, boolean>;
  deliveredCount: number;
  onTimeCount: number;
  codBalancePaise: number;
  submittedAt: Timestamp | null;
  approvedAt: Timestamp | null;
  lastDeliveredAt: Timestamp | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ts = (v: unknown) => (v instanceof Timestamp ? v : null);

export function toRider(uid: string, d: Record<string, unknown>): Rider {
  return {
    uid,
    status: (str(d['status']) as RiderStatus) || 'draft',
    fullName: str(d['fullName']),
    phone: str(d['phone']),
    dob: str(d['dob']),
    gender: str(d['gender']) || null,
    address: str(d['address']),
    serviceAreaId: str(d['serviceAreaId']),
    vehicleType: (str(d['vehicleType']) as VehicleType) || '',
    vehicleNumber: str(d['vehicleNumber']),
    drivingLicenceNumber: str(d['drivingLicenceNumber']),
    docs: (d['docs'] as Rider['docs']) ?? {},
    payout: (d['payout'] as Rider['payout']) ?? null,
    reviewNote: str(d['reviewNote']) || null,
    checklist: (d['checklist'] as Record<string, boolean>) ?? {},
    deliveredCount: Number(d['deliveredCount']) || 0,
    onTimeCount: Number(d['onTimeCount']) || 0,
    codBalancePaise: Number(d['codBalancePaise']) || 0,
    submittedAt: ts(d['submittedAt']),
    approvedAt: ts(d['approvedAt']),
    lastDeliveredAt: ts(d['lastDeliveredAt']),
  };
}

export const isMotor = (v: VehicleType | '') => v !== 'cycle' && v !== '';

export function vehicleLabel(v: VehicleType | ''): string {
  return VEHICLES.find((x) => x.value === v)?.label ?? '—';
}

export function onTimePercent(r: Pick<Rider, 'deliveredCount' | 'onTimeCount'>): number | null {
  return r.deliveredCount ? Math.round((r.onTimeCount / r.deliveredCount) * 100) : null;
}

/** Same checks as the server, for instant feedback in the portal. */
export function stepProblems(
  a: Partial<Rider> & { payoutInput?: PayoutInput | null },
  step: number,
  now = new Date(),
): string[] {
  const out: string[] = [];
  if (step === 0) {
    if ((a.fullName ?? '').trim().length < 3) out.push('Enter your full name.');
    if (!/^(\+91)?[6-9]\d{9}$/.test((a.phone ?? '').replace(/[\s-]/g, '')))
      out.push('Enter a 10-digit mobile number.');
    const age = ageOn(a.dob ?? '', now);
    if (Number.isNaN(age)) out.push('Enter your date of birth.');
    else if (age < 18) out.push('You must be at least 18.');
    if ((a.address ?? '').trim().length < 10) out.push('Enter your home address.');
    if (!a.serviceAreaId) out.push('Choose where you want to deliver.');
  }
  if (step === 1) {
    if (!a.vehicleType) out.push('Choose your vehicle.');
    if (isMotor(a.vehicleType ?? '')) {
      if (
        !/^[A-Z]{2} ?\d{1,2} ?[A-Z]{0,3} ?\d{1,4}$/.test(
          (a.vehicleNumber ?? '').toUpperCase().trim(),
        )
      ) {
        out.push('Enter the vehicle number, e.g. WB 56 AB 1234.');
      }
      if (!/^[A-Z0-9 -]{10,20}$/.test((a.drivingLicenceNumber ?? '').toUpperCase().trim())) {
        out.push('Enter your driving licence number.');
      }
    }
  }
  if (step === 2) {
    for (const d of DOCS) {
      if (d.motorOnly && !isMotor(a.vehicleType ?? '')) continue;
      if (!a.docs?.[d.key]) out.push(`Upload: ${d.label}.`);
    }
  }
  if (step === 3) {
    const p = a.payoutInput;
    if (!p) out.push('Add how you want to be paid.');
    else if (p.method === 'upi' && !/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(p.upiId.trim())) {
      out.push('Enter a valid UPI ID, e.g. name@okaxis.');
    } else if (p.method === 'bank') {
      if (p.accountName.trim().length < 3) out.push('Enter the account holder name.');
      if (!/^\d{9,18}$/.test(p.accountNumber.replace(/\s/g, '')))
        out.push('Account number must be 9–18 digits.');
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.ifsc.toUpperCase().trim()))
        out.push('Enter a valid IFSC, e.g. SBIN0001234.');
    }
  }
  return out;
}

export interface PayoutInput {
  method: 'upi' | 'bank';
  upiId: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

export function ageOn(dob: string, now = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return Number.NaN;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) return Number.NaN;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
  )
    age--;
  return age;
}
