import { describe, expect, it } from 'vitest';
import { createWorkspaceOccupancy } from './workspace-occupancy';

describe('workspace occupancy', () => {
  it('refuses a Close while a Turn works in the checkout, and admits it once the Turn ends', () => {
    const occupancy = createWorkspaceOccupancy();
    const turn = occupancy.beginTurn('w1', 's1')!;
    occupancy.beginTurn('w2', 's2');

    expect(occupancy.runningSessions('w1')).toEqual(['s1']);
    expect(occupancy.holdForClose('w1')).toEqual({ kind: 'busy', sessionIds: ['s1'] });

    turn.end();
    turn.end();
    expect(occupancy.runningSessions('w1')).toEqual([]);
    expect(occupancy.holdForClose('w1').kind).toBe('held');
  });

  it('refuses a Turn while a Close holds the checkout, until the hold ends', () => {
    const occupancy = createWorkspaceOccupancy();
    const hold = occupancy.holdForClose('w1');
    if (hold.kind !== 'held') {
      throw new Error('Expected a hold.');
    }

    expect(occupancy.beginTurn('w1', 's1')).toBeUndefined();
    expect(occupancy.beginTurn('w2', 's2')).toBeDefined();
    hold.end();
    expect(occupancy.beginTurn('w1', 's1')).toBeDefined();
  });
});
