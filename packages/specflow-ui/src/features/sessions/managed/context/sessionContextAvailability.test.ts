import { describe, expect, it } from 'vitest';
import { isRequired, isSectionPresent, resolveSection } from './sessionContextAvailability';
import type { SessionScope } from './sessionContextTypes';

const unknown: SessionScope = { kind: 'unknown', reason: 'not-provided' };
const standalone: SessionScope = { kind: 'standalone' };
const specification: SessionScope = { kind: 'specification' };
const task: SessionScope = { kind: 'task', taskCount: 2 };

describe('isRequired', () => {
  it('always requires the executor', () => {
    for (const scope of [unknown, standalone, specification, task]) {
      expect(isRequired('executor', scope)).toBe(true);
    }
  });

  it('requires the Specification for specification and task scope only', () => {
    expect(
      [unknown, standalone, specification, task].map((s) => isRequired('specification', s)),
    ).toEqual([false, false, true, true]);
  });

  it('requires the executed Tasks for task scope only', () => {
    expect(
      [unknown, standalone, specification, task].map((s) => isRequired('executionScope', s)),
    ).toEqual([false, false, false, true]);
  });

  it('never requires Attention, Related Tasks or Work history', () => {
    for (const section of ['attention', 'relatedTasks', 'workHistory'] as const) {
      expect(isRequired(section, task)).toBe(false);
    }
  });
});

describe('isSectionPresent', () => {
  it('keeps Specification, execution, Attention and Related Tasks out of unknown and standalone Sessions', () => {
    for (const section of [
      'specification',
      'executionScope',
      'attention',
      'relatedTasks',
    ] as const) {
      expect(isSectionPresent(section, unknown)).toBe(false);
      expect(isSectionPresent(section, standalone)).toBe(false);
      expect(isSectionPresent(section, specification)).toBe(true);
      expect(isSectionPresent(section, task)).toBe(true);
    }
  });

  it('always has the executor and Work', () => {
    expect(isSectionPresent('executor', unknown)).toBe(true);
    expect(isSectionPresent('workHistory', standalone)).toBe(true);
  });
});

describe('resolveSection', () => {
  it('omits an absent fact', () => {
    expect(resolveSection(undefined, true)).toEqual({ kind: 'omit' });
  });

  it('shows a skeleton while loading, required or not', () => {
    expect(resolveSection({ status: 'loading' }, true)).toEqual({ kind: 'skeleton' });
    expect(resolveSection({ status: 'loading' }, false)).toEqual({ kind: 'skeleton' });
  });

  it('is ready with its value, and omits an empty ready list', () => {
    expect(resolveSection({ status: 'ready', value: 'x' }, false)).toEqual({
      kind: 'ready',
      value: 'x',
    });
    expect(resolveSection({ status: 'ready', value: [] }, true)).toEqual({ kind: 'omit' });
    expect(resolveSection({ status: 'ready', value: [1] }, false)).toEqual({
      kind: 'ready',
      value: [1],
    });
  });

  it('warns for unreadable whether or not it is required', () => {
    expect(resolveSection({ status: 'unreadable' }, true)).toEqual({ kind: 'warning' });
    expect(resolveSection({ status: 'unreadable' }, false)).toEqual({ kind: 'warning' });
  });

  it('warns for a missing optional reference and errors for a missing required one', () => {
    expect(resolveSection({ status: 'missing' }, false)).toEqual({ kind: 'warning' });
    expect(resolveSection({ status: 'missing', ref: { key: 'SPEC-A' } }, true)).toEqual({
      kind: 'error',
      ref: { key: 'SPEC-A' },
    });
  });
});
