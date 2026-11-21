import { KB_ACTIONS, KB_LANGS, KbEntry, KbLang } from './support.models';

/** One entry from an import file, checked against what adminSaveKbEntry accepts. */
export interface KbImportRow {
  entry: Omit<KbEntry, 'updatedAt'>;
  /** Already in supportKb: saving replaces it. */
  exists: boolean;
  /** Why it can't be imported; null when it's fine. */
  problem: string | null;
}

const ID = /^[a-z0-9_]{2,40}$/;
const MAX_ENTRIES = 200;
/** Left in the docs for values the team must confirm (chatbot-knowledge-base/). */
const VERIFY_MARKER = '[VERIFY_CONFIG';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

function perLang<T>(v: unknown, f: (x: unknown) => T): Record<KbLang, T> {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(KB_LANGS.map((l) => [l, f(o[l])])) as Record<KbLang, T>;
}

/** The first rule of functions/src/support/kb/admin.ts validateKbEntry that fails. */
export function kbEntryProblem(e: Omit<KbEntry, 'updatedAt'>): string | null {
  if (!ID.test(e.id)) return 'Id: 2–40 lowercase letters, digits or _';
  if (!KB_ACTIONS.some((a) => a.value === e.action)) return 'Invalid action';
  for (const l of KB_LANGS) {
    const t = e.title[l];
    if (t.length < 2 || t.length > 80) return `${l} title: 2–80 characters`;
    if (e.questions[l].length > 20) return `${l}: at most 20 questions`;
    if (e.questions[l].some((q) => q.length > 200)) return `${l}: questions up to 200 characters`;
    if (e.answers[l].length > 1500) return `${l} answer: at most 1500 characters`;
    if (e.action !== 'order_status' && e.answers[l].length < 2) return `${l} answer is missing`;
  }
  if (e.questions.en.length === 0) return 'Add at least one English example question';
  if (e.keywords.length > 30 || e.keywords.some((k) => k.length > 40)) {
    return 'Keywords: at most 30, each up to 40 characters';
  }
  if (e.related.length > 6) return 'At most 6 related entries';
  const text = KB_LANGS.flatMap((l) => [e.title[l], e.answers[l], ...e.questions[l]]).join(' ');
  if (text.includes(VERIFY_MARKER)) return 'Still has a [VERIFY_CONFIG] placeholder';
  return null;
}

/**
 * Parses a supportKb-import.json file (an array of entries). Throws a readable
 * error when the file itself is unusable; per-entry problems go on the rows.
 */
export function parseKbImport(text: string, existingIds: ReadonlySet<string>): KbImportRow[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array of entries.');
  if (raw.length === 0) throw new Error('The file has no entries.');
  if (raw.length > MAX_ENTRIES) throw new Error(`Up to ${MAX_ENTRIES} entries per file.`);

  const seen = new Set<string>();
  return raw.map((item): KbImportRow => {
    const d = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const action = str(d['action']) as KbEntry['action'];
    const entry: Omit<KbEntry, 'updatedAt'> = {
      id: str(d['id']),
      action,
      hidden: d['hidden'] === true,
      title: perLang(d['title'], str),
      questions: perLang(d['questions'], (v) => [...new Set(list(v))]),
      answers: perLang(d['answers'], str),
      keywords: [...new Set(list(d['keywords']).map((k) => k.toLowerCase()))],
      related: list(d['related']),
    };
    let problem = kbEntryProblem(entry);
    if (!problem && seen.has(entry.id)) problem = 'Same id appears twice in the file';
    seen.add(entry.id);
    return { entry, exists: existingIds.has(entry.id), problem };
  });
}

/**
 * Drops related ids that will exist neither in supportKb nor in this import,
 * so a partial import doesn't save dangling links.
 */
export function pruneRelated(
  rows: readonly KbImportRow[],
  existingIds: ReadonlySet<string>,
): KbImportRow[] {
  const ok = new Set([...existingIds, ...rows.filter((r) => !r.problem).map((r) => r.entry.id)]);
  return rows.map((r) => ({
    ...r,
    entry: {
      ...r.entry,
      related: r.entry.related.filter((id) => id !== r.entry.id && ok.has(id)),
    },
  }));
}
