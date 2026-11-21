import type { AgentAttemptJournal } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { projectHoldOf, type HoldingClaim } from './project-hold';

const journalOf = (taskId: string, sessionId: string) =>
  ({
    subject: { kind: 'task', specId: 'spec-1', taskId },
    actor: { class: 'agent', details: { provider: 'claude', sessionId } },
  }) as unknown as AgentAttemptJournal;

describe('the project hold', () => {
  it('names the first agent claim with a journal, an unknown outcome first', async () => {
    const claims: HoldingClaim[] = [
      { phase: 'dispatched', intent: { ownerId: 's-a', attempt: { attemptId: 'working' } } },
      { phase: 'unknown', intent: { ownerId: 's-b', attempt: { attemptId: 'gone' } } },
      { phase: 'unknown', intent: { ownerId: 's-c', attempt: { attemptId: 'unknown' } } },
      { phase: 'dispatched', intent: { ownerId: 's-d' } },
    ];
    const journals = new Map([
      ['working', journalOf('api', 's-a')],
      ['unknown', journalOf('screen', 's-c')],
    ]);
    const sources = {
      journal: (id: string) => Promise.resolve(journals.get(id)),
      title: () => Promise.resolve('Screen'),
    };

    expect(await projectHoldOf(claims, sources)).toEqual({
      kind: 'agent-outcome-unknown',
      subject: { specId: 'spec-1', taskId: 'screen', title: 'Screen' },
      sessionId: 's-c',
    });
    journals.delete('unknown');
    expect(await projectHoldOf(claims, sources)).toMatchObject({
      kind: 'agent-working',
      subject: { taskId: 'api' },
    });
    expect(await projectHoldOf(claims.slice(3), sources)).toBeUndefined();
  });
});
