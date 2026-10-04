import { Time } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
  createMinuteOptions,
  minuteStepDelta,
  nearestMinuteOption,
  normalizeMinuteStep,
  snapTimeToMinuteStep,
  withHour,
} from './TimeSelector.model';

describe('TimeSelector.model', () => {
  it('defaults to one-minute granularity', () => {
    expect(normalizeMinuteStep()).toBe(1);
    expect(createMinuteOptions(new Time(10, 17))).toHaveLength(60);
  });

  it('supports 5, 10 and 15 minute option sets', () => {
    expect(createMinuteOptions(new Time(10, 17), 5)).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    ]);
    expect(createMinuteOptions(new Time(10, 17), 10)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(createMinuteOptions(new Time(10, 17), 15)).toEqual([0, 15, 30, 45]);
  });

  it('does not inject an off-step minute into picker options', () => {
    expect(createMinuteOptions(new Time(10, 17), 5)).not.toContain(17);
  });

  it('snaps to the nearest legal minute', () => {
    expect(snapTimeToMinuteStep(new Time(14, 32), 5)).toEqual(new Time(14, 30));
    expect(snapTimeToMinuteStep(new Time(14, 33), 5)).toEqual(new Time(14, 35));
  });

  it('rolls Time across midnight instead of inventing minute 59', () => {
    expect(minuteStepDelta(new Time(23, 58), 5)).toBe(2);
    expect(snapTimeToMinuteStep(new Time(23, 58), 5)).toEqual(new Time(0, 0));
    expect(snapTimeToMinuteStep(new Time(23, 57), 10)).toEqual(new Time(0, 0));
  });

  it('uses the nearest constrained legal time when min/max are present', () => {
    expect(snapTimeToMinuteStep(new Time(23, 58), 5, new Time(9, 0), new Time(23, 59))).toEqual(
      new Time(23, 55),
    );
  });

  it('finds the nearest legal minute without mutating the actual value', () => {
    expect(nearestMinuteOption(new Time(14, 32), 5)).toBe(30);
  });

  it('clamps an hour change against the minimum', () => {
    const min = new Time(9, 30);
    expect(withHour(new Time(10, 15), 9, min)).toEqual(min);
  });
});
