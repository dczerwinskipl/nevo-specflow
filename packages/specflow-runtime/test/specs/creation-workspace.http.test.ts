import type {
  DemoCatalogue,
  DemoCreateErrorCode,
  DemoCreateOptions,
  DemoCreateRequest,
  DemoCreatedSpec,
  DemoOperationStatus,
} from '@nevo/specflow-contracts/demo';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoEnvironment } from '../../src/demo';
import { demoWorkspaceIds as ids } from '../../src/features/specs/demo/seed';
import { createRuntimeApp } from '../../src/server/app';
import { noAuthConfig } from '../auth/support/config';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function runtime(
  state = createDemoEnvironment({ scenarios: true }),
  dataMode: 'demo' | 'project' = 'demo',
): Promise<FastifyInstance> {
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
const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;
async function body(app: FastifyInstance, n: number, extra: Partial<DemoCreateRequest> = {}) {
  const cat = (await app.inject('/api/demo/specification-creation')).json<DemoCatalogue>();
  return {
    operationId: op(n),
    title: 'Nowa obsługa płatności',
    catalogueRevision: cat.revision,
    archetypeId: 'minimal',
    archetypeVersion: 1,
    optionalDocumentIds: [],
    ...extra,
  } satisfies DemoCreateRequest;
}
const post = (app: FastifyInstance, payload: unknown, scenario?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/demo/specifications',
    payload: payload as object,
    ...(scenario ? { headers: { 'x-demo-scenario': scenario } } : {}),
  });
const options = async (app: FastifyInstance, scenario?: string) =>
  app.inject({
    url: '/api/demo/specs/create-options' + (scenario ? `?demoScenario=${scenario}` : ''),
  });
const specCount = async (app: FastifyInstance, workspaceId: string) =>
  (await options(app))
    .json<DemoCreateOptions>()
    .workspaces.find((w) => w.workspaceId === workspaceId)?.specCount;
const codeOf = (response: { json: <T>() => T }) => response.json<{ code?: string }>().code;

