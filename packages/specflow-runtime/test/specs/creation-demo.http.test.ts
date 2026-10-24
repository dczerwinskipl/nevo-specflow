import type {
  DemoCreatedSpec,
  DemoDocumentTree,
  DemoDocumentsResult,
  DemoDocumentOperationResult,
  DemoError,
  DemoSessionResult,
  DemoSessionDetail,
} from '@nevo/specflow-contracts/demo';
import type { CurrentSpecsOverview } from '@nevo/specflow-contracts/specs/overview';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  DemoCatalogue,
  DemoCreateRequest,
  DemoSessionInput,
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
    archetypeVersion: '2',
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
describe('Temporary Specification creation HTTP boundary', () => {
  it('allows only one concurrent save with the same revision, including seeded documents', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const { specId, documentIds } = (await create(app, creation(cat))).json<DemoCreatedSpec>();
    for (const target of [
      { specId, documentId: documentIds[0]!, revision: '1' },
      { specId: 'admission', documentId: 'spec', revision: 'demo-document-1' },
    ]) {
      const url = `/api/demo/specs/${target.specId}/documents/${target.documentId}`;
      const responses = await Promise.all(
        ['# First', '# Second'].map((content) =>
          app.inject({
            method: 'PUT',
            url,
            payload: { content, expectedRevision: target.revision },
          }),
        ),
      );
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      const saved = (
        await app.inject(`/api/specs/${target.specId}/documents/${target.documentId}`)
      ).json<{ content: string; revision: string }>();
      expect(saved.revision).toBe(target.revision + '-next');
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
    expect(documentIds).toHaveLength(2);
    expect(new Set(documentIds).size).toBe(2);
    expect((await create(app, body)).json<unknown>()).toEqual(first.json<DemoCreatedSpec>());
    expect((await create(app, { ...body, title: 'Different' })).statusCode).toBe(409);
    const overview = (await app.inject('/api/specs/overview')).json<CurrentSpecsOverview>();
    expect(overview.items.filter((item: { id: string }) => item.id === specId)).toHaveLength(1);
    const before = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (before.sections.documents.state !== 'available') throw new Error('Documents unavailable');
    expect(before.sections.documents.data.items.map((d: { id: string }) => d.id)).toEqual(
      documentIds,
    );
    expect(before.sections.documents.data.items[0]?.filename).toBe('specification.md');
    expect(
      (await app.inject(`/api/specs/${specId}/documents/${documentIds[0]}`)).json<{
        path: string;
      }>().path,
    ).toBe('specification.md');
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
    expect(detail).not.toHaveProperty('messages');
    const workspace = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.sessions.state !== 'available') throw new Error('Sessions unavailable');
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
  it('supports empty and optional manifests, retains saved content and rejects stale writes', async () => {
    const app = await runtime();
    const cat = await catalogue(app);
    const empty = (
      await create(
        app,
        creation(cat, {
          operationId: op(2),
          archetypeId: 'empty',
          archetypeVersion: '1',
          optionalDocumentIds: [],
        }),
      )
    ).json<DemoCreatedSpec>();
    expect(empty.documentIds).toEqual([]);
    expect((await app.inject(`/api/specs/${empty.specId}/documents/spec`)).statusCode).toBe(404);
    const all = (
      await create(app, creation(cat, { optionalDocumentIds: ['decisions', 'research'] }))
    ).json<DemoCreatedSpec>();
    expect(all.documentIds).toHaveLength(3);
    const researchId = all.documentIds[2];
    const url = `/api/demo/specs/${all.specId}/documents/${researchId}`;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          payload: { content: '# Saved', expectedRevision: '1' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          payload: { content: '# Lost', expectedRevision: '1' },
        })
      ).json<{ error: string }>().error,
    ).toBe('demo_document_revision_conflict');
    expect(
      (await app.inject(`/api/specs/${all.specId}/documents/${researchId}`)).json<{
        content: string;
      }>().content,
    ).toBe('# Saved');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/demo/specs/${empty.specId}/documents/${researchId}`,
          payload: { content: '# Wrong owner', expectedRevision: '1' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await create(app, creation(cat, { operationId: op(3), optionalDocumentIds: ['unknown'] })))
        .statusCode,
    ).toBe(400);
    expect(
      (await create(app, creation(cat, { operationId: op(4), catalogueRevision: 'stale' }))).json<{
        error: string;
      }>().error,
    ).toBe('demo_catalogue_stale');
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
    expect(
      (await create(app, { ...body, operationId: op(7) })).json<{ error: string }>().error,
    ).toBe('demo_catalogue_stale');
  });
  it('resumes only failed stages and fixes the location at create, never duplicating it', async () => {
    const failures = new Set(['create', 'session', 'save']);
    const state = createDemoEnvironment({ fail: (stage) => failures.delete(stage) });
    const app = await runtime(state);
    const cat = await catalogue(app);
    const body = creation(cat, { target: { kind: 'new-worktree', branch: 'spec/logowanie-sso' } });
    expect((await create(app, body)).statusCode).toBe(503);
    expect(state.state.specifications.size).toBe(0);
    const { specId, documentIds } = (await create(app, body)).json<DemoCreatedSpec>();
    const documentId = documentIds[0];
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
    const url = `/api/demo/specs/${specId}/documents/${documentId}`;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          payload: { content: '# Changed', expectedRevision: '1' },
        })
      ).json<{ error: string }>().error,
    ).toBe('demo_document_save_failed');
    expect(
      (await app.inject(`/api/specs/${specId}/documents/${documentId}`)).json<{
        revision: string;
      }>().revision,
    ).toBe('1');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          payload: { content: '# Changed', expectedRevision: '1' },
        })
      ).statusCode,
    ).toBe(200);
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
    expect(
      (
        await viewer.inject({
          method: 'POST',
          url: '/api/demo/specs/admission/document-operations',
          payload: {
            requestId: 'forbidden',
            action: 'delete',
            kind: 'document',
            documentId: 'spec',
            expectedRevision: '1',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await viewer.inject({
          method: 'PUT',
          url: '/api/demo/specs/admission/documents/spec',
          payload: { content: 'Forbidden', expectedRevision: 'demo-document-1' },
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
      payload: { requestId: 'folder', path: 'architecture/decisions' },
    });
    expect(folder.statusCode).toBe(200);
    expect(folder.json<{ folders: string[] }>().folders).toContain('architecture/decisions');
    const payload = {
      requestId: 'import',
      documents: [
        { path: 'architecture/decisions/001.md', title: 'OIDC decision', content: '# Use OIDC' },
      ],
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/demo/specs/${specId}/documents`,
      payload,
    });
    expect(first.statusCode).toBe(200);
    const replay = await app.inject({
      method: 'POST',
      url: `/api/demo/specs/${specId}/documents`,
      payload,
    });
    expect(replay.json()).toEqual(first.json());
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/demo/specs/${specId}/documents`,
          payload: { ...payload, documents: [{ ...payload.documents[0], content: '# Changed' }] },
        })
      ).statusCode,
    ).toBe(409);
    const documentId = first.json<{ documentIds: string[] }>().documentIds[0];
    const read = await app.inject(`/api/specs/${specId}/documents/${documentId}`);
    expect(read.json()).toMatchObject({
      title: 'OIDC decision',
      path: 'architecture/decisions/001.md',
      content: '# Use OIDC',
      revision: '1',
    });
    expect((await app.inject(`/api/specs/admission/documents/${documentId}`)).statusCode).toBe(404);
    const workspace = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available')
      throw new Error('Documents unavailable');
    expect(workspace.sections.documents.data.folders).toContain('architecture/decisions');
    expect(workspace.sections.documents.data.items).toHaveLength(4);
    const bad = await app.inject({
      method: 'POST',
      url: `/api/demo/specs/${specId}/documents`,
      payload: {
        requestId: 'collision',
        documents: [
          { path: 'fresh.md', content: '' },
          { path: 'research/CALL.TXT', content: '' },
        ],
      },
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json()).toEqual({ error: 'demo_document_path_conflict' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/demo/specs/${specId}/documents`,
          payload: { requestId: 'unsafe', documents: [{ path: '../outside.md', content: '' }] },
        })
      ).statusCode,
    ).toBe(400);
    const after = (
      await app.inject(`/api/specs/${specId}/workspace`)
    ).json<SpecificationWorkspaceResponse>();
    if (after.sections.documents.state !== 'available') throw new Error('Documents unavailable');
    expect(after.sections.documents.data.items).toHaveLength(4);
  });
  it('supports additions on seeded Specifications but never registers writes in project mode', async () => {
    const app = await runtime();
    const added = await app.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/documents',
      payload: { requestId: 'add', documents: [{ path: 'research/note.md', content: 'Note' }] },
    });
    expect(added.statusCode).toBe(200);
    const documentId = added.json<{ documentIds: string[] }>().documentIds[0];
    expect((await app.inject(`/api/specs/admission/documents/${documentId}`)).json()).toMatchObject(
      { path: 'research/note.md', content: 'Note' },
    );
    const workspace = (
      await app.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available')
      throw new Error('Documents unavailable');
    expect(workspace.sections.documents.data.items).toHaveLength(2);
    const seedManifest = (
      await app.inject('/api/demo/specs/admission/document-tree')
    ).json<DemoDocumentTree>();
    expect(
      seedManifest.documents.find((document) => document.id === 'spec')?.required,
    ).toBeUndefined();
    await app.inject({
      method: 'PUT',
      url: '/api/demo/specs/admission/documents/spec',
      payload: { content: 'Saved seed', expectedRevision: 'demo-document-1' },
    });
    const savedManifest = (
      await app.inject('/api/demo/specs/admission/document-tree')
    ).json<DemoDocumentTree>();
    expect(savedManifest.documents.find((document) => document.id === 'spec')?.revision).toBe(
      'demo-document-1-next',
    );
    const project = await runtime(undefined, 'project');
    expect((await project.inject('/api/demo/specs/admission/document-tree')).statusCode).toBe(404);
    for (const endpoint of ['documents', 'folders', 'document-operations'])
      expect(
        (
          await project.inject({
            method: 'POST',
            url: '/api/demo/specs/admission/' + endpoint,
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
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
        addedDocuments: Array.from({ length: 6 }, (_, index) => ({
          path: `transcripts/client-${index}.txt`,
          content: 'a'.repeat(200000),
        })),
      }),
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<DemoCreatedSpec>();
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/demo/specs/${result.specId}/documents/${result.documentIds.at(-1)}`,
      payload: { content: '\u0001'.repeat(200000), expectedRevision: '1' },
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
      'specification.md',
    ]);
    await app.inject({
      method: 'POST',
      url: '/api/demo/specs/admission/documents',
      payload: {
        requestId: 'seed-context-add',
        documents: [{ path: 'notes.md', content: 'Notes' }],
      },
    });
    expect((await app.inject(detailPath)).json<DemoSessionDetail>().context.documents).toEqual([
      'specification.md',
      'notes.md',
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
    const tree = (await app.inject(base + '/document-tree')).json<DemoDocumentTree>();
    expect(tree.documents).toEqual([
      expect.objectContaining({
        required: true,
        path: 'specification.md',
        actions: {
          rename: { available: false, reason: 'required_document_path' },
          move: { available: false, reason: 'required_document_path' },
          delete: { available: false, reason: 'required_document_path' },
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
        requestId: 'new',
        documents: [{ path: 'client.txt', content: 'Client transcript' }],
      },
    });
    const documentId = added.json<DemoDocumentsResult>().documentIds[0]!;
    const command = {
      requestId: 'rename',
      action: 'rename',
      kind: 'document',
      documentId,
      name: 'transcript.txt',
      expectedRevision: '1',
    };
    const renamed = await app.inject({
      method: 'POST',
      url: base + '/document-operations',
      payload: command,
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<DemoDocumentOperationResult>().documents).toContainEqual({
      id: documentId,
      path: 'transcript.txt',
      revision: '1-next',
    });
    expect(
      (
        await app.inject({ method: 'POST', url: base + '/document-operations', payload: command })
      ).json(),
    ).toEqual(renamed.json<DemoDocumentOperationResult>());
    const detail = (
      await app.inject(base + '/sessions/' + allocated.sessionId)
    ).json<DemoSessionDetail>();
    expect(detail.context.documents).toContain('transcript.txt');
    const workspace = (
      await app.inject('/api/specs/' + result.specId + '/workspace')
    ).json<SpecificationWorkspaceResponse>();
    expect(workspace.sections.documents.state).toBe('available');
    if (workspace.sections.documents.state === 'available')
      expect(workspace.sections.documents.data.items).toContainEqual(
        expect.objectContaining({ id: documentId, filename: 'transcript.txt', revision: '1-next' }),
      );
    const denied = await app.inject({
      method: 'POST',
      url: base + '/document-operations',
      payload: {
        requestId: 'protected',
        action: 'delete',
        kind: 'document',
        documentId: result.documentIds[0],
        expectedRevision: '1',
      },
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json<DemoError>().error).toBe('demo_document_required');
  });
});

describe('demo showcase seed', () => {
  it('seeds a nested document tree with a required root document on admission', async () => {
    const app = await runtime(createDemoEnvironment({ showcase: true }));
    const tree = (
      await app.inject('/api/demo/specs/admission/document-tree')
    ).json<DemoDocumentTree>();
    expect(tree.folders.map((folder) => folder.path)).toEqual([
      '',
      'architektura',
      'architektura/decyzje',
      'badania',
      'notatki',
    ]);
    expect(tree.documents.find((document) => document.id === 'spec')?.required).toBe(true);
    expect(tree.documents.map((document) => document.path)).toContain(
      'architektura/decyzje/adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md',
    );
    const workspace = (
      await app.inject('/api/specs/admission/workspace')
    ).json<SpecificationWorkspaceResponse>();
    if (workspace.sections.documents.state !== 'available')
      throw new Error('Documents unavailable');
    expect(workspace.sections.documents.data.items).toHaveLength(5);
    for (const document of tree.documents)
      expect((await app.inject(`/api/specs/admission/documents/${document.id}`)).statusCode).toBe(
        200,
      );
    const other = (
      await app.inject('/api/demo/specs/security/document-tree')
    ).json<DemoDocumentTree>();
    expect(other.folders.map((folder) => folder.path)).toEqual(['']);
  });

  it('seeds rich synthetic Markdown: long specification, ADR and a frontmatter document', async () => {
    const app = await runtime(createDemoEnvironment({ showcase: true }));
    const spec = (await app.inject('/api/specs/admission/documents/spec')).json<{
      content: string;
      revision: string;
    }>();
    expect(spec.content.split('\n').length).toBeGreaterThanOrEqual(200);
    expect(spec.content).toContain('| Identyfikator | Reguła |');
    expect(spec.content).toContain('- [x]');
    expect(spec.revision).toBe('demo-document-1');
    const adr = (await app.inject('/api/specs/admission/documents/showcase-adr-001')).json<{
      content: string;
    }>();
    expect(adr.content).toContain('## Konsekwencje');
    const front = (await app.inject('/api/specs/admission/documents/showcase-ocena-ryzyka')).json<{
      content: string;
    }>();
    expect(front.content.startsWith('---\n')).toBe(true);
    // The seeded revision stays editable: an optimistic save of the rich specification succeeds.
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/demo/specs/admission/documents/spec',
      payload: { content: spec.content + '\nEdit', expectedRevision: spec.revision },
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
