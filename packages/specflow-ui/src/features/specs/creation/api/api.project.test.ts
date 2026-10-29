import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import { describe, expect, it, vi } from 'vitest';
import { createApiTransport } from '../../../../api';
import { createOperationHardLimitMs, createProjectCreationApi } from './api.project';
import { createSpecErrorCodes } from '../errors/createSpecErrors';
import { archetypeSelectionFixture } from '../workspace/model/createRequest.test-support';

function build(overrides: Partial<HttpRequestClient> = {}) {
  const http = {
    request: vi.fn(),
    get: vi.fn().mockResolvedValue({ workspaces: [], status: 'in-progress' }),
    delete: vi.fn(),
    post: vi.fn().mockResolvedValue({ specId: 'spec-1' }),
    put: vi.fn(),
    patch: vi.fn(),
    sse: vi.fn(),
    ...overrides,
  };
  const api = createProjectCreationApi(
    createApiTransport(http, {
      operation: 'specs.create',
      codes: createSpecErrorCodes,
      isOnline: () => true,
    }),
  );

  return { api, http };
}

describe('project creation adapter', () => {
  it('reads the create options with the abort signal', async () => {
    const { api, http } = build();
    const signal = new AbortController().signal;
    await api.createOptions(signal);
    expect(http.get).toHaveBeenCalledWith('/api/specs/create-options', {
      signal,
      timeoutMs: 30_000,
    });
  });

  it('reads the archetype catalogue and rejects an answer of another shape', async () => {
    const catalogue = { revision: 'r', documentTypes: [], archetypes: [] };
    const { api, http } = build({ get: vi.fn().mockResolvedValue(catalogue) });
    const signal = new AbortController().signal;
    expect(await api.archetypes(signal)).toEqual(catalogue);
    expect(http.get).toHaveBeenCalledWith('/api/specs/archetypes', { signal });
    const broken = build({ get: vi.fn().mockResolvedValue({ archetypes: 'no' }) });
    await expect(broken.api.archetypes()).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('posts the request verbatim in async mode with the long create time limit', async () => {
    const { api, http } = build();
    const input = {
      ...archetypeSelectionFixture,
      title: 'Title',
      operationId: '11111111-1111-4111-8111-111111111111',
      target: { kind: 'new-worktree' as const },
    };
    await api.create(input);
    expect(http.post).toHaveBeenCalledWith('/api/specs', input, {
      timeoutMs: createOperationHardLimitMs,
      signal: undefined,
      headers: { Prefer: 'respond-async' },
    });
    expect(createOperationHardLimitMs).toBe(10 * 60 * 1000);
  });

  it('accepts the 202 acceptance body and the synchronous 201 result, and nothing else', async () => {
    const accepted = {
      operationId: '11111111-1111-4111-8111-111111111111',
      kind: 'specification-create',
      status: 'in-progress',
    };
    const asyncApi = build({ post: vi.fn().mockResolvedValue(accepted) });
    await expect(
      asyncApi.api.create({ title: 'T', ...archetypeSelectionFixture }),
    ).resolves.toEqual(accepted);
    const syncApi = build({ post: vi.fn().mockResolvedValue({ specId: 'spec-1' }) });
    await expect(syncApi.api.create({ title: 'T', ...archetypeSelectionFixture })).resolves.toEqual(
      { specId: 'spec-1' },
    );
    const garbage = build({ post: vi.fn().mockResolvedValue({ status: 'in-progress' }) });
    await expect(
      garbage.api.create({ title: 'T', ...archetypeSelectionFixture }),
    ).rejects.toMatchObject({
      kind: 'protocol',
      outcome: 'unknown',
    });
  });

  it('inspects an operation by its encoded id', async () => {
    const { api, http } = build();
    await api.inspectOperation('a/b');
    expect(http.get).toHaveBeenCalledWith('/api/specs/create/operations/a%2Fb', {
      signal: undefined,
    });
  });

  it('builds the progress stream URL next to the inspection route', () => {
    const { api } = build();
    expect(api.operationEventsUrl('a/b')).toBe('/api/specs/create/operations/a%2Fb/events');
  });

  it('classifies failures with the Create code table', async () => {
    const { api } = build({
      post: vi.fn().mockRejectedValue(
        new HttpClientError('x', {
          kind: 'http',
          status: 409,
          data: { error: 'BRANCH_ALREADY_EXISTS', code: 'BRANCH_ALREADY_EXISTS' },
        }),
      ),
    });
    await expect(api.create({ title: 'T', ...archetypeSelectionFixture })).rejects.toMatchObject({
      kind: 'conflict',
      outcome: 'not-applied',
      operation: 'specs.create',
      code: 'BRANCH_ALREADY_EXISTS',
    });
  });

  it('classifies an inspection of an unknown operation as not-found', async () => {
    const { api } = build({
      get: vi.fn().mockRejectedValue(
        new HttpClientError('x', {
          kind: 'http',
          status: 404,
          data: { error: 'CREATE_NOT_FOUND', code: 'CREATE_NOT_FOUND' },
        }),
      ),
    });
    await expect(api.inspectOperation('op')).rejects.toMatchObject({
      kind: 'not-found',
      operation: 'specs.create.inspect',
    });
  });

  it('rejects an HTML answer to the options as a protocol error', async () => {
    const { api } = build({ get: vi.fn().mockResolvedValue('<html></html>') });
    await expect(api.createOptions()).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('does not send a mutation while the browser is offline', async () => {
    const http = { post: vi.fn() } as unknown as HttpRequestClient;
    const api = createProjectCreationApi(
      createApiTransport(http, { operation: 'specs.create', isOnline: () => false }),
    );
    await expect(api.create({ title: 'T', ...archetypeSelectionFixture })).rejects.toMatchObject({
      kind: 'network',
      outcome: 'not-applied',
    });
    expect(http.post).not.toHaveBeenCalled();
  });
});
