import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { isHumanAttempt, stepLine } from './stepExecutors';

const t = ((key: string) => (key.endsWith('.human') ? 'Human' : 'Agent')) as unknown as TFunction;

describe('step executors', () => {
  it('lists who may work on a step neutrally and nothing for a wait step', () => {
    expect(stepLine(t, { id: 'build', executors: ['agent', 'human'] })).toBe(
      'build · Agent / Human',
    );
    expect(stepLine(t, { id: 'wait-for-tasks', executors: [] })).toBe('wait-for-tasks');
  });

  it('takes the active attempt actor, not the step executors', () => {
    const step = { executors: ['agent', 'human'] as const };

    expect(isHumanAttempt({ step, actor: { class: 'agent' } })).toBe(false);
    expect(isHumanAttempt({ step, actor: { class: 'human' } })).toBe(true);
    // Without a recorded actor only a person-only step is a person's attempt.
    expect(isHumanAttempt({ step })).toBe(false);
    expect(isHumanAttempt({ step: { executors: ['human'] } })).toBe(true);
  });
});
