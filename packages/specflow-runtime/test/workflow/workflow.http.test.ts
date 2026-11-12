// Real project, real Git, real Engine behind the real Runtime routes: a manual Task run through HTTP
// (start with the confirmed workflow revision, finish, the same finish again is the recorded replay)
// and the Specification exit the projection and Close report. Run on Linux (tools/dev/linux-test.sh).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WorkflowActionProjectionSchema,
  type WorkflowActionProjection,
} from '@nevo/specflow-contracts/workflow';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  createTask,
  openWorkflow,
  setTaskStatus,
  type SpecFlowEngine,
} from '@nevo/specflow-engine/testing';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
afterEach(async () => {
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

const IDENTITY = ['-c', 'user.name=SpecFlow Test', '-c', 'user.email=specflow@example.invalid'];
const owner = { class: 'human', details: { actorId: 'local:test', trust: 'local' } } as const;

async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-http-workflow-')));
  roots.push(root);
  git(root, 'init', '-q');
  git(root, 'config', '--local', 'core.autocrlf', 'false');
  git(root, 'config', '--local', 'maintenance.auto', 'false');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(root, ...IDENTITY, 'commit', '-qm', 'initial');
  const engine: SpecFlowEngine = await bootstrapProjectHome(root);
  const registry = await engine.readRegistry();
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Workflow over HTTP',
    created: '2026-11-12',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
  });
  // Create commits its scaffold when Git is enabled; commit whatever else it left.
  git(root, 'add', '-A');
  if (git(root, 'status', '--porcelain') !== '') {
    git(root, ...IDENTITY, 'commit', '-qm', 'specification');
  }

  const workflow = await openWorkflow(engine);
  await createTask(workflow, {
    specId: spec.specId,
    taskId: 'docs',
    title: 'Document it',
    type: 'implementation',
    actor: owner,
  });
  await setTaskStatus(workflow, {
    specId: spec.specId,
    taskId: 'docs',
    status: 'ready',
    actor: owner,
  });

  return { engine, specId: spec.specId };
}

async function listen(engine: SpecFlowEngine) {
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
    { auth: { store }, specs: { engine } },
  );
  apps.push(app);
  const headers = { cookie: authCookieNames(passwordConfig().server.port).session + '=' + session };

  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers }),
    post: (url: string, body: unknown) =>
      app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      }),
  };
}

describe('workflow action routes through the real Engine', () => {
  it('runs a Task manually: start, finish, the same finish again is replayed; the exit blocks Close', async () => {
    const { engine, specId } = await project();
    const http = await listen(engine);
    const task = `/api/specs/${specId}/tasks/docs/workflow`;

    const before = await http.get(`${task}/actions`);
    expect(before.statusCode).toBe(200);
    const projection = before.json<WorkflowActionProjection>();
    expect(Value.Check(WorkflowActionProjectionSchema, projection)).toBe(true);
    expect(projection.position.kind).toBe('not-started');
    const expectedWorkflowRevision = projection.actions.start?.expectedWorkflowRevision;
    expect(expectedWorkflowRevision).toEqual(expect.any(String));

    const started = await http.post(`${task}/start`, { expectedWorkflowRevision });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      kind: 'started',
      step: { id: 'implement' },
      attempt: 1,
    });

    const finish = { step: 'implement', attempt: 1, feedback: 'Done and verified' };
    const finished = await http.post(`${task}/finish`, finish);
    expect(finished.statusCode).toBe(200);
    expect(finished.json()).toMatchObject({
      transition: 'implemented',
      position: { state: 'ready', step: 'review' },
    });
    expect(finished.json()).not.toHaveProperty('replayed');

    const retried = await http.post(`${task}/finish`, finish);
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({ transition: 'implemented', replayed: true });

    const changed = await http.post(`${task}/finish`, { ...finish, feedback: 'Something else' });
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'WORKFLOW_ATTEMPT_MISMATCH' });

    const spec = await http.get(`/api/specs/${specId}/workflow/actions`);
    expect(spec.statusCode).toBe(200);
    const exit = spec.json<WorkflowActionProjection>().specification?.exit;
    expect(exit?.close).toMatchObject({
      kind: 'blocked',
      blockers: [{ kind: 'unfinished-tasks', subjectIds: ['docs'] }],
    });
    expect(exit?.abandon.kind).toBe('allowed');

    const closed = await http.post(`/api/specs/${specId}/close`, { operationId: randomUUID() });
    expect(closed.statusCode).toBe(409);
    expect(closed.json()).toMatchObject({
      code: 'CLOSE_BLOCKED',
      blockers: [{ kind: 'unfinished-tasks', subjectIds: ['docs'] }],
    });
  }, 180_000);
});
