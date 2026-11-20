import { WORKFLOW_EFFECTS } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { effectAuthorityOf, requiresOwnerConfirmation } from './effect-authority';
import type { WorkflowTransition } from './model';

const transition = (
  annotations: Partial<WorkflowTransition['annotations']> = {},
): WorkflowTransition => ({
  id: 'done',
  target: { kind: 'terminal', outcome: 'completed' },
  continuation: 'owner-action',
  feedback: 'optional',
  annotations: { session: 'fresh', effects: [], escalate: false, ...annotations },
});

describe('effect authority', () => {
  it('classifies every effect, and approving draft Tasks is the owner', () => {
    for (const effect of WORKFLOW_EFFECTS) {
      expect(['owner', 'agent']).toContain(effectAuthorityOf(effect));
    }

    expect(effectAuthorityOf('approve-draft-tasks')).toBe('owner');
  });

  it.each([
    ['no effect and no marker', {}, false],
    ['an owner-authority effect', { effects: ['approve-draft-tasks' as const] }, true],
    ['the owner confirmation marker', { confirmation: 'owner' as const }, true],
  ])('requires owner confirmation for %s: %s', (_name, annotations, expected) => {
    expect(requiresOwnerConfirmation(transition(annotations))).toBe(expected);
  });
});
