import { describe, expect, it } from 'vitest';
import { createSpecItem, createSpecsFixture } from './fixtures';
import { orderedSignals, steeringGroups } from './model';

describe('Spec steering presentation', () => {
  it('keeps concurrent signals on one neutral Specification queue position', () => {
    const fixture = createSpecsFixture();
    const groups = steeringGroups(fixture.items);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toHaveLength(
      fixture.items.length,
    );
    expect(groups[0]?.items[0]?.id).toBe('admission');
    expect(orderedSignals(fixture.items[0]!)).toHaveLength(4);
    expect(orderedSignals(fixture.items[0]!)[0]?.target).toEqual({
      kind: 'session',
      specId: 'admission',
      sessionId: 'session-23',
    });
  });
  it('does not promote agent-remediable issues into human attention', () => {
    const groups = steeringGroups(createSpecsFixture().items.slice(5));
    expect(groups.map((group) => group.kind)).toEqual(['quiet']);
  });
  it('does not show unavailable steering as calm authoritative state', () => {
    const item = createSpecItem({ ...createSpecsFixture().items[0]!, steeringAvailable: false });
    expect(steeringGroups([item])[0]?.kind).toBe('quiet');
    expect(item.steeringAvailable).toBe(false);
  });
  it('sorts a copy of semantic signals without changing the source projection', () => {
    const item = createSpecsFixture().items[0]!;
    const reversed = { ...item, signals: [...item.signals].reverse() };
    const sourceOrder = reversed.signals.map((signal) => signal.id);
    expect(orderedSignals(reversed)[0]?.id).toBe('input');
    expect(reversed.signals.map((signal) => signal.id)).toEqual(sourceOrder);
  });
});
