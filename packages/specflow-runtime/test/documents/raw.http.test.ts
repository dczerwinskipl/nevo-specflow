import { request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';

import { DocumentError, type OpenedDocument } from '@nevo/specflow-engine';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentReadSource } from '../../src/features/documents/content/document-read-source';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

interface Served {
  readonly source: DocumentReadSource;
  readonly streams: Readable[];
}

function serving(
  files: Record<
    string,
    { metadata: Partial<OpenedDocument['metadata']>; bytes: Buffer | (() => Readable) }
  >,
): Served {
  const streams: Readable[] = [];

  return {
    streams,
    source: {
      read: () => Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'unused')),
      open: (specId, documentId) => {
        const file = files[documentId];
        if (!file) {
          return Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'unknown'));
        }

        const size = typeof file.bytes === 'function' ? 1024 * 1024 : file.bytes.length;
        const stream =
          typeof file.bytes === 'function' ? file.bytes() : Readable.from([file.bytes]);
        streams.push(stream);

        return Promise.resolve({
          metadata: {
            specId,
            id: documentId,
            path: documentId,
            filename: documentId,
            classification: 'registered',
            kind: 'text',
            mediaType: 'text/plain; charset=utf-8',
            size,
            revision: 'rev-' + documentId,
            ...file.metadata,
          },
          stream,
        });
      },
    },
  };
}

async function app(source: DocumentReadSource) {
  const config = passwordConfig();

  return createRuntimeApp(
    { ...config, authentication: { ...config.authentication, mode: 'none' } },
    { documents: { readSource: source } },
  );
}

const URL = (id: string, query = '') => `/api/specs/admission/documents/${id}/raw${query}`;

