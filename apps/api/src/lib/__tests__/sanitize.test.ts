import { describe, expect, it } from 'vitest';

import { sanitizeHtml } from '../sanitize';

describe('sanitizeHtml', () => {
  it('should allow basic formatting tags', () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<strong>Bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<p>');
  });

  it('should allow links with href', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('<a');
  });

  it('should allow list elements', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('should strip script tags', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Safe</p>');
  });

  it('should strip event handler attributes', () => {
    const input = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).toContain('<p>Click me</p>');
  });

  it('should strip iframe tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe');
  });

  it('should strip img tags (not in allowlist)', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
  });

  it('should strip style tags', () => {
    const input = '<style>body { display: none; }</style><p>Content</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<style');
    expect(result).toContain('<p>Content</p>');
  });

  it('should handle empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('should handle plain text without tags', () => {
    const input = 'Just plain text';
    expect(sanitizeHtml(input)).toBe('Just plain text');
  });

  it('should strip disallowed attributes from allowed tags', () => {
    const input = '<p class="danger" style="color:red">Text</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('class=');
    expect(result).not.toContain('style=');
    expect(result).toContain('<p>Text</p>');
  });
});
