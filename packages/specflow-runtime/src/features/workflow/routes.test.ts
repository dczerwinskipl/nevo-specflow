import { createAuthorization } from '@nevo/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { WORKFLOW_ERROR_CODES } from '@nevo/specflow-contracts/workflow';
import {
  ProjectControlLockError,
  GateUnsatisfiedError,
  SpecificationExitBlockedError,
  WORKFLOW_ERROR_CODES as ENGINE_ERROR_CODES,
  WorkflowError,
  type ActionProjection,
  type FinishStepResult,
} from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import Fastify from 'fastify';

import { RUNTIME_FASTIFY_OPTIONS } from '../../server/app';
import { registerSharedContracts } from '../../server/shared-contracts';
import { routeTestApp } from '../../../test/support/route-app';
import { createRequestAuthorization } from '../auth/authorization/request-authorization';
import { registerRuntimeErrorHandler } from '../../server/error-handler';
import type { WorkflowPort } from './port';
import { workflowEndpoint } from './routes';
import { workflowFailure } from './refusal';

const SPEC = 'spec-1';
const alice = { kind: 'user' as const, id: 'alice' };
const viewer = { kind: 'user' as const, id: 'viewer' };

const policy = createAuthorization({
  resources: [SpecCapabilities],
  roles: {
    manage: [SpecCapabilities.capabilities.View, SpecCapabilities.capabilities.Manage],
    viewer: [SpecCapabilities.capabilities.View],
    closer: [
      SpecCapabilities.capabilities.View,
      SpecCapabilities.capabilities.Manage,
      SpecCapabilities.capabilities.CloseSpecification,
    ],
  },
  assignments: [
    { subject: alice, role: 'manage', scope: { specId: SPEC } },
    { subject: viewer, role: 'viewer', scope: { specId: SPEC } },
    { subject: { kind: 'user', id: 'closer' }, role: 'closer', scope: { specId: SPEC } },
  ],
});

const subjectSpec = { kind: 'specification', specId: SPEC } as const;
const projection: ActionProjection = {
  subject: subjectSpec,
  position: { kind: 'terminal', outcome: 'completed' },
  actions: {},
};
const finished: FinishStepResult = {
  subject: subjectSpec,
  transition: 'to-review',
  position: { state: 'ready', step: 'review' },
  continuation: { kind: 'attention', step: 'review', reason: 'human-step' },
  createdTasks: [],
};

interface Calls {
  readonly names: string[];
  last?: unknown;
}

function fakePort(overrides: Partial<WorkflowPort> = {}): { port: WorkflowPort; calls: Calls } {
  const calls: Calls = { names: [] };
  const record =
    <T>(name: string, result: T) =>
    (input?: unknown) => {
      calls.names.push(name);
      calls.last = input;

      return Promise.resolve(result);
    };

  const port: WorkflowPort = {
    actions: record('actions', projection),
    start: record('start', {
      kind: 'started',
      subject: subjectSpec,
      context: { step: { id: 'draft', title: 'Draft', kind: 'work', purpose: 'p' }, attempt: 1 },
    } as never),
    finish: record('finish', finished),
    return: record('return', {
      subject: subjectSpec,
      position: { state: 'ready', step: 'draft' },
      continuation: { kind: 'none', reason: 'terminal' },
    }),
    abandon: record('abandon', {
      specId: SPEC,
      abandonment: {
        sequence: 1,
        at: '2026-11-12T10:00:00.000Z',
        reason: 'Not needed',
        from: { state: 'not-started' },
        actor: { class: 'human', details: { actorId: 'x', trust: 'authenticated' } },
      },
      cancelledTasks: ['t1'],
      abandonedTaskRuns: [],
    }),
    ...overrides,
  };

  return { port, calls };
}

function appWith(port: WorkflowPort, user: { kind: 'user'; id: string } = alice) {
  const app = Fastify({ ajv: RUNTIME_FASTIFY_OPTIONS.ajv });
  registerSharedContracts(app);
  registerRuntimeErrorHandler(app);
  app.decorateRequest('authz', {
    getter: () => createRequestAuthorization({ mode: 'subject', subject: user }, policy),
  });
  app.register(workflowEndpoint, { port });

  return app;
}