describe('create-options endpoint', () => {
  it('serves the default seed with no-store and the happy-path workspaces', async () => {
    const app = await runtime();
    const response = await options(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const data = response.json<DemoCreateOptions>();
    expect(data.primaryWorkspaceId).toBe(ids.main);
    expect(data.workspaces.map((w) => [w.branch, w.specCount])).toEqual([
      ['develop', 0],
      ['feature/platform', 2],
      ['feature/payments', 1],
      ['spec/architecture', 3],
      [undefined, 0],
      [undefined, 1],
    ]);
    expect(data).toMatchObject({
      newWorktree: { status: 'available' },
      defaultBaseRef: 'develop',
      branchPattern: 'feature/{slug}',
      integrationTargetBranch: 'develop',
    });
    expect(data.baseRefs.map((b) => b.ref)).toContain('release/1.4');
  });
  it('reaches state variants through the demoScenario query and the x-demo-scenario header', async () => {
    const app = await runtime();
    expect((await options(app, 'git-disabled')).json<DemoCreateOptions>().newWorktree).toEqual({
      status: 'disabled',
      reason: 'git-disabled',
    });
    const header = await app.inject({
      url: '/api/demo/specs/create-options',
      headers: { 'x-demo-scenario': 'no-integration-target' },
    });
    expect(header.json<DemoCreateOptions>().integrationTargetBranch).toBeUndefined();
    expect(
      (await options(app, 'linked-none-selectable'))
        .json<DemoCreateOptions>()
        .workspaces.filter((w) => w.kind === 'linked' && w.selectable),
    ).toEqual([]);
    expect(
      (await options(app, 'git-unavailable')).json<DemoCreateOptions>().newWorktree.status,
    ).toBe('unavailable');
    // scenarios never alter the default served afterwards
    expect((await options(app)).json<DemoCreateOptions>().newWorktree.status).toBe('available');
  });
  it('fails the options read with permission denied or error scenarios, and rejects unknown names', async () => {
    const app = await runtime();
    const forbidden = await options(app, 'options-forbidden');
    // Like the real authorization handler: `{ error: 'forbidden' }`, no `code`.
    expect([forbidden.statusCode, forbidden.json()]).toEqual([403, { error: 'forbidden' }]);
    expect((await options(app, 'options-error')).statusCode).toBe(503);
    const unknown = await options(app, 'bogus');
    expect([unknown.statusCode, codeOf(unknown)]).toEqual([400, 'DEMO_INVALID_SCENARIO']);
  });
  it('ignores the seam silently by default (param, header, unknown names, create)', async () => {
    const off = await runtime(createDemoEnvironment());
    expect((await options(off, 'git-disabled')).json<DemoCreateOptions>().newWorktree.status).toBe(
      'available',
    );
    const unknown = await options(off, 'bogus');
    expect(unknown.statusCode).toBe(200);
    const header = await off.inject({
      url: '/api/demo/specs/create-options',
      headers: { 'x-demo-scenario': 'options-forbidden' },
    });
    expect(header.statusCode).toBe(200);
    const created = await post(off, await body(off, 90), 'forbidden');
    expect(created.statusCode).toBe(201);
    const stillOff = await runtime(createDemoEnvironment({ scenarios: false }));
    expect((await options(stillOff, 'options-error')).statusCode).toBe(200);
  });
  it('enables the seam only through the explicit demoScenarios runtime flag', async () => {
    const make = async (demoScenarios?: boolean) => {
      const app = await createRuntimeApp(
        {
          ...noAuthConfig(),
          authentication: { ...noAuthConfig().authentication, localUserId: undefined },
        },
        { dataMode: 'demo', ...(demoScenarios ? { demoScenarios } : {}) },
      );
      apps.push(app);
      return app;
    };
    expect((await options(await make(), 'options-error')).statusCode).toBe(200);
    expect((await options(await make(true), 'options-error')).statusCode).toBe(503);
  });
  it('is absent from project mode', async () => {
    const project = await runtime(createDemoEnvironment({ scenarios: true }), 'project');
    expect(
      (
        await project.inject({
          url: '/api/demo/specs/create-options?demoScenario=git-disabled',
        })
      ).statusCode,
    ).toBe(404);
    expect((await options(project)).statusCode).toBe(404);
    expect((await project.inject(`/api/demo/specifications/operations/${op(1)}`)).statusCode).toBe(
      404,
    );
  });
});

describe('create with target', () => {
  it('main tile sends no target and increments the primary workspace', async () => {
    const app = await runtime();
    const response = await post(app, await body(app, 1));
    expect(response.statusCode).toBe(201);
    expect(response.json<DemoCreatedSpec>()).toMatchObject({
      operationId: op(1),
      kind: 'specification-create',
      status: 'completed',
      workspaceId: ids.main,
      slug: 'nowa-obsluga-platnosci',
      relativeManifestPath: 'specs/nowa-obsluga-platnosci/manifest.json',
    });
    expect(await specCount(app, ids.main)).toBe(1);
  });
  it('existing tile attaches to the selected workspace', async () => {
    const app = await runtime();
    const response = await post(
      app,
      await body(app, 1, { target: { kind: 'existing', workspaceId: ids.platform } }),
    );
    expect(response.json<DemoCreatedSpec>().workspaceId).toBe(ids.platform);
    expect([await specCount(app, ids.platform), await specCount(app, ids.main)]).toEqual([3, 0]);
    const dirty = await post(
      app,
      await body(app, 2, { target: { kind: 'existing', workspaceId: ids.payments } }),
    );
    expect(dirty.statusCode).toBe(201);
    expect(await specCount(app, ids.payments)).toBe(2);
  });
  it('new tile with defaults sends no overrides and gets a generated branch and a new workspace', async () => {
    const app = await runtime();
    const input = await body(app, 1, { target: { kind: 'new-worktree' } });
    expect(JSON.stringify(input.target)).toBe('{"kind":"new-worktree"}');
    const result = (await post(app, input)).json<DemoCreatedSpec>();
    const after = (await options(app)).json<DemoCreateOptions>();
    const created = after.workspaces.find((w) => w.workspaceId === result.workspaceId);
    expect(created).toMatchObject({
      branch: 'feature/nowa-obsluga-platnosci',
      specCount: 1,
      kind: 'linked',
      selectable: true,
    });
    expect(after.workspaces).toHaveLength(7);
    expect(after.baseRefs.map((b) => b.ref)).toContain('feature/nowa-obsluga-platnosci');
  });
  it('new tile accepts baseRef, integration target and own branch', async () => {
    const app = await runtime();
    const base = await post(
      app,
      await body(app, 1, {
        target: {
          kind: 'new-worktree',
          baseRef: 'feature/platform',
          integrationTargetWorkspaceId: ids.platform,
        },
      }),
    );
    expect(base.statusCode).toBe(201);
    const named = await post(
      app,
      await body(app, 2, { target: { kind: 'new-worktree', branch: 'feature/payments-v2' } }),
    );
    expect(named.statusCode).toBe(201);
    const created = (await options(app))
      .json<DemoCreateOptions>()
      .workspaces.find((w) => w.workspaceId === named.json<DemoCreatedSpec>().workspaceId);
    expect(created?.branch).toBe('feature/payments-v2');
  });
  it('rejects fields outside the tile semantics', async () => {
    const app = await runtime();
    for (const target of [
      { kind: 'existing', workspaceId: ids.platform, baseRef: 'develop' },
      { kind: 'existing', workspaceId: ids.platform, branch: 'feature/x' },
      { kind: 'existing', workspaceId: ids.platform, integrationTargetWorkspaceId: ids.main },
      { kind: 'existing' },
      { kind: 'main' },
      { kind: 'new-worktree', workspaceId: ids.platform },
    ]) {
      const response = await post(app, await body(app, 1, { target } as never));
      expect(response.statusCode).toBe(400);
    }
    expect(await specCount(app, ids.platform)).toBe(2);
  });
});

describe('create error codes', () => {
  const expectError = async (
    app: FastifyInstance,
    input: unknown,
    status: number,
    code: DemoCreateErrorCode | 'forbidden',
    scenario?: string,
  ) => {
    const response = await post(app, input, scenario);
    expect([response.statusCode, codeOf(response) ?? 'forbidden']).toEqual([status, code]);
    // The Engine repeats the code in `error`; only the demo-only code carries a message.
    if (code !== 'DEMO_WORKSPACE_UNAVAILABLE' && code !== 'forbidden')
      expect(response.json<{ error: string }>().error).toBe(code);
  };
  it('maps real validation to the Engine codes (BRANCH_ALREADY_EXISTS, BASE_REF_NOT_FOUND, CREATE_OPERATION_INVALID) and the demo-only DEMO_WORKSPACE_UNAVAILABLE', async () => {
    const app = await runtime();
    await expectError(
      app,
      await body(app, 1, { target: { kind: 'new-worktree', branch: 'feature/platform' } }),
      409,
      'BRANCH_ALREADY_EXISTS',
    );
    await expectError(
      app,
      await body(app, 2, { target: { kind: 'existing', workspaceId: ids.legacy } }),
      409,
      'DEMO_WORKSPACE_UNAVAILABLE',
    );
    await expectError(
      app,
      await body(app, 3, {
        target: { kind: 'existing', workspaceId: '0b8f1c1e-0a11-4c6e-9a01-0000000000ff' },
      }),
      409,
      'DEMO_WORKSPACE_UNAVAILABLE',
    );
    await expectError(
      app,
      await body(app, 4, {
        target: { kind: 'new-worktree', integrationTargetWorkspaceId: ids.payments },
      }),
      400,
      'CREATE_OPERATION_INVALID',
    );
    await expectError(
      app,
      await body(app, 5, { target: { kind: 'new-worktree', baseRef: 'missing' } }),
      422,
      'BASE_REF_NOT_FOUND',
    );
    await expectError(
      app,
      await body(app, 6, { target: { kind: 'new-worktree', branch: 'a..b' } }),
      400,
      'CREATE_OPERATION_INVALID',
    );
    expect(await specCount(app, ids.main)).toBe(0);
  });
  it('validates against the scenario-shaped options (stale options)', async () => {
    const app = await runtime();
    await expectError(
      app,
      await body(app, 1, { target: { kind: 'new-worktree' } }),
      409,
      'DEMO_WORKSPACE_UNAVAILABLE',
      'git-disabled',
    );
    await expectError(
      app,
      await body(app, 2),
      409,
      'DEMO_WORKSPACE_UNAVAILABLE',
      'primary-detached',
    );
  });
  it('forces each conflict through scenarios and leaves the operation retryable', async () => {
    const app = await runtime();
    const input = await body(app, 1, { target: { kind: 'new-worktree', branch: 'feature/new' } });
    await expectError(app, input, 409, 'BRANCH_ALREADY_EXISTS', 'branch-taken');
    await expectError(app, input, 409, 'DEMO_WORKSPACE_UNAVAILABLE', 'stale-workspace');
    await expectError(
      app,
      input,
      400,
      'CREATE_OPERATION_INVALID',
      'integration-target-unavailable',
    );
    await expectError(app, input, 422, 'BASE_REF_NOT_FOUND', 'base-ref-unavailable');
    await expectError(app, input, 403, 'forbidden', 'forbidden');
    expect((await post(app, input, 'bogus')).statusCode).toBe(400);
    expect((await post(app, input)).statusCode).toBe(201);
  });
  it('answers CREATE_CONFLICT for a changed body under the same operationId', async () => {
    const app = await runtime();
    expect((await post(app, await body(app, 1))).statusCode).toBe(201);
    await expectError(app, await body(app, 1, { title: 'Inny tytuł' }), 409, 'CREATE_CONFLICT');
  });
});

describe('idempotency, uncertain and recovery results', () => {
  it('replays the same operationId to the same result without a second increment', async () => {
    const app = await runtime();
    const input = await body(app, 1, { target: { kind: 'new-worktree' } });
    const first = await post(app, input);
    const second = await post(app, input);
    expect(second.json()).toEqual(first.json());
    expect(await specCount(app, first.json<DemoCreatedSpec>().workspaceId)).toBe(1);
    const status = (
      await app.inject(`/api/demo/specifications/operations/${op(1)}`)
    ).json<DemoOperationStatus>();
    expect(status).toMatchObject({
      operationId: op(1),
      status: 'completed',
      result: first.json<DemoCreatedSpec>(),
    });
    expect(
      (await app.inject(`/api/demo/specifications/operations/${op(2)}`)).json<DemoOperationStatus>()
        .status,
    ).toBe('not-started');
  });
  it('network-uncertain commits but drops the response; replay returns the committed result', async () => {
    const app = await runtime();
    const input = await body(app, 1);
    const dropped = await post(app, input, 'network-uncertain').then(
      (response) => response,
      () => undefined,
    );
    expect(dropped?.statusCode !== 201).toBe(true);
    expect(await specCount(app, ids.main)).toBe(1);
    const replay = await post(app, input);
    expect(replay.statusCode).toBe(201);
    expect(replay.json<DemoCreatedSpec>().workspaceId).toBe(ids.main);
    expect(await specCount(app, ids.main)).toBe(1);
  });
  it('recovery-required blocks until the status read resolves it', async () => {
    const app = await runtime();
    const input = await body(app, 1, { target: { kind: 'new-worktree', branch: 'feature/rec' } });
    const held = await post(app, input, 'recovery-required');
    expect([held.statusCode, codeOf(held)]).toEqual([503, 'CREATE_RECOVERY_REQUIRED']);
    expect(await specCount(app, ids.main)).toBe(0);
    expect((await post(app, input)).statusCode).toBe(503);
    const url = `/api/demo/specifications/operations/${op(1)}`;
    const still = (await app.inject(url)).json<DemoOperationStatus>();
    expect(still).toMatchObject({
      status: 'recovery-required',
      step: 'workspace-prepared',
      branch: 'feature/rec',
    });
    const resolved = (
      await app.inject({ url, headers: { 'x-demo-scenario': 'recovery-resolved' } })
    ).json<DemoOperationStatus>();
    expect(resolved.status).toBe('completed');
    expect(resolved.result?.workspaceId).toBe(still.workspaceId);
    const replay = await post(app, input);
    expect(replay.json()).toEqual(resolved.result);
    expect(await specCount(app, still.workspaceId!)).toBe(1);
  });
});

describe('removed legacy create surface', () => {
  it('rejects a body without operationId or with legacy requestId, and the workplace stage is gone', async () => {
    const app = await runtime();
    const { operationId: _omit, ...rest } = await body(app, 1);
    expect((await post(app, rest)).statusCode).toBe(400);
    expect((await post(app, { ...rest, requestId: 'legacy-1' })).statusCode).toBe(400);
    const created = (await post(app, await body(app, 2))).json<DemoCreatedSpec>();
    const prepared = await app.inject({
      method: 'POST',
      url: `/api/demo/specs/${created.specId}/workplace`,
      payload: { requestId: 'wp', location: 'current' },
    });
    expect(prepared.statusCode).toBe(404);
  });
});
