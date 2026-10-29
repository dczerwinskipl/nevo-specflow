import type {
  DocumentContent,
  DocumentErrorBody,
  DocumentOperationResult,
  DocumentTree,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import type { CurrentSpecsOverview } from '@nevo/specflow-contracts/specs/overview';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  DemoCatalogue,
  DemoCreateRequest,
  DemoCreatedSpec,
  DemoSessionDetail,
  DemoSessionInput,
  DemoSessionResult,
} from '@nevo/specflow-contracts/demo';
import { createRuntimeApp } from '../../src/server/app';
import { createDemoEnvironment } from '../../src/demo';
import { noAuthConfig, passwordConfig } from '../auth/support/config';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function runtime(state = createDemoEnvironment(), dataMode: 'demo' | 'project' = 'demo') {
  const app = await createRuntimeApp(
    {
      ...noAuthConfig(),
      authentication: { ...noAuthConfig().authentication, localUserId: undefined },
    },
    { dataMode, demoEnvironment: state },
  );
  apps.push(app);

  return app;
}

async function catalogue(app: FastifyInstance) {
  const result = await app.inject('/api/demo/specification-creation');
  expect(result.statusCode).toBe(200);

  return result.json<DemoCatalogue>();
}

const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;
function creation(
  cat: DemoCatalogue,
  overrides: Partial<DemoCreateRequest> = {},
): DemoCreateRequest {
  return {
    operationId: op(1),
    title: '  New capability  ',
    catalogueRevision: cat.revision,
    archetypeId: 'feature',
    archetypeVersion: 1,
    optionalDocumentIds: ['decisions'],
    ...overrides,
  };
}

function session(cat: DemoCatalogue, overrides: Partial<DemoSessionInput> = {}): DemoSessionInput {
  return {
    requestId: 'session-1',
    catalogueRevision: cat.revision,
    providerId: 'codex',
    modelId: 'model-a',
    mode: 'agent',
    ...overrides,
  };
}

async function create(app: FastifyInstance, body: DemoCreateRequest) {
  return app.inject({ method: 'POST', url: '/api/demo/specifications', payload: body });
}

async function allocate(app: FastifyInstance, specId: string, body: DemoSessionInput) {
  return app.inject({ method: 'POST', url: `/api/demo/specs/${specId}/sessions`, payload: body });
}

async function read(app: FastifyInstance, specId: string, documentId: string) {
  return (await app.inject(`/api/specs/${specId}/documents/${documentId}`)).json<DocumentContent>();
}

async function tree(app: FastifyInstance, specId: string) {
  return (await app.inject(`/api/specs/${specId}/document-tree`)).json<DocumentTree>();
}

function save(
  app: FastifyInstance,
  specId: string,
  documentId: string,
  body: { operationId: string; content: string; expectedRevision: string },
) {
  return app.inject({
    method: 'PUT',
    url: `/api/demo/specs/${specId}/documents/${documentId}`,
    payload: body,
  });
}

