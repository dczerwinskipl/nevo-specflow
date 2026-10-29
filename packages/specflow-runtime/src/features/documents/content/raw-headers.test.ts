import { describe, expect, it } from 'vitest';

import {
  RAW_CONTENT_SECURITY_POLICY,
  encodeDispositionFilename,
  rawNotModifiedHeaders,
  rawResponseHeaders,
  safeMediaType,
} from './raw-headers';

type Meta = Parameters<typeof rawResponseHeaders>[0]['metadata'];

function meta(overrides: Partial<Meta> = {}): Meta {
  return {
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    filename: 'notes.md',
    revision: 'rev-1',
    size: 12,
    ...overrides,
  };
}

describe('rawResponseHeaders', () => {
  it.each([
    ['png', { kind: 'image', mediaType: 'image/png', filename: 'p.png' }, 'image/png', 'inline'],
    [
      'svg',
      { kind: 'image', mediaType: 'image/svg+xml', filename: 'v.svg' },
      'image/svg+xml',
      'inline',
    ],
    [
      'zip',
      { kind: 'binary', mediaType: 'application/octet-stream', filename: 'a.zip' },
      'application/octet-stream',
      "attachment; filename*=UTF-8''a.zip",
    ],
    [
      'markdown',
      { kind: 'text', mediaType: 'text/markdown; charset=utf-8', filename: 'n.md' },
      'text/markdown; charset=utf-8',
      'inline',
    ],
    [
      'html',
      { kind: 'text', mediaType: 'text/plain; charset=utf-8', filename: 'p.html' },
      'text/plain; charset=utf-8',
      'inline',
    ],
    [
      'markdown with NUL (binary)',
      { kind: 'binary', mediaType: 'application/octet-stream', filename: 'n.md' },
      'application/octet-stream',
      "attachment; filename*=UTF-8''n.md",
    ],
  ] as const)('sets the header table for %s', (_name, overrides, contentType, disposition) => {
    const headers = rawResponseHeaders({ metadata: meta(overrides), download: false });
    expect(headers).toEqual({
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Content-Disposition': disposition,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'private, no-cache',
      ETag: '"rev-1"',
      'Content-Length': '12',
    });
  });

  it('turns every kind into an attachment with download=1', () => {
    for (const kind of ['text', 'image', 'binary'] as const) {
      const headers = rawResponseHeaders({ metadata: meta({ kind }), download: true });
      expect(headers['Content-Disposition']).toBe("attachment; filename*=UTF-8''notes.md");
    }
  });

  it('keeps the sandbox policy that stops script in an svg', () => {
    expect(RAW_CONTENT_SECURITY_POLICY).toContain('sandbox');
    expect(RAW_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(RAW_CONTENT_SECURITY_POLICY).not.toContain('script-src');
  });
});

describe('safeMediaType', () => {
  it('never lets an HTML or XML media type through, whatever the source says', () => {
    for (const mediaType of [
      'text/html',
      'text/html; charset=utf-8',
      'application/xhtml+xml',
      'application/xml',
      'text/xml',
      'image/svg+xml; charset=utf-8',
      'application/javascript',
    ]) {
      expect(safeMediaType({ kind: 'text', mediaType })).toBe('text/plain; charset=utf-8');
      expect(safeMediaType({ kind: 'binary', mediaType })).toBe('application/octet-stream');
    }

    expect(safeMediaType({ kind: 'image', mediaType: 'text/html' })).toBe(
      'application/octet-stream',
    );
  });
});

describe('encodeDispositionFilename', () => {
  it.each([
    ['plain.md', 'plain.md'],
    ['zażółć gęślą.md', 'za%C5%BC%C3%B3%C5%82%C4%87%20g%C4%99%C5%9Bl%C4%85.md'],
    ['a"b.md', 'a%22b.md'],
    ["a'b(1)*!.md", 'a%27b%281%29%2A%21.md'],
    ['a;b=c.md', 'a%3Bb%3Dc.md'],
    ['a\r\nSet-Cookie: x=1.md', 'a%0D%0ASet-Cookie%3A%20x%3D1.md'],
    ['a/b\\c.md', 'a%2Fb%5Cc.md'],
    ['100%.md', '100%25.md'],
    ['', 'download'],
  ])('encodes %j', (input, expected) => {
    expect(encodeDispositionFilename(input)).toBe(expected);
  });

  it('cannot split a header whatever the file is called', () => {
    for (const name of ['x\r\nX-Evil: 1', 'x\ny', 'x y', 'x\0y', '"; filename="evil.html']) {
      const value = rawResponseHeaders({
        metadata: meta({ kind: 'binary', filename: name }),
        download: false,
      })['Content-Disposition']!;
      expect(value).toMatch(/^attachment; filename\*=UTF-8''[A-Za-z0-9._~%-]*$/u);
    }
  });

  it('replaces a lone surrogate instead of throwing', () => {
    expect(encodeDispositionFilename('a\uD800b')).toBe('a%EF%BF%BDb');
  });
});

describe('rawNotModifiedHeaders', () => {
  it('carries the validators and protections but no entity headers', () => {
    expect(rawNotModifiedHeaders('rev-1')).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'private, no-cache',
      ETag: '"rev-1"',
    });
  });
});
