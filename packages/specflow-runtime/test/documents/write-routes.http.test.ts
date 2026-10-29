// The document write routes over HTTP with an injected write source: authorization on every route,
// the request schemas, per-route body limits, the status of every document error code, the headers
// and the response shapes against the contract schemas. The Engine behind the routes is covered by
// write.http.test.ts (real project).
import { randomUUID } from 'node:crypto';

import {
  BatchSaveResultSchema,
  DOCUMENT_ERROR_CODES,
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  FlushResultSchema,
  ManualCommitResultSchema,
  SaveResultSchema,
  UncommittedViewSchema,
  type DocumentErrorCode,
  type DocumentErrorDetails,
  type DocumentOperationStatus,
  type UncommittedView,
} from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import type { DocumentWriteSource } from '../../src/features/documents/write/write-source';
import { statusForDocumentError } from '../../src/features/documents/content/error-status';
import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const SPEC = 'spec-1';
const OTHER_SPEC = 'spec-2';
const OPERATION = randomUUID();

const commit = {
  state: 'pending',
  reason: 'settling',
  queuedAt: '2026-10-27T10:00:00.000Z',
} as const;
const written = { id: 'notes', path: 'notes.md', revision: 'r1', type: 'notes' };
const operationResult = {
  operationId: OPERATION,
  revision: 'tree-2',
  documents: [written],
  removedDocumentIds: [],
  folders: [],
  commit,
};
const status: DocumentOperationStatus = {
  operationId: OPERATION,
  specId: SPEC,
  action: 'save',
  documentIds: ['notes'],
  createdAt: '2026-10-27T10:00:00.000Z',
  commit,
  stage: 'queued',
};

const uncommitted: UncommittedView = {
  ledgerRevision: 'a'.repeat(64),
  policy: { documents: 'manual', source: 'local' },
  entries: [
    {
      path: 'specs/active/sample/notes.md',
      documentId: 'notes',
      reason: 'auto-commit-off',
      recordedAt: '2026-10-27T10:00:00.000Z',
      operations: 1,
    },
  ],
  queue: { pending: 0, failed: 0, recoveryRequired: 0 },
};

interface Calls {
  readonly names: string[];
  fail?: () => Error;
}

function fakeSource(calls: Calls): DocumentWriteSource {
  const run = <T>(name: string, value: T): Promise<T> => {
    calls.names.push(name);
    if (calls.fail) {
      return Promise.reject(calls.fail());
    }

    return Promise.resolve(value);
  };

  return {
    save: () => run('save', { operationId: OPERATION, document: written, commit }),
    saveAll: () => run('saveAll', { operationId: OPERATION, documents: [written], commit }),
    create: () => run('create', operationResult),
    createFolder: () => run('createFolder', { ...operationResult, folders: ['docs'] }),
    operate: () => run('operate', operationResult),
    status: () => run('status', status),
    retry: () => run('retry', status),
    abandon: () => run('abandon', status),
    flush: () => run('flush', { settled: true, pending: 0, failed: 0, committed: 1 }),
    uncommitted: () => run('uncommitted', uncommitted),
    commit: () =>
      run('commit', {
        operationId: OPERATION,
        commit: { state: 'committed', sha: 'f'.repeat(40) },
        paths: ['specs/active/sample/notes.md'],
        remaining: { entries: 0, ledgerRevision: 'b'.repeat(64) },
      }),
  };
}

type Role = 'developer' | 'viewer';

async function listen(
  options: {
    assignments?: { role: Role; scope: Record<string, string> }[];
    authenticated?: boolean;
    source?: DocumentWriteSource | undefined;
    calls?: Calls;
  } = {},
) {
  const calls = options.calls ?? { names: [] };
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers: Record<string, string> =
    options.authenticated === false
      ? {}
      : { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: {
        assignments: (options.assignments ?? [{ role: 'developer', scope: {} }]).map((item) => ({
          userId: 'demo-user',
          ...item,
        })),
      },
    },
    {
      auth: { store },
      documents: {
        ...('source' in options ? {} : { writeSource: fakeSource(calls) }),
        ...(options.source ? { writeSource: options.source } : {}),
      },
    },
  );
  apps.push(app);

  return { app, headers, calls };
}

