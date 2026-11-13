import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, isApiError } from '../../../api';
import { createRuntimeDocsApi, docsErrorCodes, docsSearchParams } from './api';
import { docsFailure } from './failure';
import { docsKeys } from './queries';

const ws = '0b8f1c1e-0a11-4c6e-9a01-000000000001';
const envelope = { workspaceId: ws, corpusRevision: 'r1', skipped: [] };

function build(get: ReturnType<typeof vi.fn>) {
  const http = { get } as unknown as HttpRequestClient;

  return createRuntimeDocsApi(
    createApiTransport(http, {
      operation: 'docs.read',
      codes: docsErrorCodes,
      isOnline: () => true,
    }),
  );
}

const refusal = (status: number, data: unknown) =>
  vi.fn().mockRejectedValue(new HttpClientError('failed', { kind: 'http', status, data }));

describe('workspace documentation port', () => {
  it('sends search values as the route strings: limit 1..50, switches true/false', async () => {
    expect(docsSearchParams({ q: 'auth', limit: 120, includeProposals: true })).toEqual({
      q: 'auth',
      limit: '50',
      includeProposals: 'true',
    });
    expect(docsSearchParams({ q: 'auth', limit: 0, snippets: false })).toEqual({
      q: 'auth',
      limit: '1',
      snippets: 'false',
    });

    // The key holds the limit as sent, so two limits the route treats alike share one entry.
    expect(docsKeys.search(ws, { q: 'a', limit: 120 })).toEqual(
      docsKeys.search(ws, { q: 'a', limit: 50 }),
    );

    const get = vi
      .fn()
      .mockResolvedValue({ ...envelope, mode: 'hybrid', results: [], proposalsLeftOut: 0 });
    await build(get).search(ws, { q: 'auth', limit: 5 });
    expect(get).toHaveBeenCalledWith(`/api/workspaces/${ws}/docs/search`, {
      signal: undefined,
      params: { q: 'auth', limit: '5' },
    });
  });

  it('answers the document refusals by their code, with the corpus they were decided in', async () => {
    const inactive = {
      error: 'x',
      workspaceId: ws,
      corpusRevision: 'r1',
      code: 'DOCS_DOCUMENT_INACTIVE',
      status: 'superseded',
      supersededBy: { documentId: 'b', title: 'B' },
    };
    await expect(build(refusal(410, inactive)).article(ws, 'a')).resolves.toEqual({
      kind: 'inactive',
      refusal: inactive,
    });

    const skipped = {
      error: 'x',
      workspaceId: ws,
      corpusRevision: 'r2',
      code: 'DOCS_DOCUMENT_SKIPPED',
      skipped: [{ path: 'a.md', error: 'bad' }],
    };
    await expect(build(refusal(404, skipped)).article(ws, 'a')).resolves.toMatchObject({
      kind: 'skipped',
    });

    const missing = {
      error: 'x',
      workspaceId: ws,
      corpusRevision: 'r2',
      code: 'DOCS_DOCUMENT_NOT_FOUND',
    };
    await expect(build(refusal(404, missing)).article(ws, 'a')).resolves.toMatchObject({
      kind: 'not-found',
      refusal: { corpusRevision: 'r2' },
    });
  });

  it('rejects an answer or refusal of another workspace instead of showing it', async () => {
    const other = { ...envelope, workspaceId: 'other', documents: [], inactive: [] };
    const tree: unknown = await build(vi.fn().mockResolvedValue(other))
      .tree(ws)
      .catch((e: unknown) => e);
    expect(isApiError(tree) && tree.kind).toBe('protocol');

    const foreign = {
      error: 'x',
      workspaceId: 'other',
      corpusRevision: 'r',
      code: 'DOCS_DOCUMENT_NOT_FOUND',
    };
    const article: unknown = await build(refusal(404, foreign))
      .article(ws, 'a')
      .catch((e: unknown) => e);
    expect(isApiError(article) && article.kind).toBe('protocol');
  });

  it('classifies the workspace failures by code', async () => {
    const fail = async (status: number, data: unknown) =>
      docsFailure(
        await build(refusal(status, data))
          .tree(ws)
          .catch((e: unknown) => e),
      );

    expect(await fail(404, { error: 'x', code: 'DOCS_WORKSPACE_NOT_FOUND' })).toEqual({
      kind: 'workspace-not-found',
    });
    expect(await fail(409, { error: 'x', code: 'DOCS_WORKSPACE_UNAVAILABLE' })).toEqual({
      kind: 'workspace-unavailable',
    });
    expect(await fail(503, { error: 'x', code: 'DOCS_NOT_CONFIGURED', docsRoot: 'docs' })).toEqual({
      kind: 'not-configured',
      docsRoot: 'docs',
    });
    expect(await fail(503, { error: 'x', code: 'DOCS_UNAVAILABLE' })).toEqual({
      kind: 'docs-unavailable',
    });
    expect(await fail(403, { error: 'forbidden' })).toEqual({ kind: 'forbidden' });
  });
});
