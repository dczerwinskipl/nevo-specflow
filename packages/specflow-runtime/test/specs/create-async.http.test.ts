import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  inspectPublicCreateOperation,
} from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import {
  createOperationProgressRegistry,
  type OperationProgressRegistry,
} from '../../src/features/operations';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd });
}

async function server(
  gitEnabled: boolean,
  registry: OperationProgressRegistry = createOperationProgressRegistry(),
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-create-async-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    gitEnabled
      ? 'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: develop\n'
      : 'runtime: {}\ngit:\n  enabled: false\n',
  );
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
  if (gitEnabled) git(root, 'branch', '-m', 'develop');
  const engine = await bootstrapProjectHome(root);

  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
    },
    { auth: { store }, specs: { engine }, operations: { registry } },
  );
  apps.push(app);
  await app.ready();

  const post = (body: Record<string, unknown>, prefer?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/specs',
      headers: { ...headers, ...(prefer !== undefined ? { prefer } : {}) },
      payload: body,
    });
  const inspect = (operationId: string) =>
    app.inject({ method: 'GET', url: `/api/specs/create/operations/${operationId}`, headers });
  /** Polls the inspection endpoint until the operation completed. */
  const untilCompleted = async (operationId: string) => {
    for (let attempt = 0; attempt < 1200; attempt++) {
      const response = await inspect(operationId);
      const body = response.json<Record<string, unknown>>();
      if (response.statusCode === 200 && body.status === 'completed') {
        // The journal is terminal before the detached Create finishes its own result
        // verification; wait for it so teardown never removes the checkout under it.
        while (registry.peek(operationId, 'specification-create')?.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return body;
      }
      if (body.status === 'recovery-required') throw new Error('recovery required');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('create did not complete');
  };
  return { root, engine, app, post, inspect, untilCompleted };
}

describe('POST /api/specs with Prefer: respond-async (real Git)', () => {
  it('answers 202 with Location and keeps working detached until the journal completes', async () => {
    const { post, inspect, untilCompleted } = await server(true);
    const operationId = randomUUID();
    const body = {
      operationId,
      title: 'Async worktree create',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    };

    const response = await post(body, 'respond-async');
    expect(response.statusCode).toBe(202);
    expect(response.headers.location).toBe(`/api/specs/create/operations/${operationId}`);
    expect(response.headers['preference-applied']).toBe('respond-async');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      operationId,
      kind: 'specification-create',
      status: 'in-progress',
    });

    // The Location is the existing inspection route.
    expect((await inspect(operationId)).statusCode).toBe(200);
    const completed = await untilCompleted(operationId);
    expect(completed).toMatchObject({ operationId, kind: 'specification-create' });

    // Replay of the same request after completion: 201 with the result, not 202.
    const replay = await post(body, 'respond-async');
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(completed);

    // Changed body with the same id: the existing conflict.
    const conflict = await post({ ...body, title: 'Another title' }, 'respond-async');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'CREATE_CONFLICT' });
  }, 240000);

  it('replay of a still running request returns the current state (202) or the result (201)', async () => {
    const { post, untilCompleted } = await server(true);
    const operationId = randomUUID();
    const body = {
      operationId,
      title: 'Async replay',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    };
    const first = await post(body, 'respond-async');
    expect(first.statusCode).toBe(202);
    const replay = await post(body, 'respond-async');
    expect([201, 202]).toContain(replay.statusCode);
    if (replay.statusCode === 202) {
      expect(replay.headers.location).toBe(`/api/specs/create/operations/${operationId}`);
    }
    await untilCompleted(operationId);
  }, 240000);

  it('close() waits for a detached Create instead of abandoning a non terminal journal', async () => {
    const { app, engine, post } = await server(true);
    const operationId = randomUUID();
    const accepted = await post(
      {
        operationId,
        title: 'Shutdown during create',
        target: { kind: 'new-worktree', baseRef: 'HEAD' },
      },
      'respond-async',
    );
    expect(accepted.statusCode).toBe(202);

    // Shutdown right after the 202: the journal must be terminal when close() resolves.
    await app.close();
    const inspection = await inspectPublicCreateOperation(engine, operationId);
    expect(inspection).toMatchObject({ status: 'completed', operationId });
  }, 240000);

  it('keeps the synchronous 201 without the header or with other preferences', async () => {
    const { post } = await server(false);
    const plain = await post({ operationId: randomUUID(), title: 'Sync default' });
    expect(plain.statusCode).toBe(201);
    expect(plain.headers['preference-applied']).toBeUndefined();
    const other = await post({ operationId: randomUUID(), title: 'Sync other' }, 'return=minimal');
    expect(other.statusCode).toBe(201);
  }, 240000);

  it('parses Prefer as a token list and accepts parameters and any case', async () => {
    const { post, untilCompleted } = await server(false);
    const operationId = randomUUID();
    const response = await post(
      { operationId, title: 'Token list' },
      'return=minimal, Respond-Async; wait=5',
    );
    expect(response.statusCode).toBe(202);
    await untilCompleted(operationId);
  }, 240000);

  it('generates an operation id when the client sent none', async () => {
    const { post, untilCompleted } = await server(false);
    const response = await post({ title: 'No client id' }, 'respond-async');
    expect(response.statusCode).toBe(202);
    const accepted = response.json<{ operationId: string }>();
    expect(accepted.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.location).toBe(`/api/specs/create/operations/${accepted.operationId}`);
    await untilCompleted(accepted.operationId);
  }, 240000);

  it('still validates synchronously: a rejected create is a normal 4xx, never a 202', async () => {
    const { post } = await server(true);
    const response = await post(
      {
        operationId: randomUUID(),
        title: 'Bad base',
        target: { kind: 'new-worktree', baseRef: 'no-such-ref' },
      },
      'respond-async',
    );
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(response.json<{ code: string }>().code).toEqual(expect.any(String));

    const badBranch = await post(
      {
        operationId: randomUUID(),
        title: 'Bad branch',
        target: { kind: 'new-worktree', baseRef: 'HEAD', branch: 'zażółć' },
      },
      'respond-async',
    );
    expect(badBranch.statusCode).toBe(422);
    expect(badBranch.json()).toMatchObject({ code: 'BRANCH_NAME_INVALID' });

    const invalid = await post({ operationId: randomUUID(), title: '' }, 'respond-async');
    expect(invalid.statusCode).toBe(400);
  }, 240000);

  it('inspection reports a failure this Runtime observed after the reservation, by code only', async () => {
    const registry = createOperationProgressRegistry();
    const { engine, inspect } = await server(false, registry);
    const operationId = randomUUID();
    await expect(
      createSpecificationForTesting(
        engine,
        {
          operationId,
          title: 'Failed after reservation',
          created: '2026-10-14',
          target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
        },
        {
          afterEffect: (effect) =>
            effect === 'reservation' ? Promise.reject(new Error('stop')) : Promise.resolve(),
        },
      ),
    ).rejects.toThrow('stop');

    expect((await inspect(operationId)).json()).toMatchObject({ status: 'in-progress' });
    registry
      .begin({ operationId, kind: 'specification-create', steps: ['reserving'] })
      .fail('GIT_OPERATION_FAILED');

    const failed = await inspect(operationId);
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toEqual({
      operationId,
      kind: 'specification-create',
      status: 'failed',
      code: 'GIT_OPERATION_FAILED',
    });

    // A failure of an operation that was never reserved stays the proof of "not started".
    const unknown = randomUUID();
    registry.begin({ operationId: unknown, kind: 'specification-create', steps: [] }).fail('X');
    expect((await inspect(unknown)).statusCode).toBe(404);
  }, 240000);
});