interface RouteCase {
  readonly name: string;
  readonly method: 'PUT' | 'POST' | 'GET';
  readonly url: string;
  readonly body?: unknown;
  readonly capability: 'manage' | 'view';
  readonly call: string;
  readonly schema: TSchema;
  /** Oversized-body limit in bytes; absent for a route without a body. */
  readonly limit?: number;
}

const KIB = 1024;
const MIB = 1024 * KIB;
const base = `/api/specs/${SPEC}`;
const ROUTES: readonly RouteCase[] = [
  {
    name: 'save',
    method: 'PUT',
    url: `${base}/documents/notes`,
    body: { operationId: OPERATION, content: 'text', expectedRevision: 'r0' },
    capability: 'manage',
    call: 'save',
    schema: SaveResultSchema,
    limit: 2 * MIB,
  },
  {
    name: 'batch save',
    method: 'POST',
    url: `${base}/documents/save`,
    body: {
      operationId: OPERATION,
      documents: [{ documentId: 'notes', content: 'text', expectedRevision: 'r0' }],
    },
    capability: 'manage',
    call: 'saveAll',
    schema: BatchSaveResultSchema,
    limit: 8 * MIB,
  },
  {
    name: 'create documents',
    method: 'POST',
    url: `${base}/documents`,
    body: { operationId: OPERATION, documents: [{ path: 'a.md', content: 'text' }] },
    capability: 'manage',
    call: 'create',
    schema: DocumentOperationResultSchema,
    limit: 2 * MIB,
  },
  {
    name: 'create folder',
    method: 'POST',
    url: `${base}/folders`,
    body: { operationId: OPERATION, path: 'docs' },
    capability: 'manage',
    call: 'createFolder',
    schema: DocumentOperationResultSchema,
    limit: 256 * KIB,
  },
  {
    name: 'document operation',
    method: 'POST',
    url: `${base}/document-operations`,
    body: {
      operationId: OPERATION,
      action: 'delete',
      kind: 'document',
      documentId: 'notes',
      expectedRevision: 'r0',
    },
    capability: 'manage',
    call: 'operate',
    schema: DocumentOperationResultSchema,
    limit: 256 * KIB,
  },
  {
    name: 'operation status',
    method: 'GET',
    url: `${base}/document-operations/${OPERATION}`,
    capability: 'view',
    call: 'status',
    schema: DocumentOperationStatusSchema,
  },
  {
    name: 'retry',
    method: 'POST',
    url: `${base}/document-operations/${OPERATION}/retry`,
    body: {},
    capability: 'manage',
    call: 'retry',
    schema: DocumentOperationStatusSchema,
    limit: 256 * KIB,
  },
  {
    name: 'abandon',
    method: 'POST',
    url: `${base}/document-operations/${OPERATION}/abandon`,
    body: {},
    capability: 'manage',
    call: 'abandon',
    schema: DocumentOperationStatusSchema,
    limit: 256 * KIB,
  },
  {
    name: 'flush',
    method: 'POST',
    url: `${base}/document-commits/flush`,
    body: { waitMs: 0 },
    capability: 'manage',
    call: 'flush',
    schema: FlushResultSchema,
    limit: 256 * KIB,
  },
  {
    name: 'uncommitted changes',
    method: 'GET',
    url: `${base}/uncommitted`,
    capability: 'view',
    call: 'uncommitted',
    schema: UncommittedViewSchema,
  },
  {
    name: 'manual commit',
    method: 'POST',
    url: `${base}/commit`,
    body: { operationId: OPERATION, message: 'Update the notes' },
    capability: 'manage',
    call: 'commit',
    schema: ManualCommitResultSchema,
    limit: 256 * KIB,
  },
];