describe('Temporary Specification creation HTTP boundary', () => {
  it('allows only one concurrent save with the same revision, including seeded documents', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const { specId } = (await create(app, creation(cat))).json<DemoCreatedSpec>();
    let n = 10;
    for (const target of [
      { specId, documentId: 'overview' },
      { specId: 'admission', documentId: 'overview' },
    ]) {
      const revision = (await read(app, target.specId, target.documentId)).revision;
      const responses = await Promise.all(
        ['# First', '# Second'].map((content) =>
          save(app, target.specId, target.documentId, {
            operationId: op(++n),
            content,
            expectedRevision: revision,
          }),
        ),
      );
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      const refused = responses.find((response) => response.statusCode === 409)!;
      expect(refused.json<DocumentErrorBody>()).toEqual({
        error: 'DOCUMENT_REVISION_CONFLICT',
        code: 'DOCUMENT_REVISION_CONFLICT',
      });
      const accepted = responses.find((response) => response.statusCode === 200)!;
      const saved = await read(app, target.specId, target.documentId);
      expect(saved.revision).not.toBe(revision);
      expect(saved.revision).toBe(accepted.json<SaveResult>().document.revision);
      expect(saved.content).toBe(responses[0]?.statusCode === 200 ? '# First' : '# Second');
    }
  });
  it('owns created resources through existing Overview/Workspace/document and Session reads, with replay safety', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const body = creation(cat);
    const first = await create(app, body);
    expect(first.statusCode).toBe(201);
    const { specId, documentIds } = first.json<DemoCreatedSpec>();
    expect(documentIds).toEqual(['overview', 'decisions']);
    expect((await create(app, body)).json<unknown>()).toEqual(first.json<DemoCreatedSpec>());
    expect((await create(app, { ...body, title: 'Different' })).statusCode).toBe(409);
    const overview = (await app.inject('/api/specs/overview')).json<CurrentSpecsOverview>();
    expect(overview.items.filter((item: { id: string }) => item.id === specId)).toHaveLength(1);
    const before = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (before.sections.documents.state !== 'available') {
      throw new Error('Documents unavailable');
    }

    expect(before.sections.documents.data.items.map((d: { id: string }) => d.id)).toEqual(
      documentIds,
    );
    expect(before.sections.documents.data.items[0]).toMatchObject({
      filename: 'overview.md',
      kind: 'overview',
      title: 'New capability',
    });
    expect(await read(app, specId, 'overview')).toMatchObject({
      path: 'overview.md',
      title: 'New capability',
      classification: 'registered',
      type: 'overview',
    });
    expect((await app.inject(`/api/specs/${specId}/documents/spec`)).statusCode).toBe(404);
    const allocated = await allocate(app, specId, session(cat));
    expect(allocated.statusCode).toBe(200);
    expect((await allocate(app, specId, session(cat))).json<unknown>()).toEqual(
      allocated.json<DemoSessionResult>(),
    );
    const { sessionId } = allocated.json<DemoSessionResult>();
    const detail = (
      await app.inject(`/api/demo/specs/${specId}/sessions/${sessionId}`)
    ).json<DemoSessionDetail>();
    expect(detail.configuration.profile).toBe('Spec Writer');
    expect(detail.location.simulated).toBe(false);
    expect(detail.context.documents).toEqual(['decisions.md', 'overview.md']);
    expect(detail).not.toHaveProperty('messages');
    const workspace = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.sessions.state !== 'available') {
      throw new Error('Sessions unavailable');
    }

    expect(workspace.sections.sessions.data.items).toEqual([
      expect.objectContaining({ id: sessionId, status: 'quiet' }),
    ]);
    expect(workspace.recommendedSessionId).toBeUndefined();
    const next = await allocate(
      app,
      specId,
      session(cat, {
        requestId: 'session-2',
        providerId: 'claude',
        modelId: 'model-b',
        mode: 'ask',
      }),
    );
    expect(next.json<DemoSessionResult>().sessionId).not.toBe(sessionId);
    expect(
      (
        await app.inject(`/api/demo/specs/${specId}/sessions/${sessionId}`)
      ).json<DemoSessionDetail>().configuration.providerId,
    ).toBe('codex');
    expect((await app.inject(`/api/demo/specs/admission/sessions/${sessionId}`)).statusCode).toBe(
      404,
    );
  });
  it('scaffolds the minimal and the optional documents, retains saved content and rejects stale writes', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const minimal = (
      await create(
        app,
        creation(cat, { operationId: op(2), archetypeId: 'minimal', optionalDocumentIds: [] }),
      )
    ).json<DemoCreatedSpec>();
    expect(minimal.documentIds).toEqual(['overview']);
    const all = (
      await create(app, creation(cat, { optionalDocumentIds: ['decisions', 'research'] }))
    ).json<DemoCreatedSpec>();
    expect(all.documentIds).toEqual(['overview', 'decisions', 'research']);
    const revision = (await read(app, all.specId, 'research')).revision;
    const write = (n: number, content: string, specId = all.specId) =>
      save(app, specId, 'research', { operationId: op(n), content, expectedRevision: revision });
    expect((await write(30, '# Saved')).statusCode).toBe(200);
    expect((await write(31, '# Lost')).json<DocumentErrorBody>().code).toBe(
      'DOCUMENT_REVISION_CONFLICT',
    );
    expect((await read(app, all.specId, 'research')).content).toBe('# Saved');
    const wrongOwner = await write(32, '# Wrong owner', minimal.specId);
    expect([wrongOwner.statusCode, wrongOwner.json<DocumentErrorBody>().code]).toEqual([
      404,
      'DOCUMENT_NOT_FOUND',
    ]);
    const unknown = await create(
      app,
      creation(cat, { operationId: op(3), optionalDocumentIds: ['unknown'] }),
    );
    expect([unknown.statusCode, unknown.json()]).toEqual([
      422,
      { error: 'ARCHETYPE_UNKNOWN', code: 'ARCHETYPE_UNKNOWN' },
    ]);
    const stale = await create(app, creation(cat, { operationId: op(4), catalogueRevision: 'x' }));
    expect([stale.statusCode, stale.json()]).toEqual([
      409,
      { error: 'CATALOGUE_STALE', code: 'CATALOGUE_STALE' },
    ]);
    const version = await create(app, creation(cat, { operationId: op(5), archetypeVersion: 2 }));
    expect([version.statusCode, version.json<{ code: string }>().code]).toEqual([
      409,
      'CATALOGUE_STALE',
    ]);
  });
  it('replays a completed create after the catalogue revision changed, but still rejects new stale input', async () => {
    const env = createDemoEnvironment();
    const app = await runtime(env);
    const cat = await catalogue(app);
    const body = creation(cat, { operationId: op(6) });
    const first = await create(app, body);
    expect(first.statusCode).toBe(201);
    const count = env.state.specifications.size;
    env.state.catalogue.revision = 'changed-after-create';
    const replay = await create(app, body);
    expect(replay.statusCode).toBe(first.statusCode);
    expect(replay.json()).toEqual(first.json());
    expect(env.state.specifications.size).toBe(count);
    expect((await create(app, { ...body, title: 'Different' })).statusCode).toBe(409);
    expect((await create(app, { ...body, operationId: op(7) })).json<{ code: string }>().code).toBe(
      'CATALOGUE_STALE',
    );
  });
  it('resumes only failed stages and fixes the location at create, never duplicating it', async () => {
    const failures = new Set(['create', 'session', 'save']);
    const state = createDemoEnvironment({ fail: (stage) => failures.delete(stage) });
    const app = await runtime(state);
    const cat = await catalogue(app);
    const body = creation(cat, { target: { kind: 'new-worktree', branch: 'spec/logowanie-sso' } });
    expect((await create(app, body)).statusCode).toBe(503);
    expect(state.state.specifications.size).toBe(0);
    const { specId } = (await create(app, body)).json<DemoCreatedSpec>();
    const prepared = structuredClone(state.state.specifications.get(specId)?.location);
    expect(prepared).toMatchObject({ kind: 'simulated-worktree', branch: 'spec/logowanie-sso' });
    expect((await allocate(app, specId, session(cat))).json<{ error: string }>().error).toBe(
      'demo_session_allocation_failed',
    );
    const done = await allocate(app, specId, session(cat));
    expect(done.statusCode).toBe(200);
    expect(done.json<DemoSessionResult>().location).toEqual(prepared);
    expect(state.state.sessions.size).toBe(1);
    expect(state.state.specifications.size).toBe(1);
    const scoped = await app.inject(`/api/demo/specification-creation?specId=${specId}`);
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json<DemoCatalogue>().currentLocation).toEqual(prepared);
    const additional = await allocate(app, specId, session(cat, { requestId: 'session-current' }));
    expect(additional.statusCode).toBe(200);
    expect(additional.json<DemoSessionResult>().location).toEqual(prepared);
    expect(state.state.specifications.get(specId)?.location).toEqual(prepared);
    const revision = (await read(app, specId, 'overview')).revision;
    const body2 = { operationId: op(40), content: '# Changed', expectedRevision: revision };
    const blocked = await save(app, specId, 'overview', body2);
    expect([blocked.statusCode, blocked.json<DocumentErrorBody>()]).toEqual([
      409,
      {
        error: 'COMMIT_BLOCKED',
        code: 'COMMIT_BLOCKED',
        details: { reason: 'commit-blocked', blockedBy: 'git-busy' },
      },
    ]);
    expect((await read(app, specId, 'overview')).revision).toBe(revision);
    expect((await save(app, specId, 'overview', body2)).statusCode).toBe(200);
  });
  it('isolates Runtime instances, enforces mode/auth and validates supported catalogue selections', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const { specId } = (await create(app, creation(cat))).json<DemoCreatedSpec>();
    const other = await runtime();
    expect((await other.inject(`/api/specs/${specId}/workspace`)).statusCode).toBe(404);
    const project = await runtime(createDemoEnvironment(), 'project');
    expect((await project.inject('/api/demo/specification-creation')).statusCode).toBe(404);
    expect((await create(project, creation(cat))).statusCode).toBe(404);
    const secured = await createRuntimeApp(passwordConfig(), { dataMode: 'demo' });
    apps.push(secured);
    expect((await secured.inject('/api/demo/specification-creation')).statusCode).toBe(401);
    expect(
      (
        await create(
          app,
          creation(cat, {
            operationId: op(5),
            target: { kind: 'new-worktree', branch: '../escape' },
          }),
        )
      ).json<{ code: string }>().code,
    ).toBe('CREATE_OPERATION_INVALID');
    const { operationId: _omit, ...withoutOperation } = creation(cat);
    expect((await create(app, withoutOperation as DemoCreateRequest)).statusCode).toBe(400);
    expect((await allocate(app, specId, session(cat, { effort: 'invalid' }))).statusCode).toBe(400);
    expect((await allocate(app, specId, session(cat, { providerId: 'local' }))).statusCode).toBe(
      400,
    );
    expect(
      (
        await allocate(
          app,
          specId,
          session(cat, { providerId: 'claude', modelId: 'model-b', mode: 'agent' }),
        )
      ).statusCode,
    ).toBe(400);
    expect((await allocate(app, 'admission', session(cat))).statusCode).toBe(200);
  });
  it('enforces project-create and Specification-scoped allocation/manage permissions', async () => {
    const app = await createRuntimeApp(
      {
        ...noAuthConfig(),
        authorization: {
          assignments: [{ userId: 'demo-user', role: 'developer', scope: { specId: 'admission' } }],
        },
      },
      { dataMode: 'demo' },
    );
    apps.push(app);
    const cat = await catalogue(app);
    const denied = await create(app, creation(cat));
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['cache-control']).toBe('no-store');
    expect((await allocate(app, 'admission', session(cat))).statusCode).toBe(200);
    expect((await allocate(app, 'checkout', session(cat))).statusCode).toBe(403);
    const viewer = await createRuntimeApp(
      {
        ...noAuthConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'viewer', scope: {} }] },
      },
      { dataMode: 'demo' },
    );
    apps.push(viewer);
    expect((await viewer.inject('/api/demo/specification-creation')).statusCode).toBe(403);
    expect((await viewer.inject('/api/specs/admission/document-tree')).statusCode).toBe(200);
    expect(
      (
        await viewer.inject({
          method: 'POST',
          url: '/api/demo/specs/admission/document-operations',
          payload: {
            operationId: op(50),
            action: 'delete',
            kind: 'document',
            documentId: 'overview',
            expectedRevision: 'demo-document-1',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await save(viewer, 'admission', 'overview', {
          operationId: op(51),
          content: 'Forbidden',
          expectedRevision: 'demo-document-1',
        })
      ).statusCode,
    ).toBe(403);
    const invalid = await create(app, { ...creation(cat), title: '' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['cache-control']).toBe('no-store');
  });
});