describe('workflow action routes', () => {
  it('reads the projection of a Specification and of a Task', async () => {
    const { port, calls } = fakePort();
    const app = appWith(port, viewer);

    const spec = await app.inject(`/api/specs/${SPEC}/workflow/actions`);
    expect(spec.statusCode).toBe(200);
    expect(spec.headers['cache-control']).toBe('no-store');
    expect(spec.json()).toEqual(projection);

    const task = await app.inject(`/api/specs/${SPEC}/tasks/t1/workflow/actions`);
    expect(task.statusCode).toBe(200);
    expect(calls.last).toEqual({ kind: 'task', specId: SPEC, taskId: 't1' });
    await app.close();
  });

  it('needs the capability on the Specification: view reads, manage drives, close abandons', async () => {
    const { port } = fakePort();
    const viewerApp = appWith(port, viewer);
    expect(
      (
        await viewerApp.inject({
          method: 'POST',
          url: `/api/specs/${SPEC}/workflow/start`,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    await viewerApp.close();

    const managerApp = appWith(port);
    expect(
      (
        await managerApp.inject({
          method: 'POST',
          url: `/api/specs/${SPEC}/workflow/abandon`,
          payload: { reason: 'No longer needed' },
        })
      ).statusCode,
    ).toBe(403);
    await managerApp.close();

    const closerApp = appWith(port, { kind: 'user', id: 'closer' });
    expect(
      (
        await closerApp.inject({
          method: 'POST',
          url: `/api/specs/${SPEC}/workflow/abandon`,
          payload: { reason: 'No longer needed' },
        })
      ).statusCode,
    ).toBe(200);
    await closerApp.close();
  });

  it('starts a Task with the confirmed workflow revision and the owner actor of the caller', async () => {
    const { port, calls } = fakePort();
    const app = appWith(port);

    const response = await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/tasks/t1/workflow/start`,
      payload: { expectedWorkflowRevision: 'abc' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ kind: 'started', attempt: 1, step: { id: 'draft' } });
    expect(calls.last).toEqual({
      subject: { kind: 'task', specId: SPEC, taskId: 't1' },
      actor: {
        class: 'human',
        details: { actorId: JSON.stringify(alice), trust: 'authenticated' },
      },
      expectedWorkflowRevision: 'abc',
    });
    await app.close();
  });

  it('never takes the actor from the body', async () => {
    const { port, calls } = fakePort();
    const app = appWith(port);

    const response = await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/workflow/finish`,
      payload: {
        step: 'draft',
        attempt: 1,
        actor: { class: 'human', details: { actorId: 'mallory', trust: 'local' } },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(calls.names).toEqual([]);
    await app.close();
  });

  it('finishes with the result, feedback and artifacts and passes a replay and its post actions through', async () => {
    const failedCommit = {
      action: 'commit-execution-state' as const,
      status: 'failed' as const,
      code: 'COMMIT_FAILED',
      message: 'Commit failed.',
    };
    const replay = { ...finished, replayed: true as const, postActions: [failedCommit] };
    const { port } = fakePort({ finish: () => Promise.resolve(replay) });
    const app = appWith(port);

    const response = await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/workflow/finish`,
      payload: { step: 'draft', attempt: 2, result: 'done', feedback: 'ok', artifacts: ['a.md'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      transition: 'to-review',
      replayed: true,
      postActions: [failedCommit],
    });
    await app.close();
  });

  it('hands the finish input to the Engine', async () => {
    const { port, calls } = fakePort();
    const app = appWith(port);

    await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/tasks/t1/workflow/finish`,
      payload: {
        step: 'breakdown',
        attempt: 2,
        result: 'done',
        feedback: 'ok',
        artifacts: ['a.md'],
        tasks: [{ id: 'api', title: 'API', type: 'implementation', dependsOn: [] }],
      },
    });

    expect(calls.last).toMatchObject({
      subject: { kind: 'task', specId: SPEC, taskId: 't1' },
      step: 'breakdown',
      attempt: 2,
      input: {
        result: 'done',
        feedback: 'ok',
        artifacts: ['a.md'],
        tasks: [{ id: 'api', title: 'API', type: 'implementation', dependsOn: [] }],
      },
    });
    await app.close();
  });

  it('returns with the reason as the feedback', async () => {
    const { port, calls } = fakePort();
    const app = appWith(port);

    const response = await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/workflow/return`,
      payload: { step: 'draft', reason: 'Rework the scope' },
    });

    expect(response.statusCode).toBe(200);
    expect(calls.last).toMatchObject({ step: 'draft', feedback: 'Rework the scope' });
    await app.close();
  });

  it('answers a refused abandon with 409 and the blockers', async () => {
    const blockers = [
      { kind: 'pending-execution-change' as const, subjectIds: [SPEC], message: 'Retry.' },
    ];
    const { port } = fakePort({
      abandon: () => Promise.reject(new SpecificationExitBlockedError(blockers)),
    });
    const app = appWith(port, { kind: 'user', id: 'closer' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/specs/${SPEC}/workflow/abandon`,
      payload: { reason: 'Not needed' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'WORKFLOW_EXIT_BLOCKED',
      error: 'WORKFLOW_EXIT_BLOCKED',
      details: { blockers },
    });
    await app.close();
  });

  it('answers an unsatisfied gate with 409 and the gates', () => {
    const gate = {
      id: 'findings',
      type: 'document' as const,
      label: 'Findings',
      documentType: 'research',
      scope: { kind: 'task' as const, specId: SPEC, taskId: 'build' },
      status: 'unsatisfied' as const,
      reason: 'no-document' as const,
    };
    const failure = workflowFailure(
      new GateUnsatisfiedError('exit', { id: 'implement', title: 'Implement' }, [gate]),
    );

    expect(failure).toMatchObject({
      status: 409,
      body: {
        code: 'WORKFLOW_GATE_UNSATISFIED',
        details: {
          gate: { phase: 'exit', step: 'implement', stepTitle: 'Implement', gates: [gate] },
        },
      },
    });
  });

  it('maps a refusal of the Engine to its status; a defect is not a refusal', async () => {
    const { port } = fakePort({
      actions: () =>
        Promise.reject(new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', 'No such Task')),
    });
    const app = appWith(port);

    const response = await app.inject(`/api/specs/${SPEC}/tasks/nope/workflow/actions`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'WORKFLOW_SUBJECT_NOT_FOUND' });
    expect(workflowFailure(new Error('boom'))).toBeUndefined();
    await app.close();
  });
});

describe('workflow routes without a backend', () => {
  it('answer 503 WORKFLOW_UNAVAILABLE', async () => {
    const app = routeTestApp();
    registerRuntimeErrorHandler(app);
    app.decorateRequest('authz', {
      getter: () => createRequestAuthorization({ mode: 'subject', subject: alice }, policy),
    });
    app.register(workflowEndpoint, {});

    const response = await app.inject(`/api/specs/${SPEC}/workflow/actions`);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'WORKFLOW_UNAVAILABLE' });
    await app.close();
  });
});

