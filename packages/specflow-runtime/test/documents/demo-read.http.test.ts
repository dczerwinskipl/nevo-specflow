import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  DocumentContent,
  DocumentErrorBody,
  DocumentTree,
} from '@nevo/specflow-contracts/documents';
import { createRuntimeApp } from '../../src/server/app';
import { DEMO_BINARY, DEMO_PNG } from '../../src/features/documents/demo/seed-files';
import { noAuthConfig } from '../auth/support/config';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function demo() {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authentication: { ...noAuthConfig().authentication, localUserId: undefined },
    },
    { dataMode: 'demo' },
  );
  apps.push(app);
  return app;
}
const op = (n: number) => `0b8f1c1e-0a11-4c6e-9a01-${String(n).padStart(12, '0')}`;

describe('Demo Runtime serves the real document read contract', () => {
  it('answers the document tree with its ETag and a conditional 304', async () => {
    const app = await demo();
    const response = await app.inject('/api/specs/review/document-tree');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const tree = response.json<DocumentTree>();
    expect(response.headers.etag).toBe(`"${tree.revision}"`);
    expect(tree.dangling.map((entry) => entry.id)).toEqual(['ux']);
    const again = await app.inject({
      url: '/api/specs/review/document-tree',
      headers: { 'if-none-match': response.headers.etag! },
    });
    expect(again.statusCode).toBe(304);
  });

  it('serves an image and a binary file through raw with the safe headers', async () => {
    const app = await demo();
    const tree = (await app.inject('/api/specs/review/document-tree')).json<DocumentTree>();
    const png = tree.documents.find((document) => document.path === 'evidence/screen.png')!;
    const raw = await app.inject(`/api/specs/review/documents/${png.id}/raw`);
    expect(raw.statusCode).toBe(200);
    expect(raw.rawPayload.equals(Buffer.from(DEMO_PNG))).toBe(true);
    expect(raw.headers).toMatchObject({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'content-disposition': 'inline',
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'private, no-cache',
      etag: `"${png.revision}"`,
      'content-length': String(DEMO_PNG.length),
    });
    const cached = await app.inject({
      url: `/api/specs/review/documents/${png.id}/raw`,
      headers: { 'if-none-match': `"${png.revision}"` },
    });
    expect([cached.statusCode, cached.body]).toEqual([304, '']);
    const download = await app.inject(`/api/specs/review/documents/${png.id}/raw?download=1`);
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''screen.png");
    const pdf = tree.documents.find((document) => document.path === 'evidence/report.pdf')!;
    const binary = await app.inject(`/api/specs/review/documents/${pdf.id}/raw`);
    expect(binary.rawPayload.equals(Buffer.from(DEMO_BINARY))).toBe(true);
    expect(binary.headers['content-type']).toBe('application/octet-stream');
    expect(binary.headers['content-disposition']).toBe("attachment; filename*=UTF-8''report.pdf");
    const json = await app.inject(`/api/specs/review/documents/${pdf.id}`);
    expect(json.json<DocumentContent>()).toMatchObject({ kind: 'binary', title: 'report' });
    expect(json.json<DocumentContent>()).not.toHaveProperty('content');
  });

  it('answers read errors with the real codes', async () => {
    const app = await demo();
    const cases = [
      ['/api/specs/review/documents/ux', 404, 'DOCUMENT_FILE_MISSING'],
      ['/api/specs/review/documents/ux/raw', 404, 'DOCUMENT_FILE_MISSING'],
      ['/api/specs/review/documents/missing', 404, 'DOCUMENT_NOT_FOUND'],
      ['/api/specs/unknown-spec/document-tree', 404, 'DOCUMENT_NOT_FOUND'],
      ['/api/specs/review/documents/overview?revision=old', 409, 'DOCUMENT_REVISION_UNAVAILABLE'],
    ] as const;
    for (const [url, status, code] of cases) {
      const response = await app.inject(url);
      expect([url, response.statusCode, response.json<DocumentErrorBody>()]).toEqual([
        url,
        status,
        { error: code, code },
      ]);
    }
    expect(
      (await app.inject('/api/specs/review/documents/overview/raw?download=2')).statusCode,
    ).toBe(400);
  });

  it('keeps the Task documents readable for the Task pages', async () => {
    const app = await demo();
    const task = await app.inject(
      '/api/specs/admission/documents/TASK-03?revision=demo-document-1',
    );
    expect(task.statusCode).toBe(200);
    expect(task.json<DocumentContent>()).toMatchObject({ id: 'TASK-03', kind: 'text' });
  });

  it('refuses demo writes on a protected branch and in the archive with the reason', async () => {
    const app = await demo();
    const write = (specId: string, documentId: string, expectedRevision: string, n: number) =>
      app.inject({
        method: 'PUT',
        url: `/api/demo/specs/${specId}/documents/${documentId}`,
        payload: { operationId: op(n), content: 'x', expectedRevision },
      });
    const protectedBranch = await write('packaging', 'overview', 'demo-document-1', 1);
    expect([protectedBranch.statusCode, protectedBranch.json()]).toEqual([
      422,
      {
        error: 'BRANCH_PROTECTED',
        code: 'BRANCH_PROTECTED',
        details: { reason: 'branch-protected' },
      },
    ]);
    const archived = await write('archived-shell', 'overview', 'demo-document-1', 2);
    expect([archived.statusCode, archived.json()]).toEqual([
      409,
      { error: 'SPEC_ARCHIVED', code: 'SPEC_ARCHIVED', details: { reason: 'archived' } },
    ]);
    const content = (
      await app.inject('/api/specs/archived-shell/documents/overview')
    ).json<DocumentContent>();
    expect(content.editable).toBe(false);
  });
});