const send = (
  fx: Awaited<ReturnType<typeof listen>>,
  route: RouteCase,
  overrides: { url?: string; body?: unknown; headers?: Record<string, string> } = {},
) =>
  fx.app.inject({
    method: route.method,
    url: overrides.url ?? route.url,
    headers: { ...fx.headers, ...overrides.headers },
    ...(route.method === 'GET'
      ? {}
      : { payload: JSON.stringify(overrides.body ?? route.body ?? {}) }),
    ...(route.method === 'GET'
      ? {}
      : { headers: { ...fx.headers, ...overrides.headers, 'content-type': 'application/json' } }),
  });

describe.each(ROUTES)('$method $url ($name)', (route) => {
  it('answers 200 with the contract shape and Cache-Control: no-store', async () => {
    const fx = await listen();
    const response = await send(fx, route);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Value.Check(route.schema, response.json())).toBe(true);
    expect(fx.calls.names).toEqual([route.call]);
  });

  it('answers 401 without a session and calls nothing', async () => {
    const fx = await listen({ authenticated: false });
    const response = await send(fx, route);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'authentication_required' });
    expect(fx.calls.names).toEqual([]);
  });

  it(`${route.capability === 'manage' ? 'answers 403 to a viewer' : 'lets a viewer read'}`, async () => {
    const fx = await listen({ assignments: [{ role: 'viewer', scope: {} }] });
    const response = await send(fx, route);
    if (route.capability === 'manage') {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden' });
      expect(fx.calls.names).toEqual([]);
    } else {
      expect(response.statusCode).toBe(200);
    }
  });

  it('is scoped to the Specification of the path', async () => {
    const fx = await listen({
      assignments: [{ role: 'developer', scope: { specId: OTHER_SPEC } }],
    });
    const response = await send(fx, route);
    expect(response.statusCode).toBe(403);
    expect(fx.calls.names).toEqual([]);
  });

  it('refuses a field the contract does not name', async () => {
    if (route.method === 'GET') {
      return;
    }

    const fx = await listen();
    const body = { ...(route.body as object), confirmExecutorStopped: true };
    const response = await send(fx, route, { body });
    expect(response.statusCode).toBe(400);
    expect(fx.calls.names).toEqual([]);
  });

  it('is an unavailable source without a write source', async () => {
    const fx = await listen({ source: undefined });
    const response = await send(fx, route);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'SPEC_SOURCE_UNAVAILABLE',
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
  });

  it('answers 401 and 403 before it reads an oversized body', async () => {
    if (route.limit === undefined) {
      return;
    }

    const filler = 'a'.repeat(route.limit + 1);
    const unauthenticated = await listen({ authenticated: false });
    expect((await send(unauthenticated, route, { body: { filler } })).statusCode).toBe(401);
    const viewer = await listen({ assignments: [{ role: 'viewer', scope: {} }] });
    expect((await send(viewer, route, { body: { filler } })).statusCode).toBe(403);
  });

  it('answers a body above its own limit with DOCUMENT_TOO_LARGE (413) and nothing above it', async () => {
    if (route.limit === undefined) {
      return;
    }

    const fx = await listen();
    const over = await send(fx, route, { body: { filler: 'a'.repeat(route.limit + 1) } });
    expect(over.statusCode).toBe(413);
    expect(over.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
    expect(over.headers['cache-control']).toBe('no-store');
    // Just under the limit the body is read and judged by the schema (an unknown field is a 400).
    const under = await send(fx, route, { body: { filler: 'a'.repeat(route.limit - 1024) } });
    expect(under.statusCode).toBe(400);
    expect(fx.calls.names).toEqual([]);
  });
});

