// Real project, real Git, real Engine behind the real Runtime routes: the document write surface
// through HTTP -- save, batch save, create, folders, operations, status, flush, retry, abandon,
// idempotent replay, the commit queue seen through the status and the operation list, and the Close
// routes that refuse while document commits are not finished. Run on Linux (tools/dev/linux-test.sh):
// every test starts Git processes and the Engine's queue.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BatchSaveResultSchema,
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  DocumentTreeSchema,
  FlushResultSchema,
  ManualCommitResultSchema,
  SaveResultSchema,
  UncommittedViewSchema,
  type DocumentOperationStatus,
  type DocumentTree,
  type ManualCommitResult,
  type UncommittedView,
} from '@nevo/specflow-contracts/documents';
import {
  OperationListResponseSchema,
  type OperationListResponse,
} from '@nevo/specflow-contracts/operations';
import {
  DOCUMENT_JOURNAL_RELATIVE_DIR,
  bootstrapProjectHome,
  createDocumentQueueScheduler,
  createGitCommitPort,
  installDefinitionsForTesting,
  serializeSpecificationManifest,
  type SpecFlowEngine,
} from '@nevo/specflow-engine/testing';
import { GitCapabilityError, resolveCreateArchetype } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createEngineDocumentWriteSource } from '../../src/features/documents/write/engine-write-source';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
const stops: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const GIT_ON = 'runtime: {}\ngit:\n  enabled: true\n';
const GIT_OFF = 'runtime: {}\ngit:\n  enabled: false\n';

interface Fixture {
  readonly root: string;
  readonly engine: SpecFlowEngine;
  readonly specId: string;
  readonly dir: string;
}

/** A committed project on a work branch with one hand-built Specification of editable notes. */
async function project(config = GIT_ON): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-write-')));
  roots.push(root);
  git(root, 'init', '-q');
  git(root, 'config', '--local', 'core.autocrlf', 'false');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), config);
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  git(root, 'checkout', '-q', '-b', 'feature/work');
  const spec = await handBuilt(root, 'hand');
  git(root, 'add', 'specs');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'specification',
  );
  return { root, engine: await bootstrapProjectHome(root), ...spec };
}

const notes = (index: number): string => `notes ${index}\n`;

async function handBuilt(root: string, slug: string, location: 'active' | 'archive' = 'active') {
  const dir = join(root, 'specs', location, slug);
  const specId = randomUUID();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'specification.yaml'),
    serializeSpecificationManifest({
      specId,
      slug,
      title: 'Hand ' + slug,
      archetype: {
        id: 'minimal',
        version: 1,
        requirements: [{ documentType: 'overview', minCount: 1 }],
      },
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'notes-1', path: 'notes-1.md', type: 'notes' },
        { id: 'notes-2', path: 'notes-2.md', type: 'notes' },
        { id: 'data', path: 'data.bin', type: 'notes' },
      ],
      folders: [],
      status: 'draft',
      location,
      priority: 10,
      created: '2026-10-27',
      tasks: [],
    }),
  );
  await writeFile(join(dir, 'overview.md'), '# Hand\n');
  await writeFile(join(dir, 'notes-1.md'), notes(1));
  await writeFile(join(dir, 'notes-2.md'), notes(2));
  await writeFile(join(dir, 'data.bin'), Buffer.from([0, 1, 2, 3]));
  return { specId, dir };
}

interface Listening {
  readonly app: FastifyInstance;
  readonly headers: Record<string, string>;
}

async function listen(
  fx: Fixture,
  options: {
    assignments?: { role: 'developer' | 'viewer'; scope: Record<string, string> }[];
    now?: () => Date;
    scheduler?: boolean;
  } = {},
): Promise<Listening> {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
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
      specs: { engine: fx.engine },
      ...(options.now ? { operations: { now: options.now } } : {}),
    },
  );
  apps.push(app);
  if (options.scheduler) {
    const scheduler = createDocumentQueueScheduler(fx.engine);
    await scheduler.start();
    stops.push(() => scheduler.stop());
  }
  return {
    app,
    headers: { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session },
  };
}

const base = (fx: Fixture) => `/api/specs/${fx.specId}`;