describe('GET /api/specs/:specId/documents/:documentId/raw', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  const files = {
    'pic.png': { metadata: { kind: 'image', mediaType: 'image/png' }, bytes: png },
    'vector.svg': { metadata: { kind: 'image', mediaType: 'image/svg+xml' }, bytes: svg },
    'bundle.zip': {
      metadata: { kind: 'binary', mediaType: 'application/octet-stream' },
      bytes: Buffer.from('PK'),
    },
    'notes.md': {
      metadata: { kind: 'text', mediaType: 'text/markdown; charset=utf-8' },
      bytes: Buffer.from('# hi\n'),
    },
    'page.html': {
      metadata: { kind: 'text', mediaType: 'text/plain; charset=utf-8' },
      bytes: Buffer.from('<script>x</script>'),
    },
    'nul.md': {
      metadata: { kind: 'binary', mediaType: 'application/octet-stream' },
      bytes: Buffer.from([35, 0, 97]),
    },
  } as const;

  it.each([
    ['pic.png', 'image/png', 'inline'],
    ['vector.svg', 'image/svg+xml', 'inline'],
    ['bundle.zip', 'application/octet-stream', "attachment; filename*=UTF-8''bundle.zip"],
    ['notes.md', 'text/markdown; charset=utf-8', 'inline'],
    ['page.html', 'text/plain; charset=utf-8', 'inline'],
    ['nul.md', 'application/octet-stream', "attachment; filename*=UTF-8''nul.md"],
  ])('serves %s with the safe header set', async (id, contentType, disposition) => {
    const served = serving({ ...files });
    const server = await app(served.source);
    try {
      const response = await server.inject(URL(id));
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe(contentType);
      expect(response.headers['content-disposition']).toBe(disposition);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(response.headers['cache-control']).toBe('private, no-cache');
      expect(response.headers.etag).toBe(`"rev-${id}"`);
      expect(response.headers['content-length']).toBe(
        String(files[id as keyof typeof files].bytes.length),
      );
      expect(response.rawPayload.equals(files[id as keyof typeof files].bytes)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('serves an svg as an image with the sandbox policy, never as html', async () => {
    const server = await app(serving({ 'vector.svg': files['vector.svg'] }).source);
    try {
      const response = await server.inject(URL('vector.svg'));
      expect(response.headers['content-type']).toBe('image/svg+xml');
      expect(response.headers['content-type']).not.toMatch(/html/u);
      expect(response.headers['content-security-policy']).toContain('sandbox');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    } finally {
      await server.close();
    }
  });

  it('turns any kind into an attachment with download=1 and ignores nothing else', async () => {
    const server = await app(serving({ ...files }).source);
    try {
      for (const id of ['pic.png', 'notes.md', 'vector.svg']) {
        const response = await server.inject(URL(id, '?download=1'));
        expect(response.headers['content-disposition']).toBe(`attachment; filename*=UTF-8''${id}`);
      }

      const inline = await server.inject(URL('notes.md', '?download=0'));
      expect(inline.headers['content-disposition']).toBe('inline');
      expect((await server.inject(URL('notes.md', '?download=yes'))).statusCode).toBe(400);
      expect((await server.inject(URL('notes.md', '?other=1'))).statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('cannot be made to split a header by a hostile file name', async () => {
    const hostile = 'a"\r\nSet-Cookie: x=1; ż.bin';
    const server = await app(
      serving({
        hostile: {
          metadata: { kind: 'binary', mediaType: 'application/octet-stream', filename: hostile },
          bytes: Buffer.from('x'),
        },
      }).source,
    );
    try {
      const response = await server.inject(URL('hostile'));
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['content-disposition']).toBe(
        "attachment; filename*=UTF-8''a%22%0D%0ASet-Cookie%3A%20x%3D1%3B%20%C5%BC.bin",
      );
    } finally {
      await server.close();
    }
  });

  it('answers 304 to a matching If-None-Match and releases the stream', async () => {
    const served = serving({ 'notes.md': files['notes.md'] });
    const server = await app(served.source);
    try {
      const match = await server.inject({
        url: URL('notes.md'),
        headers: { 'if-none-match': '"rev-notes.md"' },
      });
      expect(match.statusCode).toBe(304);
      expect(match.headers.etag).toBe('"rev-notes.md"');
      expect(match.headers['x-content-type-options']).toBe('nosniff');
      expect(match.headers['content-disposition']).toBeUndefined();
      expect(served.streams[0]!.destroyed).toBe(true);

      const other = await server.inject({
        url: URL('notes.md'),
        headers: { 'if-none-match': '"stale"' },
      });
      expect(other.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it.each([
    ['DOCUMENT_TOO_LARGE', 413],
    ['DOCUMENT_FILE_MISSING', 404],
    ['DOCUMENT_NOT_FOUND', 404],
    ['SPEC_SOURCE_UNAVAILABLE', 503],
  ] as const)('maps %s to %i before any byte is sent', async (code, status) => {
    const server = await app({
      read: () => Promise.reject(new Error('unused')),
      open: () => Promise.reject(new DocumentError(code, '/abs/path/leak')),
    });
    try {
      const response = await server.inject(URL('anything'));
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: code, code });
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.body).not.toContain('leak');
    } finally {
      await server.close();
    }
  });

  it('is an unavailable source when the source cannot open files', async () => {
    const server = await app({ read: () => Promise.reject(new Error('unused')) });
    try {
      expect((await server.inject(URL('x'))).statusCode).toBe(503);
    } finally {
      await server.close();
    }
  });

  it('destroys the stream when the client aborts mid-transfer', async () => {
    let produced = 0;
    const endless = (): Readable =>
      new Readable({
        read() {
          produced += 1;
          this.push(Buffer.alloc(16 * 1024, 1));
        },
      });
    const served = serving({
      big: {
        metadata: {
          kind: 'binary',
          mediaType: 'application/octet-stream',
          size: 1024 * 1024 * 1024,
        },
        bytes: endless,
      },
    });
    const server = await app(served.source);
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('No address');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          { host: '127.0.0.1', port: address.port, path: URL('big') },
          (res) => {
            res.once('data', () => {
              req.destroy();
              resolve();
            });
          },
        );
        req.on('error', () => undefined);
        req.on('close', () => undefined);
        req.end();
        setTimeout(() => reject(new Error('No data received.')), 5000);
      });
      await vi.waitFor(() => expect(served.streams[0]!.destroyed).toBe(true), { timeout: 5000 });
      expect(produced).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('releases the stream for a HEAD request too', async () => {
    const served = serving({ 'notes.md': files['notes.md'] });
    const server = await app(served.source);
    try {
      const response = await server.inject({ method: 'HEAD', url: URL('notes.md') });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      await vi.waitFor(() => expect(served.streams[0]!.destroyed).toBe(true), { timeout: 2000 });
    } finally {
      await server.close();
    }
  });

  it('sends no body on the wire for a 304', async () => {
    const served = serving({ 'notes.md': files['notes.md'] });
    const server = await app(served.source);
    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('No address');
    }

    try {
      const headers: Record<string, string | string[] | undefined> = {};
      const body = await new Promise<string>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port: address.port,
            path: URL('notes.md'),
            headers: { 'if-none-match': '"rev-notes.md"' },
          },
          (res) => {
            Object.assign(headers, res.headers);
            let text = '';
            res.on('data', (chunk: Buffer) => (text += chunk.toString()));
            res.on('end', () => resolve(`${res.statusCode}:${text}`));
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(body).toBe('304:');
      // No entity headers: the placeholder body must not leak a JSON type or a length of 4.
      expect(headers['content-type']).toBeUndefined();
      expect(headers['content-length']).toBeUndefined();
      expect(headers.etag).toBe('"rev-notes.md"');
    } finally {
      await server.close();
    }
  });
});
