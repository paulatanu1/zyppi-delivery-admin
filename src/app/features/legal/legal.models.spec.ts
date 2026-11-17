import { draftProblems, findPlaceholders } from './legal.models';

const ok = {
  title: 'Customer terms',
  body: { en: 'x'.repeat(60), bn: '', hi: '', pa: '' },
  requiresReaccept: false,
};

describe('legal drafts', () => {
  it('can be published when complete', () => {
    expect(draftProblems(ok)).toEqual([]);
  });

  it('are blocked by placeholders, a missing title or English text', () => {
    expect(findPlaceholders('Run by [COMPANY LEGAL NAME] at [ADDRESS].')).toEqual([
      '[COMPANY LEGAL NAME]',
      '[ADDRESS]',
    ]);
    expect(
      draftProblems({ ...ok, body: { ...ok.body, hi: 'by [COMPANY LEGAL NAME]' } })[0],
    ).toContain('placeholders');
    expect(draftProblems({ ...ok, title: '' })).toHaveLength(1);
    expect(draftProblems({ ...ok, body: { ...ok.body, en: 'short' } })).toHaveLength(1);
  });
});
