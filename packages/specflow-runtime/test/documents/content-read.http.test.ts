import { DocumentError } from '@nevo/specflow-engine';
import type { DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import type { DocumentReadSource } from '../../src/features/documents/content/document-read-source';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

function content(overrides: Partial<DocumentContent> = {}): DocumentContent {
  return {
    id: 'report',
    path: 'report.md',
    title: 'Report',
    classification: 'registered',
    type: 'note',
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    size: 15,
    revision: 'v2',
    editable: true,
    content: 'Current content',
    ...overrides,
  };
}

function tree(revision = 'tree-1'): DocumentTree {
  const not = { available: false, reason: 'not-implemented' } as const;
  return {
    revision,
    archetype: { id: 'minimal', version: 1 },
    folders: [{ path: '', actions: { rename: not, move: not, delete: not } }],
    documents: [],
    dangling: [],
    completeness: { complete: true, requirements: [] },
    capabilities: { createFile: not, createFolder: not, import: not, classify: not, formats: [] },
    issues: [],
    truncated: false,
    skippedEntries: 0,
  };
}

async function app(source: DocumentReadSource) {
  const config = passwordConfig();
  return createRuntimeApp(
    { ...config, authentication: { ...config.authentication, mode: 'none' } },
    { documents: { readSource: source } },
  );
}

describe('GET /api/specs/:specId/documents/:documentId', () => {
  it('serves the DocumentContent and passes ?revision to the source', async () => {
    const seen: (string | undefined)[] = [];
    const server = await app({
      read: (_specId, documentId, revision) => {
        seen.push(revision);
        if (documentId !== 'report') {
          return Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'unknown'));
        }
        return revision && revision !== 'v2'
          ? Promise.reject(new DocumentError('DOCUMENT_REVISION_UNAVAILABLE', 'stale'))
          : Promise.resolve(content());
      },
    });
    try {
      const url = '/api/specs/admission/documents/report';
      const ok = await server.inject(url);
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['cache-control']).toBe('no-store');
      expect(ok.json()).toEqual(content());

      expect((await server.inject(url + '?revision=v2')).statusCode).toBe(200);
      const stale = await server.inject(url + '?revision=v0');
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({
        error: 'DOCUMENT_REVISION_UNAVAILABLE',
        code: 'DOCUMENT_REVISION_UNAVAILABLE',
      });
      expect(seen).toEqual([undefined, 'v2', 'v0']);

      const missing = await server.inject('/api/specs/admission/documents/other');
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' });
      expect(missing.headers['cache-control']).toBe('no-store');

      expect((await server.inject(url + '?revision=')).statusCode).toBe(400);
      expect((await server.inject(url + '?other=1')).statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('answers 404 for a schema-legal 200 character id and 400 above it (never 414)', async () => {
    const server = await app({
      read: () => Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'unknown')),
    });
    try {
      const longest = await server.inject('/api/specs/admission/documents/' + 'a'.repeat(200));
      expect(longest.statusCode).toBe(404);
      expect(longest.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' });
      const tooLong = await server.inject('/api/specs/admission/documents/' + 'a'.repeat(201));
      expect(tooLong.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('omits content when the source has none (image, binary)', async () => {
    const server = await app({
      read: () =>
        Promise.resolve(
          (() => {
            const { content: _omitted, ...image } = content({
              id: 'u-0123456789abcdef0123456789abcdef',
              path: 'pic.png',
              kind: 'image',
              mediaType: 'image/png',
              classification: 'unclassified',
              editable: false,
            });
            delete (image as { type?: string }).type;
            return image;
          })(),
        ),
    });
    try {
      const response = await server.inject(
        '/api/specs/admission/documents/u-0123456789abcdef0123456789abcdef',
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).not.toHaveProperty('content');
      expect(response.json()).toMatchObject({ kind: 'image', classification: 'unclassified' });
    } finally {
      await server.close();
    }
  });

  it.each([
    ['DOCUMENT_TOO_LARGE', 413],
    ['DOCUMENT_FILE_MISSING', 404],
    ['SPEC_SOURCE_UNAVAILABLE', 503],
  ] as const)('maps %s to %i with the {error, code} body', async (code, status) => {
    const server = await app({
      read: () => Promise.reject(new DocumentError(code, 'C:\\secret\\path leaked')),
    });
    try {
      const response = await server.inject('/api/specs/admission/documents/report');
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: code, code });
      expect(response.body).not.toContain('secret');
    } finally {
      await server.close();
    }
  });

  it('rejects an adapter that answers for another document before serializing content', async () => {
    const server = await app({
      read: () => Promise.resolve(content({ id: 'different', content: 'Do not expose' })),
    });
    try {
      const response = await server.inject('/api/specs/admission/documents/report');
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('Do not expose');
    } finally {
      await server.close();
    }
  });

  it('answers a defect with the generic 500 and no detail', async () => {
    const server = await app({ read: () => Promise.reject(new Error('EACCES /etc/secret')) });
    try {
      const response = await server.inject('/api/specs/admission/documents/report');
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('secret');
    } finally {
      await server.close();
    }
  });

  it('is an unavailable source without a document source', async () => {
    const config = passwordConfig();
    const server = await createRuntimeApp({
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
    });
    try {
      const response = await server.inject('/api/specs/admission/documents/report');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: 'SPEC_SOURCE_UNAVAILABLE',
        code: 'SPEC_SOURCE_UNAVAILABLE',
      });
    } finally {
      await server.close();
    }
  });
});

describe('GET /api/specs/:specId/document-tree', () => {
  it('serves the tree with its revision as ETag, no-store, and revalidates with 304', async () => {
    const server = await app({
      read: () => Promise.resolve(content()),
      readTree: () => Promise.resolve(tree()),
    });
    try {
      const url = '/api/specs/admission/document-tree';
      const response = await server.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers.etag).toBe('"tree-1"');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json<DocumentTree>().revision).toBe('tree-1');

      const same = await server.inject({ url, headers: { 'if-none-match': '"tree-1"' } });
      expect(same.statusCode).toBe(304);
      expect(same.headers['content-type']).toBeUndefined();
      expect(same.headers['content-length']).toBeUndefined();
      expect(same.headers.etag).toBe('"tree-1"');
      const weak = await server.inject({ url, headers: { 'if-none-match': 'W/"tree-1"' } });
      expect(weak.statusCode).toBe(304);
      const other = await server.inject({ url, headers: { 'if-none-match': '"tree-0"' } });
      expect(other.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('maps source failures to {error, code} bodies and a missing tree reader to 503', async () => {
    const failing = await app({
      read: () => Promise.resolve(content()),
      readTree: () => Promise.reject(new DocumentError('DOCUMENT_NOT_FOUND', 'unknown')),
    });
    const readOnly = await app({ read: () => Promise.resolve(content()) });
    try {
      const missing = await failing.inject('/api/specs/nope/document-tree');
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' });
      expect((await readOnly.inject('/api/specs/admission/document-tree')).statusCode).toBe(503);
      expect((await failing.inject('/api/specs/invalid%20spec/document-tree')).statusCode).toBe(
        400,
      );
    } finally {
      await failing.close();
      await readOnly.close();
    }
  });
});

describe('authorization of the read routes', () => {
  it('needs authentication and the View capability of the Specification', async () => {
    const config = passwordConfig();
    const store = new InMemoryAuthenticationStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const headers = {
      cookie: authCookieNames(config.server.port).session + '=' + session,
    };
    const source: DocumentReadSource = {
      read: () => Promise.resolve(content()),
      readTree: () => Promise.resolve(tree()),
      open: () => Promise.reject(new Error('must not be reached')),
    };
    const server = await createRuntimeApp(
      {
        ...config,
        authorization: {
          assignments: [{ userId: 'demo-user', role: 'viewer', scope: { specId: 'visible' } }],
        },
      },
      { auth: { store }, documents: { readSource: source } },
    );
    try {
      for (const path of ['/document-tree', '/documents/report', '/documents/report/raw']) {
        expect((await server.inject('/api/specs/visible' + path)).statusCode).toBe(401);
        const hidden = await server.inject({ url: '/api/specs/hidden' + path, headers });
        expect(hidden.statusCode).toBe(403);
        expect(hidden.json()).toEqual({ error: 'forbidden' });
      }
      expect(
        (await server.inject({ url: '/api/specs/visible/document-tree', headers })).statusCode,
      ).toBe(200);
      expect(
        (await server.inject({ url: '/api/specs/visible/documents/report', headers })).statusCode,
      ).toBe(200);
    } finally {
      await server.close();
    }
  });
});