describe('errors of the write routes', () => {
  const details: DocumentErrorDetails = { reason: 'busy', cause: 'queue-full', retryAfterMs: 1500 };

  it.each(DOCUMENT_ERROR_CODES.map((code) => [code] as const))(
    'maps %s to its status with the {error, code, details} body and no path',
    async (code: DocumentErrorCode) => {
      const calls: Calls = {
        names: [],
        fail: () => new DocumentError(code, 'C:\\secret\\path /home/secret leaked', details),
      };
      const fx = await listen({ calls });
      const route = ROUTES[0]!;
      const response = await send(fx, route);
      expect(response.statusCode).toBe(statusForDocumentError(code));
      expect(response.json()).toEqual({ error: code, code, details });
      expect(Value.Check(DocumentErrorSchema, response.json())).toBe(true);
      expect(response.body).not.toContain('secret');
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );

  it.each(ROUTES.map((route) => [route.name, route] as const))(
    'answers a failure of the %s route with the same body',
    async (_name, route) => {
      const fx = await listen({
        calls: { names: [], fail: () => new DocumentError('DOCUMENT_NOT_FOUND', 'x') },
      });
      const response = await send(fx, route);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'DOCUMENT_NOT_FOUND', code: 'DOCUMENT_NOT_FOUND' });
    },
  );

  it('tells a busy refusal when to retry in whole seconds (at least one)', async () => {
    const busy = (retryAfterMs: number) => ({
      names: [],
      fail: () =>
        new DocumentError('SPEC_BUSY', 'x', { reason: 'busy', cause: 'queue-full', retryAfterMs }),
    });
    const slow = await send(await listen({ calls: busy(1500) }), ROUTES[0]!);
    expect(slow.statusCode).toBe(409);
    expect(slow.headers['retry-after']).toBe('2');
    const quick = await send(await listen({ calls: busy(0) }), ROUTES[0]!);
    expect(quick.headers['retry-after']).toBe('1');
    const other = await send(
      await listen({
        calls: { names: [], fail: () => new DocumentError('DOCUMENT_PROTECTED', 'x') },
      }),
      ROUTES[0]!,
    );
    expect(other.headers['retry-after']).toBeUndefined();
  });

  it('carries the current revisions of a refused batch save', async () => {
    const conflicts = [{ documentId: 'notes', revision: 'current' }];
    const fx = await listen({
      calls: {
        names: [],
        fail: () => new DocumentError('DOCUMENT_REVISION_CONFLICT', 'x', { conflicts }),
      },
    });
    const response = await send(fx, ROUTES[1]!);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'DOCUMENT_REVISION_CONFLICT',
      code: 'DOCUMENT_REVISION_CONFLICT',
      details: { conflicts },
    });
  });

  it('answers a defect with the generic 500 and no detail', async () => {
    const fx = await listen({
      calls: { names: [], fail: () => new Error('EACCES /etc/secret') },
    });
    const response = await send(fx, ROUTES[0]!);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret');
  });
});

