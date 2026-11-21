import { describe, expect, it } from 'vitest';

import { admitAgentOperation, deriveAgentScope } from './scope';

const scope = deriveAgentScope({ kind: 'ad-hoc', specId: 'S1' });

describe('agent write scope', () => {
  it('gives an ad-hoc Turn the documents of its home Specification only (D11b)', () => {
    expect(scope).toEqual({
      kind: 'ad-hoc',
      specId: 'S1',
      operations: ['documents.create', 'documents.save', 'documents.classify'],
    });
    expect(deriveAgentScope({ kind: 'ad-hoc', specId: 'S1' })).toEqual(scope);
  });

  it.each(['documents.create', 'documents.save', 'documents.classify'])(
    'admits %s of the home Specification',
    (operation) => {
      expect(admitAgentOperation(scope, { operation, specId: 'S1' })).toEqual({
        admitted: true,
        operation,
      });
    },
  );

  it.each([
    [{ operation: 'tasks.create', specId: 'S1' }, 'operation-not-in-scope', /may run only/],
    [{ operation: 'workflow.finish', specId: 'S1' }, 'operation-not-in-scope', /owner/],
    [{ operation: 'documents.save', specId: 'S2' }, 'other-specification', /S1, not for S2/],
    [{ operation: 'documents.save', specId: 'S1', taskId: 'T1' }, 'task-not-in-scope', /Task T1/],
  ] as const)('refuses %o with an actionable reason', (target, reason, message) => {
    const decision = admitAgentOperation(scope, target);
    expect(decision).toMatchObject({ admitted: false, reason });
    expect(decision.admitted === false && decision.message).toMatch(message);
  });

  const attempt = (overrides: { taskId?: string; producesTasks?: boolean } = {}) =>
    deriveAgentScope({
      kind: 'attempt',
      specId: 'S1',
      attemptId: '00000000-0000-4000-8000-000000000001',
      step: 'breakdown',
      attempt: 2,
      producesTasks: overrides.producesTasks ?? false,
      ...(overrides.taskId !== undefined ? { taskId: overrides.taskId } : {}),
    });

  it('gives an attempt its documents and finish proposal, and Task drafts only for a producing step', () => {
    expect(attempt()).toEqual({
      kind: 'attempt',
      specId: 'S1',
      attempt: { attemptId: '00000000-0000-4000-8000-000000000001', step: 'breakdown', attempt: 2 },
      operations: ['documents.create', 'documents.save', 'documents.classify', 'workflow.finish'],
    });
    expect(attempt({ producesTasks: true }).operations).toEqual([
      'documents.create',
      'documents.save',
      'documents.classify',
      'tasks.create',
      'tasks.edit',
      'workflow.finish',
    ]);
    // A Task subject writes no Specification document; its finish names the Task.
    expect(attempt({ taskId: 'T1' }).operations).toEqual(['workflow.finish']);
  });

  it('admits the finish of the attempt subject only', () => {
    const task = attempt({ taskId: 'T1' });
    expect(
      admitAgentOperation(task, { operation: 'workflow.finish', specId: 'S1', taskId: 'T1' }),
    ).toMatchObject({ admitted: true });
    expect(
      admitAgentOperation(task, { operation: 'workflow.finish', specId: 'S1', taskId: 'T2' }),
    ).toMatchObject({ admitted: false, reason: 'task-not-in-scope' });
    expect(admitAgentOperation(task, { operation: 'workflow.finish', specId: 'S1' })).toMatchObject(
      { admitted: false, reason: 'task-not-in-scope' },
    );
    expect(
      admitAgentOperation(attempt(), { operation: 'tasks.create', specId: 'S1' }),
    ).toMatchObject({ admitted: false, reason: 'operation-not-in-scope' });
    expect(
      admitAgentOperation(attempt({ producesTasks: true }), {
        operation: 'tasks.edit',
        specId: 'S1',
      }),
    ).toMatchObject({ admitted: true, operation: 'tasks.edit' });
  });
});