describe('Nested document collection HTTP boundary', () => {
  it('creates/imports folders and files through existing scoped reads and preserves revision identity', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const { specId } = (
      await create(
        app,
        creation(cat, {
          addedDocuments: [{ path: 'research/call.txt', content: 'Transcript' }],
          folders: ['architecture'],
        }),
      )
    ).json<DemoCreatedSpec>();
    const folder = await app.inject({
      method: 'POST',
      url: `/api/demo/specs/${specId}/folders`,
      payload: { operationId: op(60), path: 'architecture/decisions' },
    });
    expect(folder.statusCode).toBe(200);
    expect(folder.json<DocumentOperationResult>()).toMatchObject({
      operationId: op(60),
      commit: { state: 'committed' },
      documents: [],
    });
    expect(folder.json<DocumentOperationResult>().folders).toContain('architecture/decisions');
    const payload = {
      operationId: op(61),
      documents: [
        { path: 'architecture/decisions/001.md', type: 'decisions', content: '# Use OIDC' },
      ],
    };
    const post = (body: object) =>
      app.inject({ method: 'POST', url: `/api/demo/specs/${specId}/documents`, payload: body });
    const first = await post(payload);
    expect(first.statusCode).toBe(200);
    expect((await post(payload)).json()).toEqual(first.json());
    const reused = await post({
      ...payload,
      documents: [{ ...payload.documents[0], content: '# Changed' }],
    });
    expect([reused.statusCode, reused.json<DocumentErrorBody>().code]).toEqual([
      409,
      'DOCUMENT_OPERATION_CONFLICT',
    ]);
    const created = first.json<DocumentOperationResult>().documents[0]!;
    // `decisions` is taken by the scaffolded template: the Engine allocates a suffixed id.
    expect(created).toMatchObject({ path: 'architecture/decisions/001.md', type: 'decisions' });
    expect(created.id).toMatch(/^decisions-[a-z2-7]{6}$/u);
    expect(await read(app, specId, created.id)).toMatchObject({
      title: 'Use OIDC',
      path: 'architecture/decisions/001.md',
      content: '# Use OIDC',
      revision: created.revision,
    });
    expect((await app.inject(`/api/specs/admission/documents/${created.id}`)).statusCode).toBe(404);
    const workspace = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available') {
      throw new Error('Documents unavailable');
    }

    expect(workspace.sections.documents.data.folders).toContain('architecture/decisions');
    // Registered documents only: the unclassified `research/call.txt` is in the tree, not here.
    expect(workspace.sections.documents.data.items).toHaveLength(3);
    expect((await tree(app, specId)).documents.map((document) => document.path)).toContain(
      'research/call.txt',
    );
    const bad = await post({
      operationId: op(62),
      documents: [
        { path: 'fresh.md', content: '' },
        { path: 'research/CALL.TXT', content: '' },
      ],
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json()).toEqual({ error: 'DOCUMENT_PATH_CONFLICT', code: 'DOCUMENT_PATH_CONFLICT' });
    const unsafe = await post({
      operationId: op(63),
      documents: [{ path: '../outside.md', content: '' }],
    });
    expect([unsafe.statusCode, unsafe.json<DocumentErrorBody>().code]).toEqual([
      400,
      'DOCUMENT_PATH_INVALID',
    ]);
    expect((await tree(app, specId)).documents).toHaveLength(4);
  });
  it('supports additions on seeded Specifications but never registers writes in project mode', async () => {
    const app = await runtime();
    const added = await app.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/documents',
      payload: {
        operationId: op(70),
        documents: [{ path: 'research/note.md', type: 'note', content: 'Note' }],
      },
    });
    expect(added.statusCode).toBe(200);
    const documentId = added.json<DocumentOperationResult>().documents[0]!.id;
    expect(documentId).toBe('note');
    expect(await read(app, 'admission', documentId)).toMatchObject({
      path: 'research/note.md',
      content: 'Note',
      title: 'note',
    });
    const workspace = (
      await app.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available') {
      throw new Error('Documents unavailable');
    }

    expect(workspace.sections.documents.data.items).toHaveLength(2);
    const seeded = await tree(app, 'admission');
    expect(seeded.documents.find((document) => document.id === 'overview')).toMatchObject({
      protected: true,
      revision: 'demo-document-1',
    });
    await save(app, 'admission', 'overview', {
      operationId: op(71),
      content: 'Saved seed',
      expectedRevision: 'demo-document-1',
    });
    const saved = await tree(app, 'admission');
    expect(saved.documents.find((document) => document.id === 'overview')?.revision).not.toBe(
      'demo-document-1',
    );
    expect(saved.revision).not.toBe(seeded.revision);
    const project = await runtime(undefined, 'project');
    for (const endpoint of ['documents', 'folders', 'document-operations']) {
      expect(
        (
          await project.inject({
            method: 'POST',
            url: '/api/demo/specs/admission/' + endpoint,
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    }
  });
});

describe('bounded demo ingest payload size', () => {
  it('accepts supported multi-file imports above Fastify default and escaped text saves', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/demo/specifications',
      payload: creation(cat, {
        // Within the Create limit of 1 MiB of added content, but escaped above Fastify's default body limit.
        addedDocuments: Array.from({ length: 6 }, (_, index) => ({
          path: `transcripts/client-${index}.txt`,
          content: ''.repeat(170000),
        })),
      }),
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<DemoCreatedSpec>();
    const target = result.documentIds.at(-1)!;
    const saved = await save(app, result.specId, target, {
      operationId: op(80),
      content: '\u0001'.repeat(200000),
      expectedRevision: (await read(app, result.specId, target)).revision,
    });
    expect(saved.statusCode).toBe(200);
  });
});

