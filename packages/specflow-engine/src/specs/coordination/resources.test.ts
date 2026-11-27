import { describe, expect, it } from 'vitest';

import type { WorkspaceExecutionJournal } from '../../execution/model';
import type { OwnedExecutionClaim } from '../durable';
import { foreignExecutionClaim, type ExecutionClaimSelf } from './resources';

const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function claim(
  operationId: string,
  phase: WorkspaceExecutionJournal['phase'],
): WorkspaceExecutionJournal {
  return {
    version: 1,
    projectId: '33333333-3333-4333-8333-333333333333',
    gitInstanceId: '44444444-4444-4444-8444-444444444444',
    intent: { operationId, ownerId: 'session-' + operationId.slice(0, 1), binding: 'a'.repeat(64) },
    workspace: { workspaceId: '55555555-5555-4555-8555-555555555555', root: '/checkout' },
    registryRevision: 1,
    resources: ['project-write:33333333-3333-4333-8333-333333333333'],
    phase,
  };
}

const turn: OwnedExecutionClaim = { operationId: OWN, form: 'turn' };
const finalize: OwnedExecutionClaim = { operationId: OWN, form: 'finalize' };
const owned = (ownedExecution: OwnedExecutionClaim): ExecutionClaimSelf => ({ ownedExecution });
const document = (ownedExecution?: OwnedExecutionClaim): ExecutionClaimSelf => ({
  kind: 'document-change',
  operationId: '66666666-6666-4666-8666-666666666666',
  ...(ownedExecution ? { ownedExecution } : {}),
});

describe('foreignExecutionClaim (owned-claim admission, D11)', () => {
  it.each([
    // [what, self, the claim's phase, admitted]
    ['no owner: a running Turn refuses', undefined, 'dispatched', false],
    ['no owner: an ended Turn without outcome refuses', undefined, 'unknown', false],
    [
      'the execution itself (its own admission)',
      { kind: 'external', operationId: OWN },
      'unknown',
      true,
    ],
    ['turn form, dispatched', owned(turn), 'dispatched', true],
    ['turn form through a document write', document(turn), 'dispatched', true],
    ['turn form, admitted: nothing of the Turn runs yet', owned(turn), 'admitted', false],
    ['turn form, unknown: the Turn has ended', owned(turn), 'unknown', false],
    ['finalize form, admitted', owned(finalize), 'admitted', true],
    ['finalize form, dispatched', owned(finalize), 'dispatched', true],
    ['finalize form, unknown', owned(finalize), 'unknown', true],
    ['a document write without an owner', document(), 'dispatched', false],
  ] as const)('%s', (_what, self, phase, admitted) => {
    const holder = foreignExecutionClaim([claim(OWN, phase)], self);

    expect(holder === undefined).toBe(admitted);
  });

  it('never admits another execution, and names the first foreign holder', () => {
    for (const self of [owned(turn), owned(finalize)]) {
      expect(
        foreignExecutionClaim([claim(OWN, 'dispatched'), claim(OTHER, 'unknown')], self),
      ).toEqual({ kind: 'external', operationId: OTHER, ownerId: 'session-2', phase: 'unknown' });
    }
  });

  it('ignores settled claims', () => {
    expect(foreignExecutionClaim([claim(OTHER, 'settled')], undefined)).toBeUndefined();
  });
});
