import { describe, expect, it } from 'vitest';

import { agentTurnClaimMessage } from '../../coordination/resources';
import { SharedResourceError } from '../../durable';
import { claimConflictOf } from './claim-source';

const SESSION = '0c7bd804-18d3-41a1-9ae7-96425bce149e';

const heldBy = (phase: 'admitted' | 'dispatched' | 'unknown') =>
  new SharedResourceError('RESOURCE_CONFLICT', agentTurnClaimMessage(SESSION, phase), {
    kind: 'external',
    operationId: '7d1f0c64-4a39-4a8b-9a3b-2f9b8f0e7c11',
    ownerId: SESSION,
    phase,
  });

describe('the refusal of a write while an agent execution claim holds the project', () => {
  it('names the running Turn and says to retry once it ended', () => {
    for (const phase of ['admitted', 'dispatched'] as const) {
      const conflict = claimConflictOf(heldBy(phase));
      expect(conflict.cause).toBe('busy-agent-turn');
      expect(conflict.message).toContain(`(Session ${SESSION}) holds the project-wide write claim`);
      expect(conflict.message).toContain('Retry once the Turn has ended');
    }
  });

  it('says a Turn whose outcome is unknown has ended and its Session needs resolving', () => {
    const conflict = claimConflictOf(heldBy('unknown'));
    expect(conflict.cause).toBe('busy-agent-turn-unknown');
    expect(conflict.message).toContain(`(Session ${SESSION}) ended without a verified outcome`);
    expect(conflict.message).toContain('use Check outcome, or recover the Session');
    expect(conflict.message).not.toContain('Retry once the Turn has ended');
  });

  it('keeps the Create or Close refusal for the other holders', () => {
    const close = new SharedResourceError('RESOURCE_CONFLICT', 'Unfinished Close.', {
      kind: 'close',
      operationId: 'c',
    });
    expect(claimConflictOf(close)).toEqual({
      cause: 'busy-create-or-close',
      message: 'A Create or Close holds this checkout.',
    });
  });
});
