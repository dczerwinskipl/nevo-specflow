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
    [{ operation: 'documents.save', specId: 'S2' }, 'other-specification', /S1, not of S2/],
    [{ operation: 'documents.save', specId: 'S1', taskId: 'T1' }, 'task-not-in-scope', /Task T1/],
  ] as const)('refuses %o with an actionable reason', (target, reason, message) => {
    const decision = admitAgentOperation(scope, target);
    expect(decision).toMatchObject({ admitted: false, reason });
    expect(decision.admitted === false && decision.message).toMatch(message);
  });
});
