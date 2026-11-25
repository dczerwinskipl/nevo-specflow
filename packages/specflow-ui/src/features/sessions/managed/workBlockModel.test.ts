import { describe, expect, it } from 'vitest';
import { liveActivity } from './workBlockModel';

describe('liveActivity', () => {
  const activeTurn = { turnId: 't', state: 'active' as const, revision: 1, startedAt: 'x' };

  it('prefers the runtime current activity and leaves attention to the interaction prompt', () => {
    expect(liveActivity(activeTurn, { kind: 'tool', turnId: 't', label: 'Read a.ts' })).toEqual({
      kind: 'tool',
      label: 'Read a.ts',
    });
    expect(liveActivity(activeTurn, { kind: 'attention', turnId: 't', label: 'x' })).toBe(
      undefined,
    );
  });

  it('falls back to the Turn state and is absent without an active Turn', () => {
    expect(liveActivity({ ...activeTurn, state: 'cancelling' }, undefined)).toEqual({
      kind: 'cancelling',
    });
    expect(liveActivity({ ...activeTurn, state: 'waitingForUser' }, undefined)).toBe(undefined);
    expect(liveActivity(undefined, undefined)).toBe(undefined);
  });

  it('shows nothing live for a Turn whose outcome is unknown, whatever the Runtime label says', () => {
    expect(
      liveActivity(
        { ...activeTurn, state: 'unknown' },
        { kind: 'unknown', turnId: 't', label: 'Outcome unknown' },
      ),
    ).toBe(undefined);
  });
});
