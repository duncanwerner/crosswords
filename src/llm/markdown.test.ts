import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders markdown, escapes raw HTML, and opens links in a new tab', () => {
    expect(renderMarkdown('**2d** works.\n\n- one\n- two')).toBe('<p><strong>2d</strong> works.</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n');
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img');
    expect(renderMarkdown('see https://example.com')).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">');
  });
});
