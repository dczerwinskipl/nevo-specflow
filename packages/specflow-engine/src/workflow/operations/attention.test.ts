import { describe, expect, it } from 'vitest';

import { startBlockerAttention } from './attention';
import type { StartBlocker } from './start-blockers';

const subject = { kind: 'task', specId: 'spec', taskId: 'api' } as const;
const next = { step: { id: 'implement', title: 'Implement' } };
const gate = {
  id: 'entry-1',
  type: 'document',
  label: 'A design document exists',
  documentType: 'design',
  scope: { kind: 'subject' },
  status: 'unsatisfied',
  reason: 'no-document',
} as const;
const unresolved: StartBlocker = {
  kind: 'context-unresolved',
  entries: [{ index: 1, kind: 'path', reason: 'not-found' }],
};

const of = (...blockers: StartBlocker[]) => startBlockerAttention(subject, blockers, next);

describe('startBlockerAttention (owner decision 2A)', () => {
  it('gives no attention for being ready, a draft, a hold, a normal wait or an awaited artifact', () => {
    expect(of()).toBeUndefined();
    expect(of({ kind: 'status', status: 'draft' })).toBeUndefined();
    expect(of({ kind: 'status', status: 'on-hold' })).toBeUndefined();
    expect(of({ kind: 'dependencies', waitingFor: ['base'], unsatisfiable: [] })).toBeUndefined();
    expect(of({ kind: 'context-awaited', entries: [{ index: 0, kind: 'path' }] })).toBeUndefined();
    // A draft with an unresolved context is still a draft: approving it comes first.
    expect(of({ kind: 'status', status: 'draft' }, unresolved)).toBeUndefined();
  });

  it('asks the owner to fix an actionable blocker, the most fundamental one first', () => {
    expect(
      of(
        { kind: 'dependencies', waitingFor: ['base'], unsatisfiable: [] },
        { kind: 'gates-unsatisfied', gates: [gate] },
      ),
    ).toMatchObject({
      reason: 'entry-gate-unsatisfied',
      actor: 'owner',
      action: 'satisfy-gate',
      step: 'implement',
      stepTitle: 'Implement',
      message: '"Implement" cannot start until A design document exists.',
    });
    expect(
      of(unresolved, { kind: 'dependencies', waitingFor: ['b', 'a'], unsatisfiable: ['b', 'a'] }),
    ).toMatchObject({
      reason: 'dependency-unsatisfiable',
      action: 'edit-dependencies',
      taskIds: ['a', 'b'],
    });
    expect(
      of(unresolved, { kind: 'type-not-allowed', message: 'Spike is not allowed.' }),
    ).toMatchObject({
      reason: 'type-not-allowed',
      action: 'remove-or-cancel',
      message: 'Spike is not allowed.',
    });
  });
});