describe('seeded placeholder context reconciliation', () => {
  it('allocates file paths and refreshes them after a supported seed import', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const allocated = (await allocate(app, 'admission', session(cat))).json<DemoSessionResult>();
    const detailPath = '/api/demo/specs/admission/sessions/' + allocated.sessionId;
    expect((await app.inject(detailPath)).json<DemoSessionDetail>().context.documents).toEqual([
      'overview.md',
    ]);
    await app.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/documents',
      payload: { operationId: op(90), documents: [{ path: 'notes.md', content: 'Notes' }] },
    });
    expect((await app.inject(detailPath)).json<DemoSessionDetail>().context.documents).toEqual([
      'notes.md',
      'overview.md',
    ]);
  });
});

describe('demo document operation transport', () => {
  it('projects policy, commits paths atomically, preserves content identity and updates Session context', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const result = (
      await create(app, creation(cat, { optionalDocumentIds: [] }))
    ).json<DemoCreatedSpec>();
    const base = '/api/demo/specs/' + result.specId;
    expect((await tree(app, result.specId)).documents).toEqual([
      expect.objectContaining({
        id: 'overview',
        protected: true,
        path: 'overview.md',
        actions: {
          rename: { available: false, reason: 'protected' },
          move: { available: false, reason: 'protected' },
          delete: { available: false, reason: 'protected' },
          classify: { available: false },
        },
      }),
    ]);
    const allocated = (
      await app.inject({ method: 'POST', url: base + '/sessions', payload: session(cat) })
    ).json<DemoSessionResult>();
    const added = await app.inject({
      method: 'POST',
      url: base + '/documents',
      payload: {
        operationId: op(100),
        documents: [{ path: 'client.txt', type: 'note', content: 'Client transcript' }],
      },
    });
    const document = added.json<DocumentOperationResult>().documents[0]!;
    const command = {
      operationId: op(101),
      action: 'rename',
      kind: 'document',
      documentId: document.id,
      name: 'transcript.txt',
      expectedRevision: document.revision,
    };
    const operate = (payload: object) =>
      app.inject({ method: 'POST', url: base + '/document-operations', payload });
    const renamed = await operate(command);
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<DocumentOperationResult>().documents).toEqual([
      { id: 'note', path: 'transcript.txt', revision: document.revision, type: 'note' },
    ]);
    expect((await operate(command)).json()).toEqual(renamed.json<DocumentOperationResult>());
    const detail = (
      await app.inject(base + '/sessions/' + allocated.sessionId)
    ).json<DemoSessionDetail>();
    expect(detail.context.documents).toContain('transcript.txt');
    const workspace = (
      await app.inject('/api/specs/' + result.specId + '/workspace')
    ).json<SpecificationWorkspaceResponse>();
    expect(workspace.sections.documents.state).toBe('available');
    if (workspace.sections.documents.state === 'available') {
      expect(workspace.sections.documents.data.items).toContainEqual(
        expect.objectContaining({ id: 'note', filename: 'transcript.txt' }),
      );
    }

    const denied = await operate({
      operationId: op(102),
      action: 'delete',
      kind: 'document',
      documentId: 'overview',
      expectedRevision: (await read(app, result.specId, 'overview')).revision,
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json<DocumentErrorBody>()).toEqual({
      error: 'DOCUMENT_PROTECTED',
      code: 'DOCUMENT_PROTECTED',
      details: { reason: 'protected' },
    });
  });
});

