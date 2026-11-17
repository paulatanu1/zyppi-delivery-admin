export const LEGAL_TYPES = [
  'customer_terms',
  'privacy_policy',
  'refund_policy',
  'rider_agreement',
  'seller_agreement',
] as const;
export type LegalType = (typeof LEGAL_TYPES)[number];

export const LEGAL_LANGS = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'pa', label: 'ਪੰਜਾਬੀ' },
] as const;
export type LegalLang = (typeof LEGAL_LANGS)[number]['value'];

export const LEGAL_META: Record<LegalType, { label: string; who: string }> = {
  customer_terms: { label: 'Customer terms', who: 'Customer app, at sign-in' },
  privacy_policy: { label: 'Privacy policy', who: 'Every app and the rider portal' },
  refund_policy: { label: 'Refund policy', who: 'Customer app' },
  rider_agreement: { label: 'Rider agreement', who: 'Rider portal, signed with OTP' },
  seller_agreement: { label: 'Seller agreement', who: 'Seller app, signed with OTP' },
};

export interface LegalHead {
  type: LegalType;
  title: string;
  currentVersion: number | null;
  minVersion: number | null;
  updatedAtMs: number | null;
}

export interface LegalDraft {
  title: string;
  body: Record<LegalLang, string>;
  requiresReaccept: boolean;
}

/** Template gaps like [COMPANY LEGAL NAME] a lawyer must fill (same rule as functions/src/legal/model.ts). */
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(/\[[A-Z][A-Z0-9 ]{1,40}\]/g) ?? [])];
}

/** What blocks publishing; empty means it can go out. */
export function draftProblems(d: LegalDraft): string[] {
  const out: string[] = [];
  if (d.title.trim().length < 3) out.push('Give it a title (3+ characters).');
  if (d.body.en.trim().length < 50) out.push('The English text is too short.');
  for (const l of LEGAL_LANGS) {
    if (d.body[l.value].length > 200_000)
      out.push(`The ${l.label} text is longer than 200,000 characters.`);
  }
  const gaps = findPlaceholders(Object.values(d.body).join('\n'));
  if (gaps.length) out.push(`Fill the placeholders first: ${gaps.slice(0, 5).join(', ')}`);
  return out;
}