describe('workflow refusals', () => {
  const status = (code: (typeof WORKFLOW_ERROR_CODES)[number]) =>
    workflowFailure(Object.assign(new Error('m'), { name: 'WorkflowError', code }))?.status;

  it('maps the stable codes to 404, 409, 422 and 503', () => {
    expect(status('WORKFLOW_SUBJECT_NOT_FOUND')).toBe(404);
    expect(status('WORKFLOW_INPUT_INVALID')).toBe(422);
    expect(status('WORKFLOW_RETURN_NOT_ALLOWED')).toBe(422);
    for (const code of [
      'WORKFLOW_DEFINITION_CHANGED',
      'WORKFLOW_ATTEMPT_MISMATCH',
      'WORKFLOW_POSITION_INVALID',
      'WORKFLOW_TASK_BLOCKED',
      'WORKFLOW_TASK_BUSY',
      'WORKFLOW_SPECIFICATION_BUSY',
      'WORKFLOW_SPECIFICATION_ENDED',
      'WORKFLOW_EXIT_BLOCKED',
      'WORKFLOW_STATE_CONFLICT',
      'WORKFLOW_EXECUTOR_NOT_ALLOWED',
    ] as const) {
      expect(status(code)).toBe(409);
    }

    expect(status('WORKFLOW_STATE_CORRUPT')).toBe(503);
  });

  it('keeps the code of the project lock', () => {
    const failure = workflowFailure(new ProjectControlLockError('CONTROL_LOCK_CORRUPT', 'Broken.'));

    expect(failure).toMatchObject({ status: 503, body: { code: 'CONTROL_LOCK_CORRUPT' } });
  });

  it('knows exactly the codes of the Engine, plus its own', () => {
    expect([...WORKFLOW_ERROR_CODES].sort()).toEqual(
      [
        ...ENGINE_ERROR_CODES,
        'WORKFLOW_UNAVAILABLE',
        'CONTROL_LOCK_BUSY',
        'CONTROL_LOCK_CORRUPT',
        'CONTROL_LOCK_OWNERSHIP_LOST',
        'CONTROL_LOCK_INVALID_HOME',
      ].sort(),
    );
  });
});
