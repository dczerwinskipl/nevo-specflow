import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { actorLabel, personLabel } from './presentation';

const t = ((key: string) => (key === 'workflowExecution.actor.you' ? 'you' : key)) as TFunction;

describe('recorded actor labels', () => {
  it('names the viewer and the trusted local person "you"', () => {
    expect(personLabel(t, 'user:ann', 'ann')).toBe('you');
    expect(personLabel(t, 'runtime:trusted-local')).toBe('you');
  });

  it('names anyone else by the recorded id without its identity-source prefix', () => {
    expect(personLabel(t, 'user:bob', 'ann')).toBe('bob');
    expect(personLabel(t, 'local:bob')).toBe('bob');
    expect(personLabel(t, 'user:ann')).toBe('ann');
  });

  it('names an agent by provider and model', () => {
    expect(
      actorLabel(t, { class: 'agent', details: { provider: 'claude', model: 'opus' } }, 'ann'),
    ).toBe('claude · opus');
    expect(
      actorLabel(
        t,
        { class: 'human', details: { actorId: 'user:ann', trust: 'authenticated' } },
        'ann',
      ),
    ).toBe('you');
  });
});
