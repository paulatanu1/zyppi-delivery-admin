import { Timestamp } from 'firebase/firestore';

/** supportChats/{uid}_{orderId|general} (zyppi-APP functions/src/support). */
export type ChatStatus = 'bot' | 'waiting_agent' | 'agent' | 'closed';

export const CHAT_META: Record<ChatStatus, { label: string; color: string }> = {
  waiting_agent: { label: 'Waiting for you', color: 'red' },
  agent: { label: 'With the team', color: 'blue' },
  bot: { label: 'With the bot', color: 'default' },
  closed: { label: 'Closed', color: 'default' },
};

export interface Chat {
  id: string;
  userId: string;
  orderId: string | null;
  status: ChatStatus;
  lang: string;
  lastMessage: string | null;
  unreadByAgent: number;
  updatedAt: Timestamp | null;
  handoffAt: Timestamp | null;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'bot' | 'agent' | 'system';
  text: string;
  createdAt: Timestamp | null;
  quickReplies: string[];
}

const ts = (v: unknown) => (v instanceof Timestamp ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function toChat(id: string, d: Record<string, unknown>): Chat {
  const status = str(d['status']) as ChatStatus;
  return {
    id,
    userId: str(d['userId']),
    orderId: typeof d['orderId'] === 'string' && d['orderId'] ? d['orderId'] : null,
    status: status in CHAT_META ? status : 'bot',
    lang: str(d['lang']) || 'en',
    lastMessage: typeof d['lastMessage'] === 'string' ? d['lastMessage'] : null,
    unreadByAgent: Number(d['unreadByAgent']) || 0,
    updatedAt: ts(d['updatedAt']),
    handoffAt: ts(d['handoffAt']),
  };
}

export function toMessage(id: string, d: Record<string, unknown>): ChatMessage {
  const from = str(d['from']);
  const replies = Array.isArray(d['quickReplies']) ? d['quickReplies'] : [];
  return {
    id,
    from: from === 'user' || from === 'bot' || from === 'agent' ? from : 'system',
    text: str(d['text']),
    createdAt: ts(d['createdAt']),
    quickReplies: replies
      .map((r) => (r && typeof r === 'object' ? str((r as Record<string, unknown>)['label']) : ''))
      .filter(Boolean),
  };
}

const RANK: Record<ChatStatus, number> = { waiting_agent: 0, agent: 1, bot: 2, closed: 3 };

/** Waiting customers first (longest wait on top), then the latest activity. */
export function inboxOrder(a: Chat, b: Chat): number {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
  if (a.status === 'waiting_agent') {
    return (a.handoffAt?.toMillis() ?? 0) - (b.handoffAt?.toMillis() ?? 0);
  }
  return (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0);
}

/** "12 min" / "3 h" / "2 d" since a moment. */
export function waitedFor(since: Timestamp | null, nowMs = Date.now()): string {
  if (!since) return '';
  const min = Math.max(0, Math.round((nowMs - since.toMillis()) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

// ------------------------------------------------------------ knowledge base

export const KB_LANGS = ['en', 'bn', 'hi', 'pa'] as const;
export type KbLang = (typeof KB_LANGS)[number];
export const KB_LANG_NAMES: Record<KbLang, string> = {
  en: 'English',
  bn: 'বাংলা',
  hi: 'हिन्दी',
  pa: 'ਪੰਜਾਬੀ',
};
export type KbAction = 'none' | 'order_status' | 'handoff';
export const KB_ACTIONS: { value: KbAction; label: string }[] = [
  { value: 'none', label: 'Just answer' },
  { value: 'order_status', label: 'Show the order status' },
  { value: 'handoff', label: 'Answer, then connect to the team' },
];

/** Matches functions/src/support/kb/types.ts (vectors left out). */
export interface KbEntry {
  id: string;
  action: KbAction;
  title: Record<KbLang, string>;
  questions: Record<KbLang, string[]>;
  answers: Record<KbLang, string>;
  keywords: string[];
  related: string[];
  hidden: boolean;
  updatedAt: Timestamp | null;
}

function perLang<T>(v: unknown, f: (x: unknown) => T): Record<KbLang, T> {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(KB_LANGS.map((l) => [l, f(o[l])])) as Record<KbLang, T>;
}

const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function toKbEntry(id: string, d: Record<string, unknown>): KbEntry {
  const action = str(d['action']) as KbAction;
  return {
    id,
    action: KB_ACTIONS.some((a) => a.value === action) ? action : 'none',
    title: perLang(d['title'], str),
    questions: perLang(d['questions'], list),
    answers: perLang(d['answers'], str),
    keywords: list(d['keywords']),
    related: list(d['related']),
    hidden: d['hidden'] === true,
    updatedAt: ts(d['updatedAt']),
  };
}

export function emptyKbEntry(): KbEntry {
  return toKbEntry('', {});
}

/** "lowercase_with_underscores" from a title, for new entries. */
export function kbIdFrom(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

/** Questions are edited one per line. */
export const linesOf = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