function call(
  l: Listening,
  method: 'GET' | 'PUT' | 'POST',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return l.app.inject({
    method,
    url,
    headers: {
      ...l.headers,
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

const save = (
  l: Listening,
  fx: Fixture,
  documentId: string,
  content: string,
  expectedRevision: string,
  operationId = randomUUID(),
) =>
  call(l, 'PUT', `${base(fx)}/documents/${documentId}`, { operationId, content, expectedRevision });

const status = (l: Listening, fx: Fixture, operationId: string) =>
  call(l, 'GET', `${base(fx)}/document-operations/${operationId}`);

const flush = (l: Listening, fx: Fixture, body: unknown = { waitMs: 5000 }) =>
  call(l, 'POST', `${base(fx)}/document-commits/flush`, body);

const code = (response: { json(): unknown }) => (response.json() as { code?: string }).code;

function commitCount(fx: Fixture): number {
  return Number(git(fx.root, 'rev-list', '--count', 'HEAD'));
}

describe('save', () => {
  it('writes at once, answers pending, and the flush commits it with a sha', async () => {
    const fx = await project();
    const l = await listen(fx);
    const before = commitCount(fx);

    const response = await save(l, fx, 'notes-1', 'changed\n', sha256(notes(1)));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    const result = response.json<{
      operationId: string;
      document: { id: string; path: string; revision: string };
      commit: { state: string };
    }>();
    expect(Value.Check(SaveResultSchema, result)).toBe(true);
    expect(result.document).toMatchObject({
      id: 'notes-1',
      path: 'notes-1.md',
      revision: sha256('changed\n'),
    });
    expect(result.commit.state).toBe('pending');
    // On disk before the commit.
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe('changed\n');
    expect(commitCount(fx)).toBe(before);

    const queued = await status(l, fx, result.operationId);
    expect(queued.statusCode).toBe(200);
    expect(Value.Check(DocumentOperationStatusSchema, queued.json())).toBe(true);
    expect(queued.json<DocumentOperationStatus>()).toMatchObject({
      operationId: result.operationId,
      specId: fx.specId,
      action: 'save',
      documentIds: ['notes-1'],
      stage: 'queued',
      commit: { state: 'pending' },
    });

    const flushed = await flush(l, fx);
    expect(flushed.statusCode, flushed.body).toBe(200);
    expect(Value.Check(FlushResultSchema, flushed.json())).toBe(true);
    expect(flushed.json()).toEqual({ settled: true, pending: 0, failed: 0, committed: 1 });
    expect(commitCount(fx)).toBe(before + 1);

    const done = (await status(l, fx, result.operationId)).json<DocumentOperationStatus>();
    expect(done.commit.state).toBe('committed');
    expect(done.commit.sha).toBe(git(fx.root, 'rev-parse', 'HEAD'));
    expect(git(fx.root, 'status', '--porcelain')).toBe('');
  });

  it('replays the same operation with the stored result and the current commit state', async () => {
    const fx = await project();
    const l = await listen(fx);
    const operationId = randomUUID();
    const first = await save(l, fx, 'notes-1', 'once\n', sha256(notes(1)), operationId);
    expect(first.json<{ commit: { state: string } }>().commit.state).toBe('pending');
    await flush(l, fx);
    const count = commitCount(fx);

    const replay = await save(l, fx, 'notes-1', 'once\n', sha256(notes(1)), operationId);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({
      operationId,
      document: first.json<{ document: unknown }>().document,
      commit: { state: 'committed', sha: git(fx.root, 'rev-parse', 'HEAD') },
    });
    expect(commitCount(fx)).toBe(count);

    const different = await save(l, fx, 'notes-1', 'another\n', sha256(notes(1)), operationId);
    expect(different.statusCode).toBe(409);
    expect(different.json()).toEqual({
      error: 'DOCUMENT_OPERATION_CONFLICT',
      code: 'DOCUMENT_OPERATION_CONFLICT',
    });
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe('once\n');
  });

  it('refuses a stale revision and changes nothing', async () => {
    const fx = await project();
    const l = await listen(fx);
    const response = await save(l, fx, 'notes-1', 'late\n', sha256('not the content\n'));
    expect(response.statusCode).toBe(409);
    expect(Value.Check(DocumentErrorSchema, response.json())).toBe(true);
    expect(code(response)).toBe('DOCUMENT_REVISION_CONFLICT');
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe(notes(1));
  });

  it.each([
    ['an unknown document', 'nope', 404, 'DOCUMENT_NOT_FOUND'],
    ['a document that is not editable', 'data', 415, 'DOCUMENT_NOT_EDITABLE'],
  ])('answers %s', async (_name, documentId, statusCode, errorCode) => {
    const fx = await project();
    const l = await listen(fx);
    const response = await save(l, fx, documentId, 'x\n', 'whatever');
    expect(response.statusCode, response.body).toBe(statusCode);
    expect(code(response)).toBe(errorCode);
  });

  it('refuses content above the save limit in bytes (not characters) with DOCUMENT_TOO_LARGE', async () => {
    const fx = await project();
    const l = await listen(fx);
    // 700 000 two-byte characters: 1.4 MB of bytes under the 2 MiB body, above the 1 MiB content cap.
    const response = await save(l, fx, 'notes-1', 'é'.repeat(600_000), sha256(notes(1)));
    expect(response.statusCode, response.body).toBe(413);
    expect(response.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe(notes(1));
  });

  it('refuses an unknown Specification and an archived one', async () => {
    const fx = await project();
    const archived = await handBuilt(fx.root, 'old', 'archive');
    git(fx.root, 'add', 'specs');
    git(fx.root, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'old');
    const l = await listen(fx);
    const unknown = await call(l, 'PUT', `/api/specs/${randomUUID()}/documents/notes-1`, {
      operationId: randomUUID(),
      content: 'x',
      expectedRevision: 'r',
    });
    expect(unknown.statusCode).toBe(404);
    expect(code(unknown)).toBe('DOCUMENT_NOT_FOUND');
    const response = await call(l, 'PUT', `/api/specs/${archived.specId}/documents/notes-1`, {
      operationId: randomUUID(),
      content: 'x',
      expectedRevision: sha256(notes(1)),
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'SPEC_ARCHIVED',
      details: { reason: 'archived' },
    });
  });

  it('without Git writes at once and has nothing to commit', async () => {
    const fx = await project(GIT_OFF);
    const l = await listen(fx);
    const response = await save(l, fx, 'notes-1', 'plain\n', sha256(notes(1)));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<{ commit: { state: string } }>().commit.state).toBe('not-applicable');
    const flushed = await flush(l, fx);
    expect(flushed.json()).toEqual({ settled: true, pending: 0, failed: 0, committed: 0 });
  });

  it('is committed by the scheduler of the Runtime and visible through the status', async () => {
    const fx = await project();
    const l = await listen(fx, { scheduler: true });
    const before = commitCount(fx);
    const response = await save(l, fx, 'notes-2', 'scheduled\n', sha256(notes(2)));
    const operationId = response.json<{ operationId: string }>().operationId;
    // The settle period belongs to the scheduler; poll the status until the commit shows.
    let state = '';
    for (let attempt = 0; attempt < 200 && state !== 'committed'; attempt += 1) {
      state = (await status(l, fx, operationId)).json<DocumentOperationStatus>().commit.state;
      if (state !== 'committed') await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(state).toBe('committed');
    expect(commitCount(fx)).toBe(before + 1);
  });
});

describe('batch save', () => {
  it('writes every document and commits them together', async () => {
    const fx = await project();
    const l = await listen(fx);
    const before = commitCount(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents/save`, {
      operationId: randomUUID(),
      documents: [
        { documentId: 'notes-1', content: 'one\n', expectedRevision: sha256(notes(1)) },
        { documentId: 'notes-2', content: 'two\n', expectedRevision: sha256(notes(2)) },
      ],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(Value.Check(BatchSaveResultSchema, response.json())).toBe(true);
    expect(response.json<{ documents: { id: string }[] }>().documents.map((d) => d.id)).toEqual([
      'notes-1',
      'notes-2',
    ]);
    await flush(l, fx);
    expect(commitCount(fx)).toBe(before + 1);
    expect(git(fx.root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([
      `specs/active/hand/notes-1.md`,
      `specs/active/hand/notes-2.md`,
    ]);
  });

  it('refuses all when one revision is stale and names the current revisions', async () => {
    const fx = await project();
    const l = await listen(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents/save`, {
      operationId: randomUUID(),
      documents: [
        { documentId: 'notes-1', content: 'one\n', expectedRevision: sha256(notes(1)) },
        { documentId: 'notes-2', content: 'two\n', expectedRevision: sha256('stale') },
      ],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'DOCUMENT_REVISION_CONFLICT',
      code: 'DOCUMENT_REVISION_CONFLICT',
      details: { conflicts: [{ documentId: 'notes-2', revision: sha256(notes(2)) }] },
    });
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe(notes(1));
  });
});

describe('create, folders and structural operations', () => {
  it('creates documents from content and answers the tree revision', async () => {
    const fx = await project();
    const l = await listen(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents`, {
      operationId: randomUUID(),
      documents: [
        { path: 'extra/plan.md', type: 'notes', content: '# Plan\n' },
        { path: 'loose.md', content: 'loose\n' },
      ],
      folders: ['empty'],
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json<{
      revision: string;
      documents: { id: string; path: string; type?: string }[];
      folders: string[];
    }>();
    expect(Value.Check(DocumentOperationResultSchema, result)).toBe(true);
    // A document without a type is reported too, with no type.
    expect(result.documents.map((item) => item.path).sort()).toEqual(['extra/plan.md', 'loose.md']);
    expect(result.documents.find((item) => item.path === 'extra/plan.md')?.type).toBe('notes');
    expect(result.documents.find((item) => item.path === 'loose.md')?.type).toBeUndefined();
    expect(await readFile(join(fx.dir, 'extra', 'plan.md'), 'utf8')).toBe('# Plan\n');
    // The revision is the one the tree answers now.
    const tree = await call(l, 'GET', `${base(fx)}/document-tree`);
    expect(tree.json<DocumentTree>().revision).toBe(result.revision);
    expect(Value.Check(DocumentTreeSchema, tree.json())).toBe(true);
  });

  it('creates a document from a template of the archetype of the Specification', async () => {
    const fx = await project();
    await installDefinitionsForTesting(fx.engine);
    const { catalogueRevision } = await resolveCreateArchetype(fx.engine, 'minimal');
    const l = await listen(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents`, {
      operationId: randomUUID(),
      documents: [{ path: 'notes/decisions.md', templateId: 'decisions' }],
      catalogueRevision,
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json<{ documents: { path: string; type?: string }[] }>();
    expect(Value.Check(DocumentOperationResultSchema, result)).toBe(true);
    expect(result.documents).toMatchObject([{ path: 'notes/decisions.md', type: 'decisions' }]);
    expect(await readFile(join(fx.dir, 'notes', 'decisions.md'), 'utf8')).toContain('Hand hand');
  });

  it('refuses a template create made against an outdated catalogue revision', async () => {
    const fx = await project();
    await installDefinitionsForTesting(fx.engine);
    const l = await listen(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents`, {
      operationId: randomUUID(),
      documents: [{ path: 'a.md', templateId: 'decisions' }],
      catalogueRevision: 'outdated',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'CATALOGUE_STALE' });
    expect(response.json()).not.toHaveProperty('details.cause', 'template-unsupported');
  });

  it.each([
    [
      'a path that breaks the rules',
      { path: '../escape.md', content: 'x' },
      400,
      'DOCUMENT_PATH_INVALID',
    ],
    ['a path that exists', { path: 'overview.md', content: 'x' }, 409, 'DOCUMENT_PATH_CONFLICT'],
  ])('refuses %s', async (_name, entry, statusCode, errorCode) => {
    const fx = await project();
    const l = await listen(fx);
    const response = await call(l, 'POST', `${base(fx)}/documents`, {
      operationId: randomUUID(),
      documents: [entry],
    });
    expect(response.statusCode, response.body).toBe(statusCode);
    expect(code(response)).toBe(errorCode);
  });

  it('creates a folder, then renames, moves, classifies and deletes documents', async () => {
    const fx = await project();
    const l = await listen(fx);
    const operate = (body: Record<string, unknown>) =>
      call(l, 'POST', `${base(fx)}/document-operations`, { operationId: randomUUID(), ...body });

    const folder = await call(l, 'POST', `${base(fx)}/folders`, {
      operationId: randomUUID(),
      path: 'archive',
    });
    expect(folder.statusCode, folder.body).toBe(200);
    expect(folder.json<{ folders: string[] }>().folders).toEqual(['archive']);

    const renamed = await operate({
      action: 'rename',
      kind: 'document',
      documentId: 'notes-2',
      name: 'second.md',
      expectedRevision: sha256(notes(2)),
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect(renamed.json<{ documents: { path: string }[] }>().documents[0]?.path).toBe('second.md');

    const moved = await operate({
      action: 'move',
      kind: 'document',
      documentId: 'notes-2',
      targetFolder: 'archive',
      expectedRevision: sha256(notes(2)),
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(await readFile(join(fx.dir, 'archive', 'second.md'), 'utf8')).toBe(notes(2));

    const removed = await operate({
      action: 'delete',
      kind: 'document',
      documentId: 'notes-1',
      expectedRevision: sha256(notes(1)),
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json<{ removedDocumentIds: string[] }>().removedDocumentIds).toEqual([
      'notes-1',
    ]);

    const protectedDelete = await operate({
      action: 'delete',
      kind: 'document',
      documentId: 'overview',
      expectedRevision: sha256('# Hand\n'),
    });
    expect(protectedDelete.statusCode).toBe(409);
    expect(protectedDelete.json()).toMatchObject({
      code: 'DOCUMENT_PROTECTED',
      details: { reason: 'protected' },
    });

    const malformed = await operate({
      action: 'rename',
      kind: 'document',
      documentId: 'data',
      expectedRevision: 'r',
    });
    expect(malformed.statusCode).toBe(400);
    expect(code(malformed)).toBe('DOCUMENT_OPERATION_INVALID');
  });

  it('classifies an unclassified file', async () => {
    const fx = await project();
    await writeFile(join(fx.dir, 'loose.md'), 'loose\n');
    git(fx.root, 'add', 'specs');
    git(
      fx.root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'loose',
    );
    const l = await listen(fx);
    const tree = (await call(l, 'GET', `${base(fx)}/document-tree`)).json<DocumentTree>();
    const loose = tree.documents.find((item) => item.path === 'loose.md');
    expect(loose?.classification).toBe('unclassified');
    const response = await call(l, 'POST', `${base(fx)}/document-operations`, {
      operationId: randomUUID(),
      action: 'classify',
      kind: 'document',
      documentId: loose!.id,
      type: 'notes',
      expectedRevision: loose!.revision,
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json<{ documents: { id: string; type?: string }[] }>();
    expect(result.documents[0]?.type).toBe('notes');
    expect(result.documents[0]?.id).not.toBe(loose!.id);
  });
});

describe('the commit queue as a person sees it', () => {
  /** A queued save whose commit cannot happen: HEAD is detached when the flush runs. */
  async function blockedSave(fx: Fixture, l: Listening) {
    const response = await save(l, fx, 'notes-1', 'blocked\n', sha256(notes(1)));
    expect(response.statusCode, response.body).toBe(200);
    const operationId = response.json<{ operationId: string }>().operationId;
    git(fx.root, 'checkout', '-q', '--detach');
    const flushed = await flush(l, fx, { waitMs: 5000 });
    expect(flushed.statusCode, flushed.body).toBe(200);
    return { operationId, flushed };
  }

  it('shows a failed commit in the status, the tree and the list, and retry resolves it', async () => {
    const fx = await project();
    const l = await listen(fx);
    const { operationId, flushed } = await blockedSave(fx, l);
    expect(flushed.json()).toMatchObject({ settled: true, pending: 0, failed: 1, committed: 0 });

    const failed = (await status(l, fx, operationId)).json<DocumentOperationStatus>();
    expect(failed.commit).toMatchObject({ state: 'failed', reason: 'detached' });
    expect(failed.actions?.retry).toEqual({ available: true });
    expect(failed.actions?.abandon).toEqual({ available: true });

    const tree = (await call(l, 'GET', `${base(fx)}/document-tree`)).json<DocumentTree>();
    expect(tree.commits).toMatchObject({ failed: 1 });
    expect(tree.documents.find((item) => item.id === 'notes-1')?.commit).toMatchObject({
      state: 'failed',
      operationId,
    });

    const list = await call(l, 'GET', '/api/specs/document-operations');
    expect(list.statusCode, list.body).toBe(200);
    const body = list.json<OperationListResponse>();
    expect(Value.Check(OperationListResponseSchema, body)).toBe(true);
    expect(body.items).toEqual([
      {
        operationId,
        kind: 'document-change',
        status: 'failed',
        code: 'COMMIT_BLOCKED',
        subject: { specId: fx.specId, slug: 'hand' },
        action: 'save',
        documentCount: 1,
        startedAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      },
    ]);
    expect(body.counts).toEqual({ inProgress: 0, recoveryRequired: 0, failed: 1, completed: 0 });
    expect(list.body).not.toContain('notes-1');

    // Still detached: the retry is accepted and fails again at the next flush; attached, it commits.
    git(fx.root, 'checkout', '-q', 'feature/work');
    const retried = await call(l, 'POST', `${base(fx)}/document-operations/${operationId}/retry`);
    expect(retried.statusCode, retried.body).toBe(200);
    expect(Value.Check(DocumentOperationStatusSchema, retried.json())).toBe(true);
    expect(retried.json<DocumentOperationStatus>().commit.state).toBe('pending');
    const settled = await flush(l, fx);
    expect(settled.json()).toMatchObject({ settled: true, pending: 0, failed: 0, committed: 1 });
    const done = (await status(l, fx, operationId)).json<DocumentOperationStatus>();
    expect(done.commit.state).toBe('committed');

    // Nothing to retry any more.
    const again = await call(l, 'POST', `${base(fx)}/document-operations/${operationId}/retry`);
    expect(again.statusCode).toBe(200);
    const abandonDone = await call(
      l,
      'POST',
      `${base(fx)}/document-operations/${operationId}/abandon`,
    );
    expect(abandonDone.statusCode).toBe(409);
    expect(code(abandonDone)).toBe('DOCUMENT_OPERATION_STATE_INVALID');
    const empty = (
      await call(l, 'GET', '/api/specs/document-operations')
    ).json<OperationListResponse>();
    expect(empty.items).toEqual([]);
  });

  it('keeps the files on abandon, reports the operation uncommitted and does not list it', async () => {
    const fx = await project();
    const l = await listen(fx);
    const { operationId } = await blockedSave(fx, l);
    git(fx.root, 'checkout', '-q', 'feature/work');
    const abandoned = await call(
      l,
      'POST',
      `${base(fx)}/document-operations/${operationId}/abandon`,
    );
    expect(abandoned.statusCode, abandoned.body).toBe(200);
    expect(Value.Check(DocumentOperationStatusSchema, abandoned.json())).toBe(true);
    expect(abandoned.json()).toMatchObject({
      stage: 'completed',
      commit: { state: 'uncommitted', reason: 'abandoned' },
    });
    expect(await readFile(join(fx.dir, 'notes-1.md'), 'utf8')).toBe('blocked\n');
    const list = (
      await call(l, 'GET', '/api/specs/document-operations')
    ).json<OperationListResponse>();
    expect(list.items).toEqual([]);
  });

  it('does not show the operation of another Specification', async () => {
    const fx = await project();
    const other = await handBuilt(fx.root, 'other');
    git(fx.root, 'add', 'specs');
    git(
      fx.root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'other',
    );
    const l = await listen(fx);
    const response = await save(l, fx, 'notes-1', 'mine\n', sha256(notes(1)));
    const operationId = response.json<{ operationId: string }>().operationId;
    for (const [method, suffix] of [
      ['GET', ''],
      ['POST', '/retry'],
      ['POST', '/abandon'],
    ] as const) {
      const foreign = await call(
        l,
        method,
        `/api/specs/${other.specId}/document-operations/${operationId}${suffix}`,
      );
      expect(foreign.statusCode, suffix).toBe(404);
      expect(code(foreign)).toBe('DOCUMENT_OPERATION_NOT_FOUND');
    }
    const malformed = await status(l, fx, 'not-an-operation');
    expect(malformed.statusCode).toBe(404);
    // A pending operation cannot be retried or abandoned: nothing failed.
    const retry = await call(l, 'POST', `${base(fx)}/document-operations/${operationId}/abandon`);
    expect(retry.statusCode).toBe(409);
    expect(code(retry)).toBe('DOCUMENT_OPERATION_STATE_INVALID');
  });
});

describe('the document-operations list route', () => {
  it('answers ETag and 304, and requires a view capability', async () => {
    const fx = await project();
    const l = await listen(fx);
    const first = await call(l, 'GET', '/api/specs/document-operations');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers.etag).toMatch(/^W\//u);
    const again = await call(l, 'GET', '/api/specs/document-operations', undefined, {
      'if-none-match': String(first.headers.etag),
    });
    expect(again.statusCode).toBe(304);

    const anonymous = await createRuntimeApp(
      { ...passwordConfig(), authorization: { assignments: [] } },
      { specs: { engine: fx.engine } },
    );
    apps.push(anonymous);
    expect((await anonymous.inject('/api/specs/document-operations')).statusCode).toBe(401);
    expect(
      (await anonymous.inject({ method: 'HEAD', url: '/api/specs/document-operations' }))
        .statusCode,
    ).toBe(401);

    const nobody = await listen(fx, { assignments: [] });
    expect((await call(nobody, 'GET', '/api/specs/document-operations')).statusCode).toBe(403);
    const viewer = await listen(fx, { assignments: [{ role: 'viewer', scope: {} }] });
    expect((await call(viewer, 'GET', '/api/specs/document-operations')).statusCode).toBe(200);
  });

  it('shows a row only to a caller who may view its Specification', async () => {
    const fx = await project();
    const writer = await listen(fx);
    git(fx.root, 'checkout', '-q', '-b', 'scratch');
    const response = await save(writer, fx, 'notes-1', 'x\n', sha256(notes(1)));
    const operationId = response.json<{ operationId: string }>().operationId;
    git(fx.root, 'checkout', '-q', '--detach');
    await flush(writer, fx);
    const own = await listen(fx, {
      assignments: [{ role: 'viewer', scope: { specId: fx.specId } }],
    });
    expect(
      (await call(own, 'GET', '/api/specs/document-operations')).json<OperationListResponse>()
        .items,
    ).toMatchObject([{ operationId }]);
    const stranger = await listen(fx, {
      assignments: [{ role: 'viewer', scope: { specId: randomUUID() } }],
    });
    const none = (
      await call(stranger, 'GET', '/api/specs/document-operations')
    ).json<OperationListResponse>();
    expect(none.items).toEqual([]);
    expect(none.counts).toEqual({ inProgress: 0, recoveryRequired: 0, failed: 0, completed: 0 });
  });

  it('lists an unreadable journal as a recovery-required row without a Specification', async () => {
    const fx = await project();
    const l = await listen(fx);
    const response = await save(l, fx, 'notes-1', 'x\n', sha256(notes(1)));
    const operationId = response.json<{ operationId: string }>().operationId;
    await writeFile(
      join(
        fx.engine.context.project.stateRoot,
        DOCUMENT_JOURNAL_RELATIVE_DIR,
        `${operationId}.json`,
      ),
      JSON.stringify({ version: 1, wrong: true }),
    );
    const list = (
      await call(l, 'GET', '/api/specs/document-operations')
    ).json<OperationListResponse>();
    expect(list.items).toMatchObject([
      { operationId, status: 'recovery-required', code: 'DOCUMENT_RECOVERY_REQUIRED' },
    ]);
    expect(list.items[0]).not.toHaveProperty('subject');
    const status404 = await status(l, fx, operationId);
    expect(status404.statusCode).toBe(503);
    expect(code(status404)).toBe('DOCUMENT_RECOVERY_REQUIRED');
    // A caller without a project-wide Manage never sees a row that names no Specification.
    const scoped = await listen(fx, {
      assignments: [{ role: 'viewer', scope: { specId: fx.specId } }],
    });
    expect(
      (await call(scoped, 'GET', '/api/specs/document-operations')).json<OperationListResponse>()
        .items,
    ).toEqual([]);
  });
});

describe('Close while document commits are not finished', () => {
  it('answers DOCUMENT_COMMITS_PENDING (409) with the cause for a failed commit', async () => {
    const fx = await project();
    const l = await listen(fx);
    await save(l, fx, 'notes-1', 'blocked\n', sha256(notes(1)));
    git(fx.root, 'checkout', '-q', '--detach');
    await flush(l, fx);

    const close = await call(l, 'POST', `${base(fx)}/close`, {
      operationId: randomUUID(),
    });
    expect(close.statusCode, close.body).toBe(409);
    expect(close.json()).toEqual({
      error: 'DOCUMENT_COMMITS_PENDING',
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-failed' },
    });
    expect(close.headers['cache-control']).toBe('no-store');
  });

  it('answers the cause commit-uncommitted for an abandoned commit', async () => {
    const fx = await project();
    const l = await listen(fx);
    const saved = await save(l, fx, 'notes-1', 'blocked\n', sha256(notes(1)));
    git(fx.root, 'checkout', '-q', '--detach');
    await flush(l, fx);
    const operationId = saved.json<{ operationId: string }>().operationId;
    const abandoned = await call(
      l,
      'POST',
      `${base(fx)}/document-operations/${operationId}/abandon`,
    );
    expect(abandoned.statusCode, abandoned.body).toBe(200);

    const close = await call(l, 'POST', `${base(fx)}/close`, { operationId: randomUUID() });
    expect(close.statusCode, close.body).toBe(409);
    expect(close.json()).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });
  });

  it('commits a pending change before the Close plan is judged', async () => {
    const fx = await project();
    const l = await listen(fx);
    await save(l, fx, 'notes-1', 'pending\n', sha256(notes(1)));
    const before = commitCount(fx);
    const close = await call(l, 'POST', `${base(fx)}/close`, { operationId: randomUUID() });
    // Other Close rules may still refuse; what matters is that the queued commit was not what refused.
    expect(code(close)).not.toBe('DOCUMENT_COMMITS_PENDING');
    expect(commitCount(fx)).toBe(before + 1);
    expect(git(fx.root, 'status', '--porcelain')).toBe('');
  });
});

describe('auto-commit off (ADR 0018)', () => {
  /** The workstation-local file is ignored by Git, so the checkout stays clean. */
  async function autoOff(fx: Fixture): Promise<void> {
    await mkdir(join(fx.root, '.nevo', 'local'), { recursive: true });
    await writeFile(
      join(fx.root, '.nevo', 'local', 'config.yaml'),
      'git:\n  commits:\n    auto:\n      documents: false\n',
    );
  }

  it('answers uncommitted at once, shows it in the tree and the ledger read, and Close refuses it', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    const before = commitCount(fx);

    const response = await save(l, fx, 'notes-1', 'not committed\n', sha256(notes(1)));
    expect(response.statusCode, response.body).toBe(200);
    expect(Value.Check(SaveResultSchema, response.json())).toBe(true);
    expect(response.json<{ commit: { state: string; reason?: string } }>().commit).toMatchObject({
      state: 'uncommitted',
      reason: 'auto-commit-off',
    });
    expect(commitCount(fx)).toBe(before);

    const tree = (await call(l, 'GET', `${base(fx)}/document-tree`)).json<DocumentTree>();
    expect(Value.Check(DocumentTreeSchema, tree)).toBe(true);
    expect(tree.commits).toMatchObject({ uncommitted: 1, policy: 'manual', pending: 0 });
    expect(tree.documents.find((document) => document.id === 'notes-1')?.commit).toMatchObject({
      state: 'uncommitted',
      reason: 'auto-commit-off',
    });

    const view = await call(l, 'GET', `${base(fx)}/uncommitted`);
    expect(view.statusCode, view.body).toBe(200);
    expect(Value.Check(UncommittedViewSchema, view.json())).toBe(true);
    expect(view.json()).toMatchObject({
      policy: { documents: 'manual', source: 'local' },
      entries: [{ documentId: 'notes-1', reason: 'auto-commit-off', operations: 1 }],
      queue: { pending: 0, failed: 0, recoveryRequired: 0 },
    });
    const unchanged = await call(l, 'GET', `${base(fx)}/uncommitted`, undefined, {
      'if-none-match': view.headers.etag!,
    });
    expect(unchanged.statusCode).toBe(304);

    // Uncommitted is not a failure: the list stays empty. Close is refused until the files are committed.
    expect(
      (await call(l, 'GET', '/api/specs/document-operations')).json<OperationListResponse>().items,
    ).toEqual([]);
    const close = await call(l, 'POST', `${base(fx)}/close`, { operationId: randomUUID() });
    expect(close.statusCode, close.body).toBe(409);
    expect(close.json()).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });
  });

  it('lets a viewer read the ledger and keeps it unavailable without a session', async () => {
    const fx = await project();
    await autoOff(fx);
    const viewer = await listen(fx, { assignments: [{ role: 'viewer', scope: {} }] });
    expect((await call(viewer, 'GET', `${base(fx)}/uncommitted`)).statusCode).toBe(200);
    const anonymous = await viewer.app.inject({ method: 'GET', url: `${base(fx)}/uncommitted` });
    expect(anonymous.statusCode).toBe(401);
  });

  it('answers a 404 for a Specification that does not exist', async () => {
    const fx = await project();
    const l = await listen(fx);
    const missing = await call(l, 'GET', `/api/specs/${randomUUID()}/uncommitted`);
    expect(missing.statusCode).toBe(404);
    expect(code(missing)).toBe('DOCUMENT_NOT_FOUND');
  });
});

describe('manual commit (ADR 0018)', () => {
  /** The workstation-local file is ignored by Git, so the checkout stays clean. */
  async function autoOff(fx: Fixture): Promise<void> {
    await mkdir(join(fx.root, '.nevo', 'local'), { recursive: true });
    await writeFile(
      join(fx.root, '.nevo', 'local', 'config.yaml'),
      'git:\n  commits:\n    auto:\n      documents: false\n',
    );
  }

  const commitUrl = (fx: Fixture): string => `${base(fx)}/commit`;
  const commitCall = (l: Listening, fx: Fixture, body: Record<string, unknown>) =>
    call(l, 'POST', commitUrl(fx), body);

  /** Two uncommitted notes, written through HTTP. */
  async function twoUncommitted(fx: Fixture, l: Listening): Promise<void> {
    expect((await save(l, fx, 'notes-1', 'first\n', sha256(notes(1)))).statusCode).toBe(200);
    expect((await save(l, fx, 'notes-2', 'second\n', sha256(notes(2)))).statusCode).toBe(200);
  }

  it('commits the ledger paths with the message and answers the commit, the files and what is left', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    await twoUncommitted(fx, l);
    const before = commitCount(fx);
    const view = (await call(l, 'GET', `${base(fx)}/uncommitted`)).json<UncommittedView>();
    const operationId = randomUUID();

    const response = await commitCall(l, fx, {
      operationId,
      message: 'Update the notes\n\nWith a body.',
      ledgerRevision: view.ledgerRevision,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Value.Check(ManualCommitResultSchema, response.json())).toBe(true);
    const result = response.json<ManualCommitResult>();
    expect(result).toMatchObject({
      operationId,
      commit: { state: 'committed' },
      paths: ['specs/active/hand/notes-1.md', 'specs/active/hand/notes-2.md'],
      remaining: { entries: 0 },
    });
    expect(commitCount(fx)).toBe(before + 1);
    expect(git(fx.root, 'rev-parse', 'HEAD')).toBe(result.commit.sha);
    const message = git(fx.root, 'log', '-1', '--format=%B');
    expect(message).toContain('Update the notes\n\nWith a body.\n\nNevo-Operation: ' + operationId);
    expect(message).toContain('Nevo-Kind: manual-commit');
    expect(git(fx.root, 'status', '--porcelain')).toBe('');

    // The ledger read and the tree agree with it.
    const after = (await call(l, 'GET', `${base(fx)}/uncommitted`)).json<UncommittedView>();
    expect(after.entries).toEqual([]);
    expect(after.ledgerRevision).toBe(result.remaining.ledgerRevision);
    const tree = (await call(l, 'GET', `${base(fx)}/document-tree`)).json<DocumentTree>();
    expect(tree.commits).toMatchObject({ uncommitted: 0, policy: 'manual' });

    // The operation is a document operation of the Specification, and a completed one is not listed.
    const read = await status(l, fx, operationId);
    expect(read.statusCode, read.body).toBe(200);
    expect(Value.Check(DocumentOperationStatusSchema, read.json())).toBe(true);
    expect(read.json()).toMatchObject({
      action: 'manual-commit',
      stage: 'completed',
      commit: { state: 'committed', sha: result.commit.sha },
    });
    expect(
      (await call(l, 'GET', '/api/specs/document-operations')).json<OperationListResponse>().items,
    ).toEqual([]);
  });

  it('replays the stored result by operation id and refuses another body under it', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    await twoUncommitted(fx, l);
    const operationId = randomUUID();
    const first = await commitCall(l, fx, { operationId, message: 'One' });
    const count = commitCount(fx);

    const again = await commitCall(l, fx, { operationId, message: 'One' });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json()).toMatchObject({ commit: first.json<ManualCommitResult>().commit });
    expect(commitCount(fx)).toBe(count);

    const other = await commitCall(l, fx, { operationId, message: 'Two' });
    expect(other.statusCode).toBe(409);
    expect(code(other)).toBe('DOCUMENT_OPERATION_CONFLICT');
    expect(commitCount(fx)).toBe(count);
  });

  it('commits a subset and names the closure of one that splits an operation', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    const batch = await call(l, 'POST', `${base(fx)}/documents/save`, {
      operationId: randomUUID(),
      documents: [
        { documentId: 'notes-1', content: 'first\n', expectedRevision: sha256(notes(1)) },
        { documentId: 'notes-2', content: 'second\n', expectedRevision: sha256(notes(2)) },
      ],
    });
    expect(batch.statusCode, batch.body).toBe(200);
    const before = commitCount(fx);

    const split = await commitCall(l, fx, {
      operationId: randomUUID(),
      paths: ['specs/active/hand/notes-1.md'],
    });
    expect(split.statusCode, split.body).toBe(422);
    expect(Value.Check(DocumentErrorSchema, split.json())).toBe(true);
    expect(split.json()).toMatchObject({
      code: 'MANUAL_COMMIT_SUBSET_INVALID',
      details: { paths: ['specs/active/hand/notes-1.md', 'specs/active/hand/notes-2.md'] },
    });
    expect(commitCount(fx)).toBe(before);

    const whole = await commitCall(l, fx, {
      operationId: randomUUID(),
      paths: ['specs/active/hand/notes-2.md', 'specs/active/hand/notes-1.md'],
    });
    expect(whole.statusCode, whole.body).toBe(200);
    expect(commitCount(fx)).toBe(before + 1);
  });

  it('answers every refusal with its status and details', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);

    // Nothing to commit.
    const empty = await commitCall(l, fx, { operationId: randomUUID() });
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toMatchObject({
      code: 'MANUAL_COMMIT_UNAVAILABLE',
      details: { cause: 'ledger-empty' },
    });

    await twoUncommitted(fx, l);

    // A message that is not valid.
    const invalid = await commitCall(l, fx, { operationId: randomUUID(), message: '  ' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      code: 'MANUAL_COMMIT_MESSAGE_INVALID',
      details: { cause: 'empty' },
    });

    // A revision the client does not hold.
    const stale = await commitCall(l, fx, { operationId: randomUUID(), ledgerRevision: 'x' });
    expect(stale.statusCode).toBe(409);
    expect(code(stale)).toBe('MANUAL_COMMIT_STALE');

    // A path someone edited since.
    await writeFile(join(fx.dir, 'notes-1.md'), 'a person typed this\n');
    const conflict = await commitCall(l, fx, { operationId: randomUUID() });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 'MANUAL_COMMIT_CONFLICT',
      details: { paths: ['specs/active/hand/notes-1.md'] },
    });
    await writeFile(join(fx.dir, 'notes-1.md'), 'first\n');

    // Another branch than the one the changes were made on.
    git(fx.root, 'checkout', '-q', '-b', 'feature/other');
    const moved = await commitCall(l, fx, { operationId: randomUUID() });
    expect(moved.statusCode).toBe(409);
    expect(moved.json()).toMatchObject({
      code: 'MANUAL_COMMIT_CONFLICT',
      details: { cause: 'branch-changed' },
    });
    git(fx.root, 'checkout', '-q', 'feature/work');

    // A protected branch: nothing is reserved.
    await writeFile(
      join(fx.root, '.nevo/config.yaml'),
      GIT_ON + '  commits:\n    protectedBranches:\n      - feature/work\n',
    );
    const protectedBranch = await commitCall(l, fx, { operationId: randomUUID() });
    expect(protectedBranch.statusCode).toBe(422);
    expect(protectedBranch.json()).toMatchObject({
      code: 'BRANCH_PROTECTED',
      details: { reason: 'branch-protected' },
    });
  });

  it('answers 401 without a session and 403 to a viewer and to a manager of another Specification', async () => {
    const fx = await project();
    await autoOff(fx);
    const developer = await listen(fx);
    await twoUncommitted(fx, developer);
    const body = { operationId: randomUUID() };
    const before = commitCount(fx);

    const viewer = await listen(fx, { assignments: [{ role: 'viewer', scope: {} }] });
    expect((await commitCall(viewer, fx, body)).statusCode).toBe(403);
    const other = await listen(fx, {
      assignments: [{ role: 'developer', scope: { specId: randomUUID() } }],
    });
    expect((await commitCall(other, fx, body)).statusCode).toBe(403);
    const anonymous = await viewer.app.inject({
      method: 'POST',
      url: commitUrl(fx),
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    expect(anonymous.statusCode).toBe(401);
    expect(commitCount(fx)).toBe(before);
  });

  it('commits the scope all only for the owners the caller may manage and leaves the others untouched', async () => {
    const fx = await project();
    await autoOff(fx);
    const other = await handBuilt(fx.root, 'other');
    git(fx.root, 'add', 'specs');
    git(
      fx.root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'other',
    );
    const admin = await listen(fx);
    const otherFx: Fixture = { ...fx, specId: other.specId, dir: other.dir };
    expect((await save(admin, fx, 'notes-1', 'mine\n', sha256(notes(1)))).statusCode).toBe(200);
    expect((await save(admin, otherFx, 'notes-1', 'theirs\n', sha256(notes(1)))).statusCode).toBe(
      200,
    );

    const scoped = await listen(fx, {
      assignments: [{ role: 'developer', scope: { specId: fx.specId } }],
    });
    const response = await commitCall(scoped, fx, { operationId: randomUUID(), scope: 'all' });

    expect(response.statusCode, response.body).toBe(200);
    const result = response.json<ManualCommitResult>();
    expect(result.paths).toEqual(['specs/active/hand/notes-1.md']);
    expect(result.remaining.entries).toBe(0);
    expect(git(fx.root, 'status', '--porcelain')).toBe('M specs/active/other/notes-1.md');
    const left = (await call(admin, 'GET', `${base(otherFx)}/uncommitted`)).json<UncommittedView>();
    expect(left.entries.map((entry) => entry.path)).toEqual(['specs/active/other/notes-1.md']);
  });

  it('never takes the definitions scope or the operator assertion over HTTP', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    await twoUncommitted(fx, l);

    for (const extra of [{ scope: 'definitions' }, { confirmExecutorStopped: true }]) {
      const response = await commitCall(l, fx, { operationId: randomUUID(), ...extra });
      expect(response.statusCode, response.body).toBe(400);
    }
    expect((await commitCall(l, fx, { operationId: randomUUID(), scope: 'all' })).statusCode).toBe(
      200,
    );
  });

  it('answers a body above 256 KiB with DOCUMENT_TOO_LARGE and leaves the other limits alone', async () => {
    const fx = await project();
    await autoOff(fx);
    const l = await listen(fx);
    const huge = 'a'.repeat(256 * 1024 + 1);

    const over = await commitCall(l, fx, { operationId: randomUUID(), message: huge });
    expect(over.statusCode).toBe(413);
    expect(over.json()).toEqual({ error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' });
    // A save may carry far more than that: its own limit is 2 MiB.
    const big = 'b'.repeat(300 * 1024);
    const saved = await save(l, fx, 'notes-1', big, sha256(notes(1)));
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('lists a manual commit that needs the operator and serves it as a document operation', async () => {
    const fx = await project();
    await autoOff(fx);
    const operationId = randomUUID();
    const port = createGitCommitPort(fx.engine);
    const stuckSource = createEngineDocumentWriteSource(fx.engine, {
      manualCommit: {
        deps: {
          commits: {
            ...port,
            commit: () =>
              Promise.reject(
                new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'unknown', 'not-terminated'),
              ),
          },
        },
      },
    });
    const store = new InMemoryAuthenticationStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
      },
      { auth: { store }, specs: { engine: fx.engine }, documents: { writeSource: stuckSource } },
    );
    apps.push(app);
    const l: Listening = {
      app,
      headers: { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session },
    };
    await twoUncommitted(fx, l);

    const response = await commitCall(l, fx, { operationId });
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json()).toMatchObject({ code: 'MANUAL_COMMIT_RECOVERY_REQUIRED' });

    const read = await status(l, fx, operationId);
    expect(read.json()).toMatchObject({
      action: 'manual-commit',
      stage: 'recovery-required',
      commit: { state: 'failed', recoveryRequired: true },
      actions: { recover: { available: true }, retry: { available: false } },
    });
    const list = (
      await call(l, 'GET', '/api/specs/document-operations')
    ).json<OperationListResponse>();
    expect(list.items).toEqual([
      expect.objectContaining({
        operationId,
        kind: 'manual-commit',
        status: 'recovery-required',
        action: 'manual-commit',
        documentCount: 2,
        subject: { specId: fx.specId },
      }),
    ]);
    // The checkout is held: Close refuses with the cause of a commit that needs a decision.
    const close = await call(l, 'POST', `${base(fx)}/close`, { operationId: randomUUID() });
    expect(close.json()).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-failed' },
    });
    // Retry and abandon are the document queue's: they do not apply.
    for (const action of ['retry', 'abandon']) {
      const refused = await call(
        l,
        'POST',
        `${base(fx)}/document-operations/${operationId}/${action}`,
        {},
      );
      expect(refused.statusCode).toBe(409);
      expect(code(refused)).toBe('DOCUMENT_OPERATION_STATE_INVALID');
    }
  });
});
