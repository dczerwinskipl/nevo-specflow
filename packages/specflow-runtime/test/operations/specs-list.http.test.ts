import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CREATE_JOURNAL_RELATIVE_DIR,
  bootstrapProjectHome,
  createSpecificationFromRequest,
} from '@nevo/specflow-engine/testing';
import type { OperationListResponse } from '@nevo/specflow-contracts/operations';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createOperationProgressRegistry } from '../../src/features/operations';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

interface Assignment {
  role: 'developer' | 'viewer';
  scope: Record<string, string>;
}

async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-ops-list-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
  execFileSync('git', ['add', '.gitignore', '.nevo/config.yaml'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'initial'],
    { cwd: root },
  );
  const engine = await bootstrapProjectHome(root);
  // One real Create: its journal is the template of every handcrafted variant below.
  const created = await createSpecificationFromRequest(engine, {
    operationId: randomUUID(),
    title: 'Real create',
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  const dir = join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR);
  const template = JSON.parse(
    await readFile(join(dir, created.operationId + '.json'), 'utf8'),
  ) as Record<string, unknown>;
  return { root, engine, dir, created, template };
}

type Project = Awaited<ReturnType<typeof project>>;

/** A journal cloned from the real one with another id, stage and age. */
async function variant(
  fx: Project,
  overrides: Record<string, unknown>,
  ageMs = 0,
  spec: 'same' | 'other' = 'other',
): Promise<string> {
  const operationId = randomUUID();
  const record = {
    ...fx.template,
    operationId,
    ...(spec === 'other' ? { specId: randomUUID() } : {}),
    ...overrides,
  };
  const path = join(fx.dir, operationId + '.json');
  await writeFile(path, JSON.stringify(record));
  const at = new Date(Date.now() - ageMs);
  await utimes(path, at, at);
  return operationId;
}

async function listen(
  fx: Project | undefined,
  options: {
    assignments?: Assignment[];
    registry?: ReturnType<typeof createOperationProgressRegistry>;
    authenticated?: boolean;
  } = {},
) {
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
        assignments: (options.assignments ?? [{ role: 'developer', scope: {} }]).map(
          (assignment) => ({ userId: 'demo-user', ...assignment }),
        ),
      },
    },
    {
      auth: { store },
      ...(options.registry ? { operations: { registry: options.registry } } : {}),
      ...(fx ? { specs: { engine: fx.engine } } : {}),
    },
  );
  apps.push(app);
  const get = (query = '', extra: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url: '/api/specs/operations' + query,
      headers: { ...headers, ...extra },
    });
  return { app, get };
}

const list = (body: string) => JSON.parse(body) as OperationListResponse;