describe('the manual commit request', () => {
  const route = ROUTES[ROUTES.length - 1]!;

  it.each([
    ['an operationId that is not a UUID', { operationId: 'abc' }],
    ['the definitions scope, which belongs to the command line', { scope: 'definitions' }],
    ['a scope that does not exist', { scope: 'everything' }],
    ['a message that is not text', { message: 7 }],
    ['an empty list of paths', { paths: [] }],
    ['a path that is not text', { paths: [7] }],
    ['an empty path', { paths: [''] }],
    [
      'more than 200 paths',
      { paths: Array.from({ length: 201 }, (_, index) => 'p' + String(index)) },
    ],
    ['an empty ledger revision', { ledgerRevision: '' }],
    ['the assertion of an operator that an executor stopped', { confirmExecutorStopped: true }],
    ['a force flag', { force: true }],
  ])('refuses %s', async (_name, patch) => {
    const fx = await listen();
    const response = await send(fx, route, { body: { ...(route.body as object), ...patch } });
    expect(response.statusCode).toBe(400);
    expect(fx.calls.names).toEqual([]);
  });

  it('takes the scope all, a subset, a message and a ledger revision', async () => {
    const fx = await listen();
    const response = await send(fx, route, {
      body: {
        operationId: OPERATION,
        scope: 'all',
        message: ['Subject', '', 'Body'].join('\n'),
        paths: ['specs/active/sample/notes.md'],
        ledgerRevision: 'a'.repeat(64),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(fx.calls.names).toEqual(['commit']);
  });

  it('passes the Specification of the path, never one of the body', async () => {
    const seen: unknown[] = [];
    const source = {
      ...fakeSource({ names: [] }),
      commit: (specId: string, input: unknown) => {
        seen.push([specId, input]);

        return Promise.resolve({
          operationId: OPERATION,
          commit: { state: 'committed' as const, sha: 'f'.repeat(40) },
          paths: [],
          remaining: { entries: 0, ledgerRevision: 'x' },
        });
      },
    };
    const fx = await listen({ source });
    await send(fx, route, { body: { operationId: OPERATION } });
    expect(seen).toEqual([[SPEC, { operationId: OPERATION }]]);
  });

  it.each<[DocumentErrorCode, number, DocumentErrorDetails | undefined]>([
    ['MANUAL_COMMIT_UNAVAILABLE', 409, { cause: 'queue-not-empty' }],
    [
      'MANUAL_COMMIT_CONFLICT',
      409,
      { cause: 'content-changed', paths: ['specs/active/sample/notes.md'] },
    ],
    ['MANUAL_COMMIT_CONFLICT', 409, { cause: 'branch-changed' }],
    ['MANUAL_COMMIT_SUBSET_INVALID', 422, { paths: ['a.md', 'b.md'] }],
    ['MANUAL_COMMIT_STALE', 409, undefined],
    ['MANUAL_COMMIT_MESSAGE_INVALID', 400, { cause: 'subject-too-long' }],
    ['MANUAL_COMMIT_RECOVERY_REQUIRED', 503, undefined],
    ['BRANCH_PROTECTED', 422, { reason: 'branch-protected' }],
    ['COMMIT_BLOCKED', 409, { reason: 'commit-blocked', blockedBy: 'detached' }],
    ['DOCUMENT_OPERATION_CONFLICT', 409, undefined],
    ['GIT_POLICY_INVALID', 503, { reason: 'git-policy-invalid' }],
    ['SPEC_BUSY', 409, { reason: 'busy', cause: 'commit-in-progress', retryAfterMs: 1000 }],
  ])(
    'answers %s with %i and its details, without a path in the message',
    async (code, status, details) => {
      const fx = await listen({
        calls: { names: [], fail: () => new DocumentError(code, '/home/secret/path', details) },
      });
      const response = await send(fx, route);
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: code, code, ...(details ? { details } : {}) });
      expect(Value.Check(DocumentErrorSchema, response.json())).toBe(true);
      expect(response.body).not.toContain('secret');
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );
});

describe('request schemas', () => {
  it.each([
    ['an operationId that is not a UUID', { operationId: 'abc' }],
    ['a missing expectedRevision', { expectedRevision: undefined }],
    ['a content that is not text', { content: 7 }],
  ])('refuses %s on save', async (_name, patch) => {
    const fx = await listen();
    const route = ROUTES[0]!;
    const response = await send(fx, route, { body: { ...(route.body as object), ...patch } });
    expect(response.statusCode).toBe(400);
    expect(fx.calls.names).toEqual([]);
  });

  it('refuses a batch of 26 documents and an empty batch', async () => {
    const fx = await listen();
    const route = ROUTES[1]!;
    const entry = { documentId: 'notes', content: 'x', expectedRevision: 'r' };
    const many = Array.from({ length: 26 }, () => entry);
    expect(
      (await send(fx, route, { body: { operationId: OPERATION, documents: many } })).statusCode,
    ).toBe(400);
    expect(
      (await send(fx, route, { body: { operationId: OPERATION, documents: [] } })).statusCode,
    ).toBe(400);
    expect(fx.calls.names).toEqual([]);
  });

  it('refuses a create entry with both a template and a content, and one with neither', async () => {
    const fx = await listen();
    const route = ROUTES[2]!;
    for (const entry of [{ path: 'a.md', templateId: 't', content: 'x' }, { path: 'a.md' }]) {
      const response = await send(fx, route, {
        body: { operationId: OPERATION, documents: [entry] },
      });
      expect(response.statusCode).toBe(400);
    }

    expect(fx.calls.names).toEqual([]);
  });

  it('refuses a flush wait above 30 seconds and takes an absent body as the default', async () => {
    const fx = await listen();
    const route = ROUTES[8]!;
    expect((await send(fx, route, { body: { waitMs: 30_001 } })).statusCode).toBe(400);
    const empty = await fx.app.inject({ method: 'POST', url: route.url, headers: fx.headers });
    expect(empty.statusCode).toBe(200);
    expect(fx.calls.names).toEqual(['flush']);
  });

  it('takes retry and abandon without a body', async () => {
    const fx = await listen();
    for (const route of [ROUTES[6]!, ROUTES[7]!]) {
      const response = await fx.app.inject({ method: 'POST', url: route.url, headers: fx.headers });
      expect(response.statusCode).toBe(200);
    }

    expect(fx.calls.names).toEqual(['retry', 'abandon']);
  });

  it('answers a malformed operation id of a status read with a not found from the source', async () => {
    const fx = await listen({
      calls: {
        names: [],
        fail: () => new DocumentError('DOCUMENT_OPERATION_NOT_FOUND', 'x'),
      },
    });
    const response = await fx.app.inject({
      method: 'GET',
      url: `${base}/document-operations/not-an-id`,
      headers: fx.headers,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('the operation status read', () => {
  it('has an ETag, answers 304 to a matching If-None-Match and serves HEAD', async () => {
    const fx = await listen();
    const route = ROUTES[5]!;
    const first = await send(fx, route);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^"/u);
    const again = await send(fx, route, { headers: { 'if-none-match': String(etag) } });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');

    const head = await fx.app.inject({ method: 'HEAD', url: route.url, headers: fx.headers });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    const anonymous = await listen({ authenticated: false });
    expect(
      (await anonymous.app.inject({ method: 'HEAD', url: route.url, headers: anonymous.headers }))
        .statusCode,
    ).toBe(401);
    const noAccess = await listen({
      assignments: [{ role: 'developer', scope: { specId: OTHER_SPEC } }],
    });
    expect(
      (await noAccess.app.inject({ method: 'HEAD', url: route.url, headers: noAccess.headers }))
        .statusCode,
    ).toBe(403);
  });

  it('puts no ETag on a write', async () => {
    const fx = await listen();
    expect((await send(fx, ROUTES[0]!)).headers.etag).toBeUndefined();
  });
});

describe('body limits stay on the routes that set them', () => {
  it('leaves the default limit of other routes alone', async () => {
    const fx = await listen();
    // Above the default 1 MiB limit and below the 2 MiB of a save: a Close body is a framework 413.
    const close = await fx.app.inject({
      method: 'POST',
      url: `${base}/close`,
      headers: { ...fx.headers, 'content-type': 'application/json' },
      payload: JSON.stringify({ filler: 'a'.repeat(1.5 * MIB) }),
    });
    expect(close.statusCode).toBe(413);
    expect(close.json()).not.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
    // The same size is read by the save route (and judged by its schema).
    const save = await send(fx, ROUTES[0]!, {
      body: { ...(ROUTES[0]!.body as object), content: 'a'.repeat(1.5 * MIB) },
    });
    expect(save.statusCode).toBe(200);
  });
});
