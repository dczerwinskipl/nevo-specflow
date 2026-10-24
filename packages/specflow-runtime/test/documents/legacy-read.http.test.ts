import { describe, expect, it } from 'vitest';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
describe('Documents versioned content HTTP', () => {
  it('keeps exact v1 distinct from latest v2 and never substitutes a missing historical body', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      {
        documents: {
          source: {
            read: (specId, id, revision) =>
              Promise.resolve(
                id !== 'report'
                  ? { kind: 'not_found' }
                  : revision && revision !== 'v1' && revision !== 'v2'
                    ? { kind: 'revision_unavailable' }
                    : {
                        kind: 'ok',
                        document: {
                          specId,
                          id,
                          title: 'Report',
                          content: revision === 'v1' ? 'Historical content' : 'Current content',
                          revision: revision ?? 'v2',
                        },
                      },
              ),
          },
        },
      },
    );
    try {
      const url = '/api/specs/admission/documents/report';
      expect((await app.inject(url)).json()).toMatchObject({
        content: 'Current content',
        revision: 'v2',
      });
      const old = await app.inject(url + '?revision=v1');
      expect(old.statusCode).toBe(200);
      expect(old.headers['cache-control']).toBe('no-store');
      expect(old.json()).toMatchObject({ content: 'Historical content', revision: 'v1' });
      const missing = await app.inject(url + '?revision=v0');
      expect(missing.statusCode).toBe(409);
      expect(missing.json()).toEqual({ error: 'document_revision_unavailable' });
      expect((await app.inject(url + '?revision=')).statusCode).toBe(400);
      expect((await app.inject(url + '?other=1')).statusCode).toBe(400);
      expect(
        (await app.inject('/api/specs/admission/documents/missing?revision=v1')).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
  it('rejects an adapter that returns latest for an exact-version read before serializing content', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      {
        documents: {
          source: {
            read: (specId, id) =>
              Promise.resolve({
                kind: 'ok',
                document: {
                  specId,
                  id,
                  title: 'Report',
                  revision: 'v2',
                  content: 'Do not expose v2 as v1',
                },
              }),
          },
        },
      },
    );
    try {
      const response = await app.inject('/api/specs/admission/documents/report?revision=v1');
      expect(response.statusCode).toBe(409);
      expect(response.body).not.toContain('Do not expose');
    } finally {
      await app.close();
    }
  });
});

describe('Demonstration read route (legacy shape, D5 converges it)', () => {
  it('serves the legacy bodies byte for byte, and routes neither document-tree nor raw', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      {
        documents: {
          source: {
            read: (specId, id, revision) =>
              Promise.resolve(
                id === 'gone'
                  ? { kind: 'unavailable' }
                  : id !== 'report'
                    ? { kind: 'not_found' }
                    : revision && revision !== 'v1'
                      ? { kind: 'revision_unavailable' }
                      : {
                          kind: 'ok',
                          document: {
                            specId,
                            id,
                            title: 'Report',
                            filename: 'notes/report.md',
                            content: 'C',
                            revision: 'v1',
                          },
                        },
              ),
          },
        },
      },
    );
    try {
      const ok = await app.inject('/api/specs/admission/documents/report');
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['cache-control']).toBe('no-store');
      expect(ok.body).toBe(
        '{"id":"report","title":"Report","content":"C","revision":"v1","filename":"notes/report.md"}',
      );
      const missing = await app.inject('/api/specs/admission/documents/other');
      expect([missing.statusCode, missing.body]).toEqual([
        404,
        '{"error":"specification_document_not_found"}',
      ]);
      const stale = await app.inject('/api/specs/admission/documents/report?revision=v0');
      expect([stale.statusCode, stale.body]).toEqual([
        409,
        '{"error":"document_revision_unavailable"}',
      ]);
      const down = await app.inject('/api/specs/admission/documents/gone');
      expect([down.statusCode, down.body]).toEqual([
        503,
        '{"error":"specification_source_unavailable"}',
      ]);
      expect((await app.inject('/api/specs/admission/document-tree')).statusCode).toBe(404);
      expect((await app.inject('/api/specs/admission/documents/report/raw')).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('keeps the demonstration shape in demo data mode and routes neither document-tree nor raw', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      { dataMode: 'demo' },
    );
    try {
      const read = await app.inject('/api/specs/admission/documents/spec');
      expect(read.statusCode).toBe(200);
      expect(Object.keys(read.json<Record<string, unknown>>()).sort()).toEqual(
        ['content', 'id', 'revision', 'title']
          .concat('filename' in read.json<Record<string, unknown>>() ? ['filename'] : [])
          .sort(),
      );
      const missing = await app.inject('/api/specs/admission/documents/not-a-document');
      expect([missing.statusCode, missing.body]).toEqual([
        404,
        '{"error":"specification_document_not_found"}',
      ]);
      expect((await app.inject('/api/specs/admission/document-tree')).statusCode).toBe(404);
      expect((await app.inject('/api/specs/admission/documents/spec/raw')).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