describe('demo showcase seed', () => {
  it('seeds a nested document tree with the protected overview on admission', async () => {
    const app = await runtime(createDemoEnvironment({ showcase: true }));
    const admission = await tree(app, 'admission');
    expect(admission.folders.map((folder) => folder.path)).toEqual([
      '',
      'architektura',
      'architektura/decyzje',
      'badania',
      'notatki',
    ]);
    expect(admission.documents.find((document) => document.id === 'overview')?.protected).toBe(
      true,
    );
    expect(admission.documents.map((document) => document.path)).toContain(
      'architektura/decyzje/adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md',
    );
    const workspace = (
      await app.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available') {
      throw new Error('Documents unavailable');
    }

    expect(workspace.sections.documents.data.items).toHaveLength(4);
    for (const document of admission.documents) {
      expect((await app.inject(`/api/specs/admission/documents/${document.id}`)).statusCode).toBe(
        200,
      );
    }

    expect((await tree(app, 'security')).folders.map((folder) => folder.path)).toEqual([
      '',
      'notes',
    ]);
  });

  it('seeds rich synthetic Markdown: long overview, ADR and a frontmatter document', async () => {
    const app = await runtime(createDemoEnvironment({ showcase: true }));
    const overview = await read(app, 'admission', 'overview');
    expect(overview.content!.split('\n').length).toBeGreaterThanOrEqual(200);
    expect(overview.content).toContain('| Identyfikator | Reguła |');
    expect(overview.content).toContain('- [x]');
    expect(overview.revision).toBe('demo-document-1');
    expect((await read(app, 'admission', 'decisions')).content).toContain('## Konsekwencje');
    const risk = (await tree(app, 'admission')).documents.find(
      (document) => document.path === 'badania/ocena-ryzyka.md',
    )!;
    expect(risk.classification).toBe('unclassified');
    expect((await read(app, 'admission', risk.id)).content!.startsWith('---\n')).toBe(true);
    // The seeded revision stays editable: an optimistic save of the rich overview succeeds.
    const saved = await save(app, 'admission', 'overview', {
      operationId: op(110),
      content: overview.content + '\nEdit',
      expectedRevision: overview.revision,
    });
    expect(saved.statusCode).toBe(200);
  });

  it('serves read-only details for seeded catalogue sessions', async () => {
    const app = await runtime(createDemoEnvironment({ showcase: true }));
    const response = await app.inject('/api/demo/specs/admission/sessions/sample-session-24');
    expect(response.statusCode).toBe(200);
    expect(response.json<DemoSessionDetail>()).toMatchObject({
      sessionId: 'sample-session-24',
      specId: 'admission',
      configuration: { profile: 'Implementer' },
      context: { specification: 'Deterministic admission and execution boundaries' },
    });
    expect(
      (await app.inject('/api/demo/specs/admission/sessions/sample-session-23')).statusCode,
    ).toBe(200);
    expect(
      (await app.inject('/api/demo/specs/security/sessions/sample-session-24')).statusCode,
    ).toBe(404);
  });
});
