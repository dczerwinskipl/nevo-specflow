import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  inspectCreateSpecification,
  installDefinitionsForTesting,
  type SpecFlowEngine,
} from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createOperationProgressRegistry } from '../../src/features/operations';
import type { FirstStepStarter } from '../../src/features/specs';
import { createFileFirstStepIntentStore } from '../../src/features/specs/create/first-step-store';
import { firstStepIntentDirectory } from '../../src/features/specs/create/first-step';
import {
  CREATE_REQUEST_RELATIVE_DIR,
  createFileCreateRequestStore,
} from '../../src/features/specs/create/request-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';
import { ARCHETYPE_REQUEST } from '../support/archetype';

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

async function project(): Promise<SpecFlowEngine> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-create-first-step-')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: false\n');
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
  const engine = await bootstrapProjectHome(root);
  await installDefinitionsForTesting(engine);

  return engine;
}

/**
 * A starter that records its calls; `refuse` makes it refuse like a busy project, `fail` fail like
 * a shutdown or an unexpected error (not the agent's answer).
 */
function fakeStarter(options: { refuse?: boolean; fail?: boolean } = {}) {
  const start = vi.fn<FirstStepStarter['start']>((input) =>
    options.refuse
      ? Promise.reject(new Error('busy'))
      : options.fail
        ? Promise.reject(new Error('Runtime is shutting down'))
        : Promise.resolve({ sessionId: `session-${input.operationId}`, attemptId: 'attempt-1' }),
  );
  const starter: FirstStepStarter = {
    start,
    refusal: (error) =>
      error instanceof Error && error.message === 'busy'
        ? {
            code: 'WORKFLOW_AGENT_UNAVAILABLE',
            agent: { kind: 'unavailable', reason: 'project-busy', detail: 'Another agent works.' },
          }
        : undefined,
  };

  return { starter, start };
}

