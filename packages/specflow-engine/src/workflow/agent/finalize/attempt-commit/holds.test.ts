import { describe, expect, it } from 'vitest';

import { specificationWaitOf } from '../../../attempt-commit-admission';
import { attemptCommitHoldsOf } from './holds';

const SPEC = 'spec-1';
const WORKSPACE = 'workspace-1';

describe('the attempt commit holds of a checkout', () => {
  it('are none while every journal is read and none waits', () => {
    const holds = attemptCommitHoldsOf(
      { journals: [], unreadable: [], truncated: false },
      WORKSPACE,
      [],
    );
    expect(holds).toEqual({ readable: true, holds: [], executions: new Set() });
    expect(specificationWaitOf(holds, SPEC)).toBeUndefined();
  });

  it.each([
    ['a journal cannot be read', { unreadable: ['2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02'] }],
    ['the listing was cut short', { truncated: true }],
  ])('fail closed when %s: the unread journal may be the one that waits', (_name, listing) => {
    const holds = attemptCommitHoldsOf(
      { journals: [], unreadable: [], truncated: false, ...listing },
      WORKSPACE,
      [],
    );
    expect(holds).toEqual({ readable: false });
    expect(() => specificationWaitOf(holds, SPEC)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});
