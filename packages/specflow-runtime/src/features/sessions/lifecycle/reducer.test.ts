import { describe, expect, it } from 'vitest';
import type { TurnSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';
import { terminalizeTurn, transitionWork } from './reducer';

describe('Session lifecycle arbitration', () => {
  it('honors durable cancellation and never replaces an already settled outcome', () => {
    const turn = { state: 'active', revision: 3 } as unknown as TurnSummary;
    const settled = terminalizeTurn(turn, 'completed', 'now', true);
    expect(settled).toMatchObject({ state: 'terminal', outcome: 'cancelled', revision: 4 });
    expect(terminalizeTurn(settled, 'failed', 'later', false)).toBe(settled);
    expect(turn).toEqual({ state: 'active', revision: 3 });
  });
  it('does not reopen settled Work after a delayed provider callback', () => {
    const work = { state: 'active', revision: 1 } as unknown as WorkSummary;
    const settled = transitionWork(work, 'completed', 'now');
    expect(transitionWork(settled, 'active', 'later')).toBe(settled);
  });
});