async function server(engine: SpecFlowEngine, starter: FirstStepStarter) {
  const store = new InMemoryAuthenticationStore();
  const session = store.createSession({
    userId: 'demo-user',
    authenticatedWith: { kind: 'password' },
  });
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };
  const registry = createOperationProgressRegistry();
  const app = await createRuntimeApp(
    {
      ...passwordConfig(),
      authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
    },
    { auth: { store }, specs: { engine, firstStepStarter: starter }, operations: { registry } },
  );
  apps.push(app);
  await app.ready();

  const post = (body: Record<string, unknown>, prefer?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/specs',
      headers: { ...headers, ...(prefer !== undefined ? { prefer } : {}) },
      payload: { ...ARCHETYPE_REQUEST, ...body },
    });
  const inspect = (operationId: string) =>
    app.inject({ method: 'GET', url: `/api/specs/create/operations/${operationId}`, headers });
  const untilSettled = async (operationId: string) => {
    for (let attempt = 0; attempt < 1200; attempt++) {
      const body = (await inspect(operationId)).json<Record<string, unknown>>();
      if (body.status === 'completed') {
        while (registry.peek(operationId, 'specification-create')?.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        return body;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('create did not complete');
  };

  const operations = () =>
    app.inject({ method: 'GET', url: '/api/specs/operations', headers }).then((response) =>
      response.json<{
        items: { operationId: string; status: string; steps?: { id: string; status: string }[] }[];
      }>(),
    );

  return { app, post, inspect, untilSettled, operations };
}

const intentFiles = async (engine: SpecFlowEngine) =>
  readdir(firstStepIntentDirectory(engine)).catch(() => [] as string[]);

const firstStep = { run: 'agent', provider: 'claude', model: 'sonnet' } as const;

describe('Create with a first-step intent (real Git)', () => {
  it('answers 202, then starts the first step with the agent as the caller', async () => {
    const engine = await project();
    const { starter, start } = fakeStarter();
    const { post, untilSettled, operations } = await server(engine, starter);
    const operationId = randomUUID();

    const response = await post(
      {
        operationId,
        title: 'Agent first',
        firstStep,
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      },
      'respond-async',
    );
    expect(response.statusCode).toBe(202);

    const settled = await untilSettled(operationId);
    expect(settled.firstStep).toEqual({
      status: 'started',
      step: { id: 'requirements', title: 'Gather requirements' },
      sessionId: `session-${operationId}`,
      attemptId: 'attempt-1',
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]![0]).toMatchObject({
      operationId,
      specId: settled.specId,
      step: 'requirements',
      provider: 'claude',
      model: 'sonnet',
    });
    expect(start.mock.calls[0]![0].principal).toContain('demo-user');

    const row = (await operations()).items.find((item) => item.operationId === operationId);
    expect(row?.steps?.at(-1)).toEqual({ id: 'starting-agent', status: 'done' });
  }, 240000);

  it('replays idempotently: the same request never starts twice, another intent is a conflict', async () => {
    const engine = await project();
    const { starter, start } = fakeStarter();
    const { post, untilSettled } = await server(engine, starter);
    const operationId = randomUUID();
    const body = {
      operationId,
      title: 'Agent replay',
      firstStep,
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    };
    expect((await post(body, 'respond-async')).statusCode).toBe(202);
    const settled = await untilSettled(operationId);

    const replay = await post(body);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toMatchObject({ specId: settled.specId, firstStep: settled.firstStep });
    expect(start).toHaveBeenCalledTimes(1);

    const otherAgent = await post({ ...body, firstStep: { ...firstStep, provider: 'codex' } });
    expect(otherAgent.statusCode).toBe(409);
    expect(otherAgent.json()).toMatchObject({ code: 'CREATE_CONFLICT' });
    const { firstStep: _dropped, ...withoutIntent } = body;
    expect((await post(withoutIntent)).statusCode).toBe(409);
  }, 240000);

  it('keeps the Create completed when the start is refused, with why', async () => {
    const engine = await project();
    const { starter } = fakeStarter({ refuse: true });
    const { post, untilSettled, operations } = await server(engine, starter);
    const operationId = randomUUID();

    expect(
      (
        await post(
          {
            operationId,
            title: 'Agent refused',
            firstStep,
            target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
          },
          'respond-async',
        )
      ).statusCode,
    ).toBe(202);
    const settled = await untilSettled(operationId);
    expect(settled).toMatchObject({
      status: 'completed',
      firstStep: {
        status: 'not-started',
        step: { id: 'requirements', title: 'Gather requirements' },
        code: 'WORKFLOW_AGENT_UNAVAILABLE',
        agent: { kind: 'unavailable', reason: 'project-busy' },
      },
    });
    const row = (await operations()).items.find((item) => item.operationId === operationId);
    expect(row?.status).toBe('completed');
    expect(row?.steps?.at(-1)).toEqual({ id: 'starting-agent', status: 'skipped' });
  }, 240000);

  it('resumes a pending intent of a completed Create when the Runtime starts again', async () => {
    const engine = await project();
    const operationId = randomUUID();
    // The Runtime stopped after the Create completed and before its agent start: the journal is
    // completed and the stored intent has no result.
    const created = await createSpecificationForTesting(engine, {
      archetype: { id: 'minimal', version: 1 },
      operationId,
      title: 'Agent after restart',
      created: '2026-11-26',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    await createFileFirstStepIntentStore(firstStepIntentDirectory(engine)).write({
      version: 1,
      operationId,
      principal: 'owner-principal',
      request: firstStep,
      step: { id: 'requirements', title: 'Gather requirements' },
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const { starter, start } = fakeStarter();
    const { inspect } = await server(engine, starter);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1), { timeout: 30000 });
    expect(start.mock.calls[0]![0]).toMatchObject({
      operationId,
      specId: created.specId,
      principal: 'owner-principal',
      step: 'requirements',
    });
    await vi.waitFor(async () =>
      expect((await inspect(operationId)).json()).toMatchObject({
        status: 'completed',
        firstStep: { status: 'started', sessionId: `session-${operationId}` },
      }),
    );
  }, 240000);

  it('keeps a start that failed for a passing reason pending, and the next start makes it once', async () => {
    const engine = await project();
    const operationId = randomUUID();
    const failing = fakeStarter({ fail: true });
    const first = await server(engine, failing.starter);
    expect(
      (
        await first.post(
          {
            operationId,
            title: 'Agent after a shutdown',
            firstStep,
            target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
          },
          'respond-async',
        )
      ).statusCode,
    ).toBe(202);
    // The first attempt and its in-process retries fail; nothing is recorded as final.
    await vi.waitFor(() => expect(failing.start).toHaveBeenCalledTimes(3), { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await first.inspect(operationId)).json()).toMatchObject({ status: 'in-progress' });
    const pending = await createFileFirstStepIntentStore(firstStepIntentDirectory(engine)).read(
      operationId,
    );
    expect(pending?.result).toBeUndefined();
    await first.app.close();

    // The next Runtime start makes the start, under the same operation (the same request id).
    const later = fakeStarter();
    const second = await server(engine, later.starter);
    await vi.waitFor(() => expect(later.start).toHaveBeenCalledTimes(1), { timeout: 30000 });
    expect(later.start.mock.calls[0]![0].operationId).toBe(
      failing.start.mock.calls[0]![0].operationId,
    );
    await vi.waitFor(async () =>
      expect((await second.inspect(operationId)).json()).toMatchObject({
        status: 'completed',
        firstStep: { status: 'started' },
      }),
    );
    await second.app.close();

    // A settled start is never made again (no double start after another restart).
    const third = fakeStarter();
    await server(engine, third.starter);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(third.start).not.toHaveBeenCalled();
  }, 240000);

  it('refuses a first step only the owner can do before anything is written', async () => {
    const engine = await project();
    const workflow = join(
      engine.context.project.homeRoot,
      '.nevo/definitions/workflow/specification-standard.yaml',
    );
    await writeFile(
      workflow,
      (await readFile(workflow, 'utf8')).replace('executors: [agent, human]', 'executors: [human]'),
    );
    const { starter, start } = fakeStarter();
    const { post, inspect } = await server(engine, starter);
    const operationId = randomUUID();

    const response = await post({
      operationId,
      title: 'Owner first',
      firstStep,
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'CREATE_OPERATION_INVALID' });
    expect((await inspect(operationId)).statusCode).toBe(404);
    expect(await intentFiles(engine)).toEqual([]);
    expect(start).not.toHaveBeenCalled();
  }, 240000);

  it('drops the intent of a Create that was refused', async () => {
    const engine = await project();
    const { starter } = fakeStarter();
    const { post } = await server(engine, starter);
    const response = await post({
      operationId: randomUUID(),
      title: 'Refused create',
      firstStep,
      catalogueRevision: 'stale',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    expect(response.statusCode).toBe(409);
    expect(await intentFiles(engine)).toEqual([]);
  }, 240000);
});

/** A PID that ran and exited: what a killed Runtime leaves in its records. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);

  return child.pid;
}

const requests = (engine: SpecFlowEngine) =>
  createFileCreateRequestStore(() =>
    join(engine.context.project.stateRoot, CREATE_REQUEST_RELATIVE_DIR),
  );

describe('a Create in flight when the Runtime died (real Git)', () => {
  /** What the killed Runtime had written before it died: the request and the first-step intent. */
  async function accepted(engine: SpecFlowEngine, operationId: string, title: string) {
    const body = {
      ...ARCHETYPE_REQUEST,
      operationId,
      title,
      firstStep,
      target: { kind: 'existing' as const, workspaceId: engine.workspace.workspaceId },
    };
    const before = new Date(Date.now() - 60_000).toISOString();
    await requests(engine).write({
      version: 1,
      operationId,
      principal: 'owner-principal',
      request: body,
      createdAt: before,
    });
    await createFileFirstStepIntentStore(firstStepIntentDirectory(engine)).write({
      version: 1,
      operationId,
      principal: 'owner-principal',
      request: firstStep,
      step: { id: 'requirements', title: 'Gather requirements' },
      createdAt: before,
    });

    return body;
  }

  it('runs a Create that died before its reservation at the next start, and its agent once', async () => {
    const engine = await project();
    const operationId = randomUUID();
    await accepted(engine, operationId, 'Died while reserving');

    const { starter, start } = fakeStarter();
    const first = await server(engine, starter);
    const settled = await first.untilSettled(operationId);
    expect(settled).toMatchObject({ status: 'completed', firstStep: { status: 'started' } });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0]![0]).toMatchObject({ operationId, principal: 'owner-principal' });
    expect(await requests(engine).read(operationId)).toBeUndefined();
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    await first.app.close();

    // Another restart neither creates again nor starts the agent again.
    const again = fakeStarter();
    await server(engine, again.starter);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(again.start).not.toHaveBeenCalled();
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
  }, 240000);

  it.each(['reservation', 'manifest', 'registry'])(
    'resumes a Create that died at %s from its journal, and starts its agent once',
    async (stage) => {
      const engine = await project();
      const operationId = randomUUID();
      const body = await accepted(engine, operationId, 'Died at ' + stage);
      // The killed Runtime's own run of the Engine Create, interrupted after `stage`.
      await expect(
        createSpecificationForTesting(
          engine,
          {
            operationId,
            title: body.title,
            created: new Date().toISOString().slice(0, 10),
            archetype: { id: body.archetypeId, version: body.archetypeVersion },
            catalogueRevision: body.catalogueRevision,
            target: body.target,
          },
          {
            afterEffect: (effect) =>
              effect === stage ? Promise.reject(new Error('killed')) : Promise.resolve(),
          },
        ),
      ).rejects.toThrow('killed');
      // Its executor is a process that no longer runs.
      const path = join(
        engine.context.project.stateRoot,
        'engine/operations/create',
        operationId + '.json',
      );
      const journal = JSON.parse(await readFile(path, 'utf8')) as {
        executor: { pid: number; processStartTime?: string };
      };
      const stuck = (await inspectCreateSpecification(engine, operationId))!;
      await writeFile(
        path,
        JSON.stringify({ ...journal, executor: { ...journal.executor, pid: deadPid() } }) + '\n',
      );

      const { starter, start } = fakeStarter();
      const { untilSettled } = await server(engine, starter);
      const settled = await untilSettled(operationId);
      expect(settled).toMatchObject({
        status: 'completed',
        specId: stuck.specId,
        firstStep: { status: 'started' },
      });
      expect(start).toHaveBeenCalledTimes(1);
      expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    },
    240000,
  );

  it('keeps a Create that was refused readable as failed, never "not found"', async () => {
    const engine = await project();
    const { starter } = fakeStarter();
    const { post, inspect } = await server(engine, starter);
    const operationId = randomUUID();
    const response = await post({
      operationId,
      title: 'Refused create',
      catalogueRevision: 'stale',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    expect(response.statusCode).toBe(409);
    expect((await inspect(operationId)).json()).toMatchObject({
      status: 'failed',
      code: response.json<{ code: string }>().code,
    });
  }, 240000);
});
