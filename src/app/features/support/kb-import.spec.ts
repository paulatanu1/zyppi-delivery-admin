import { parseKbImport, pruneRelated } from './kb-import';

const per = <T>(v: T) => ({ en: v, bn: v, hi: v, pa: v });

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'cod',
    action: 'none',
    title: per('Cash on delivery'),
    questions: { en: ['Is COD available?', 'Is COD available?'], bn: [], hi: [], pa: [] },
    answers: per('Yes, pay at your door.'),
    keywords: ['COD', 'cash'],
    related: ['wallet'],
    ...over,
  };
}

describe('kb-import', () => {
  it('reads entries, marking new vs update and tidying lists', () => {
    const rows = parseKbImport(JSON.stringify([entry(), entry({ id: 'tip' })]), new Set(['tip']));
    expect(rows.map((r) => [r.entry.id, r.exists, r.problem])).toEqual([
      ['cod', false, null],
      ['tip', true, null],
    ]);
    expect(rows[0].entry.questions.en).toEqual(['Is COD available?']);
    expect(rows[0].entry.keywords).toEqual(['cod', 'cash']);
    expect(rows[0].entry.hidden).toBe(false);
  });

  it('flags what the server would reject, plus unresolved placeholders', () => {
    const rows = parseKbImport(
      JSON.stringify([
        entry({ id: 'Bad Id' }),
        entry({ action: 'shout' }),
        entry({ title: { ...per('Cash'), pa: '' } }),
        entry({ questions: per([]) }),
        entry({ answers: { ...per('ok answer'), hi: '' } }),
        entry({ answers: per('Fee is [VERIFY_CONFIG: config/delivery.feePaise]') }),
        entry({ id: 'where_is_order', action: 'order_status', answers: per('') }),
        entry({ id: 'where_is_order', action: 'order_status', answers: per('') }),
      ]),
      new Set(),
    );
    expect(rows.map((r) => r.problem)).toEqual([
      'Id: 2–40 lowercase letters, digits or _',
      'Invalid action',
      'pa title: 2–80 characters',
      'Add at least one English example question',
      'hi answer is missing',
      'Still has a [VERIFY_CONFIG] placeholder',
      null,
      'Same id appears twice in the file',
    ]);
  });

  it('rejects files that are not an entry array', () => {
    expect(() => parseKbImport('{oops', new Set())).toThrow('valid JSON');
    expect(() => parseKbImport('{}', new Set())).toThrow('array');
    expect(() => parseKbImport('[]', new Set())).toThrow('no entries');
  });

  it('drops related links to entries that will not exist', () => {
    const rows = parseKbImport(
      JSON.stringify([
        entry({ related: ['wallet', 'tip', 'gone', 'cod'] }),
        entry({ id: 'tip', related: [] }),
        entry({ id: 'bad', action: 'x' }),
      ]),
      new Set(['wallet']),
    );
    const pruned = pruneRelated(rows, new Set(['wallet']));
    expect(pruned[0].entry.related).toEqual(['wallet', 'tip']);
  });
});