describe('GET /api/specs/operations', () => {
  it('lists Create operations with a strict projection, status table, order and counts', async () => {
    const fx = await project();
    const started = '2026-10-20T09:00:00.000Z';
    const progress = await variant(fx, { stage: 'manifest-writing', startedAt: started });
    const committing = await variant(fx, {
      stage: 'commit-writing',
      commit: { required: true, branch: 'develop', parentHead: 'a'.repeat(40) },
      reason: 'secret internal reason',
    });
    const interrupted = await variant(fx, { stage: 'registry-writing' }, 10 * 60_000);
    const recovery = await variant(fx, { stage: 'recovery-required', reason: 'secret' }, 60_000);
    const corrupt = randomUUID();
    await writeFile(join(fx.dir, corrupt + '.json'), '{ broken');
    const { get } = await listen(fx);

    const response = await get();
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toMatch(/^W\/"/);
    const body = list(response.body);
    expect(Object.keys(body).sort()).toEqual(['counts', 'generatedAt', 'items', 'truncated']);
    expect(body.counts).toEqual({ inProgress: 2, recoveryRequired: 3, failed: 0, completed: 1 });
    expect(body.truncated).toBe(false);

    const byId = new Map(body.items.map((item) => [item.operationId, item]));
    expect(byId.get(progress)).toMatchObject({
      kind: 'specification-create',
      status: 'in-progress',
      title: 'Real create',
      startedAt: started,
      currentStep: 'writing-specification',
      target: { workspaceKind: 'existing', workspaceId: fx.engine.workspace.workspaceId },
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'writing-specification', status: 'running' },
        { id: 'registering', status: 'pending' },
      ],
    });
    expect(byId.get(committing)).toMatchObject({
      status: 'in-progress',
      currentStep: 'committing-specification',
      target: { branch: 'develop' },
    });
    expect(byId.get(committing)?.steps?.map((step) => step.id)).toEqual([
      'reserving',
      'writing-specification',
      'committing-specification',
      'registering',
    ]);
    expect(byId.get(interrupted)).toMatchObject({
      status: 'recovery-required',
      code: 'OPERATION_INTERRUPTED',
    });
    expect(byId.get(recovery)).toMatchObject({ status: 'recovery-required' });
    expect(byId.get(corrupt)).toEqual({
      operationId: corrupt,
      kind: 'specification-create',
      status: 'recovery-required',
      code: 'CREATE_JOURNAL_CORRUPT',
      updatedAt: expect.any(String) as string,
    });
    expect(byId.get(fx.created.operationId)).toMatchObject({
      status: 'completed',
      subject: { specId: fx.created.specId },
    });
    expect(byId.get(fx.created.operationId)?.steps?.every((step) => step.status === 'done')).toBe(
      true,
    );

    // recovery-required first, then in-progress, then completed.
    expect(body.items.map((item) => item.status)).toEqual([
      'recovery-required',
      'recovery-required',
      'recovery-required',
      'in-progress',
      'in-progress',
      'completed',
    ]);
    // Strict allow-list: no paths, instance ids, raw stages, reasons or journal internals.
    for (const forbidden of [
      fx.root,
      'workspaceRoot',
      'instanceId',
      'secret',
      'reason',
      'stage',
      'requestIntent',
      'inputFingerprint',
      'baseCommit',
    ]) {
      expect(response.body, forbidden).not.toContain(forbidden);
    }
  }, 240000);

  it('answers 304 to a matching If-None-Match and a new validator after a change', async () => {
    const fx = await project();
    await variant(fx, { stage: 'manifest-writing' });
    const { get } = await listen(fx);
    const first = await get();
    const etag = first.headers.etag!;
    const second = await get('', { 'if-none-match': etag });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    expect(second.headers.etag).toBe(etag);
    expect((await get('', { 'if-none-match': '"other"' })).statusCode).toBe(200);

    await variant(fx, { stage: 'registry-writing' });
    const third = await get('', { 'if-none-match': etag });
    expect(third.statusCode).toBe(200);
    expect(third.headers.etag).not.toBe(etag);
  }, 240000);

  it('honours limit and status filters and rejects malformed queries', async () => {
    const fx = await project();
    for (let index = 0; index < 4; index += 1) await variant(fx, { stage: 'registry-writing' });
    await variant(fx, { stage: 'recovery-required' });
    const { get } = await listen(fx);

    const limitedResponse = await get('?limit=2');
    expect(limitedResponse.statusCode, limitedResponse.body).toBe(200);
    const limited = list(limitedResponse.body);
    expect(limited.items).toHaveLength(2);
    expect(limited.truncated).toBe(true);
    // Counts cover every admitted row, not the page.
    expect(limited.counts).toMatchObject({ inProgress: 4, recoveryRequired: 1, completed: 1 });

    const filtered = list((await get('?status=in-progress,completed')).body);
    expect(filtered.items.map((item) => item.status).sort()).toEqual([
      'completed',
      'in-progress',
      'in-progress',
      'in-progress',
      'in-progress',
    ]);
    expect(filtered.counts.recoveryRequired).toBe(1);
    expect(list((await get('?status=failed')).body).items).toEqual([]);

    for (const bad of ['?status=bogus', '?status=,', '?limit=0', '?limit=51', '?limit=x']) {
      expect((await get(bad)).statusCode, bad).toBe(400);
    }
  }, 240000);

  it('admits rows per spec view, rows without a spec only with Create, and rejects the rest', async () => {
    const fx = await project();
    const sameSpec = await variant(fx, { stage: 'manifest-writing' }, 0, 'same');
    const otherSpec = await variant(fx, { stage: 'manifest-writing' });
    const corrupt = randomUUID();
    await writeFile(join(fx.dir, corrupt + '.json'), 'not json');

    const owner = await listen(fx, { assignments: [{ role: 'developer', scope: {} }] });
    expect(list((await owner.get()).body).items).toHaveLength(4);

    const scoped = await listen(fx, {
      assignments: [{ role: 'viewer', scope: { specId: fx.created.specId } }],
    });
    const seen = list((await scoped.get()).body);
    expect(seen.items.map((item) => item.operationId).sort()).toEqual(
      [fx.created.operationId, sameSpec].sort(),
    );
    expect(seen.counts).toEqual({ inProgress: 1, recoveryRequired: 0, failed: 0, completed: 1 });
    expect(JSON.stringify(seen)).not.toContain(otherSpec);
    expect(JSON.stringify(seen)).not.toContain(corrupt);

    const nobody = await listen(fx, { assignments: [] });
    expect((await nobody.get()).statusCode).toBe(403);
    const anonymous = await listen(fx, { authenticated: false });
    expect((await anonymous.get()).statusCode).toBe(401);
  }, 240000);

  it('overlays the live registry: live steps, failures, pre-journal runs and restart', async () => {
    const fx = await project();
    const registry = createOperationProgressRegistry();
    const running = await variant(fx, { stage: 'reserved' });
    const failing = await variant(fx, { stage: 'manifest-writing' });
    const live = registry.begin({
      operationId: running,
      kind: 'specification-create',
      steps: ['reserving', 'writing-specification', 'registering'],
    });
    live.step('reserving', 'done');
    live.step('writing-specification', 'running');
    registry
      .begin({ operationId: failing, kind: 'specification-create', steps: ['reserving'] })
      .fail('COMMIT_BLOCKED');
    const early = randomUUID();
    registry.begin({ operationId: early, kind: 'specification-create', steps: ['reserving'] });
    // Failed before any journal existed: reported by its own request, never listed.
    registry
      .begin({ operationId: randomUUID(), kind: 'specification-create', steps: ['reserving'] })
      .fail('BRANCH_PROTECTED');

    const { get } = await listen(fx, { registry });
    const byId = new Map(list((await get()).body).items.map((item) => [item.operationId, item]));
    expect(byId.get(running)).toMatchObject({
      status: 'in-progress',
      currentStep: 'writing-specification',
    });
    expect(byId.get(failing)).toMatchObject({ status: 'failed', code: 'COMMIT_BLOCKED' });
    expect(byId.get(early)).toMatchObject({ status: 'in-progress' });
    expect(byId.get(early)?.subject).toBeUndefined();
    expect(byId.size).toBe(4);

    // "Restart": a fresh registry; the failed run is only a stale non terminal journal now.
    await utimes(
      join(fx.dir, failing + '.json'),
      new Date(Date.now() - 10 * 60_000),
      new Date(Date.now() - 10 * 60_000),
    );
    const restarted = await listen(fx, { registry: createOperationProgressRegistry() });
    const after = new Map(
      list((await restarted.get()).body).items.map((item) => [item.operationId, item]),
    );
    expect(after.get(failing)).toMatchObject({
      status: 'recovery-required',
      code: 'OPERATION_INTERRUPTED',
    });
    expect(after.get(running)).toMatchObject({ status: 'in-progress', currentStep: 'reserving' });
    expect(after.has(early)).toBe(false);
  }, 240000);

  it('answers 503 OPERATIONS_UNAVAILABLE without an Engine', async () => {
    const { get } = await listen(undefined);
    const response = await get();
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: 'OPERATIONS_UNAVAILABLE',
      code: 'OPERATIONS_UNAVAILABLE',
    });
  });

  it('spawns no Git process and ignores a held project control lock', async () => {
    const fx = await project();
    await variant(fx, { stage: 'manifest-writing' });
    const { get } = await listen(fx);
    await get();
    const spawns: unknown[] = [];
    const listener = (message: unknown): void => void spawns.push(message);
    subscribe('nevo.specflow.engine.git-process', listener);
    try {
      const response = await get();
      expect(response.statusCode, response.body).toBe(200);
      expect(spawns).toEqual([]);
      expect((await readdir(fx.dir)).length).toBeGreaterThan(1);
    } finally {
      unsubscribe('nevo.specflow.engine.git-process', listener);
    }
  }, 240000);
});
