import { legalMarkdownToHtml } from './legal-markdown';

describe('legalMarkdownToHtml', () => {
  it('renders headings, lists and emphasis', () => {
    const html = legalMarkdownToHtml(
      '# Title\n\nSome **bold** text\nwraps.\n\n- one\n- two\n\n1. first',
    );
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<p>Some <strong>bold</strong> text wraps.</p>');
    expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(html).toContain('<ol>\n<li>first</li>\n</ol>');
  });

  it('escapes HTML so nothing in a document can run', () => {
    const html = legalMarkdownToHtml('<script>alert(1)</script> & <img src=x onerror=y>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
