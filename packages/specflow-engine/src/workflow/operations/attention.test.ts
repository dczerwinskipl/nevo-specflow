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
  scope: { kind: 'task', specId: 'spec', taskId: 'api' },
  status: 'unsatisfied',
  reason: 'no-document',
} as const;
const unresolved: StartBlocker = {
  kind: 'context-unresolved',
  entries: [{ index: 1, kind: 'path', reason: 'not-found' }],
};
const gates: StartBlocker = { kind: 'gates-unsatisfied', gates: [gate] };
const waiting: StartBlocker = { kind: 'dependencies', waitingFor: ['base'], unsatisfiable: [] };

const of = (...blockers: StartBlocker[]) => startBlockerAttention(subject, blockers, next, []);

describe('startBlockerAttention (owner decision 2A)', () => {
  it('gives no attention for being ready, a draft, a hold, a normal wait or an awaited artifact', () => {
    expect(of()).toBeUndefined();
    expect(of({ kind: 'status', status: 'draft' })).toBeUndefined();
    expect(of({ kind: 'status', status: 'on-hold' })).toBeUndefined();
    expect(of(waiting)).toBeUndefined();
    expect(of({ kind: 'context-awaited', entries: [{ index: 0, kind: 'path' }] })).toBeUndefined();
    // A draft with an unresolved context is still a draft: approving it comes first.
    expect(of({ kind: 'status', status: 'draft' }, unresolved)).toBeUndefined();
  });

  it('asks for an unmet entry gate only once no dependency can still deliver it', () => {
    // A dependency that can still complete may write the document: not attention yet.
    expect(of(waiting, gates)).toBeUndefined();
    expect(of(gates)).toMatchObject({
      reason: 'entry-gate-unsatisfied',
      actor: 'owner',
      action: 'satisfy-gate',
      step: 'implement',
      stepTitle: 'Implement',
      message: '"Implement" cannot start until A design document exists.',
    });
  });

  it('asks the owner to fix an actionable blocker, the most fundamental one first', () => {
    expect(
      of(unresolved, { kind: 'dependencies', waitingFor: ['b', 'a'], unsatisfiable: ['b', 'a'] }),
    ).toMatchObject({
      reason: 'dependency-unsatisfiable',
      action: 'edit-dependencies',
      secondaryAction: 'cancel-task',
      taskIds: ['a', 'b'],
    });
    expect(
      of(unresolved, { kind: 'type-not-allowed', message: 'Spike is not allowed.' }),
    ).toMatchObject({
      reason: 'type-not-allowed',
      action: 'open-project-settings',
      secondaryAction: 'cancel-task',
      message: 'Spike is not allowed.',
    });
  });

  it('points a dependency on a broken Task to restoring it', () => {
    expect(
      startBlockerAttention(
        subject,
        [{ kind: 'dependencies', waitingFor: ['gone'], unsatisfiable: ['gone'] }],
        next,
        ['gone'],
      ),
    ).toMatchObject({
      reason: 'dependency-unsatisfiable',
      action: 'restore-task',
      secondaryAction: 'edit-dependencies',
      taskIds: ['gone'],
      message:
        'It depends on broken tasks: gone. Restore their files from Git, or edit its dependencies.',
    });
  });
});
