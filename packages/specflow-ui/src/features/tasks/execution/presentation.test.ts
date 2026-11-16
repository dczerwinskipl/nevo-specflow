import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { actorLabel, personLabel, progressLine } from './presentation';

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

describe('progress line', () => {
  const echo = ((key: string, values?: Record<string, unknown>) =>
    [key, JSON.stringify(values)].join(' ')) as unknown as TFunction;
  const step = (position: number, title: string) => ({ step: 's' + position, title, position });

  it('names the position and the next step', () => {
    expect(
      progressLine(echo, { stepCount: 7, current: step(2, 'Write'), next: step(3, 'Design') }),
    ).toBe('workflowExecution.now.progressNext {"position":2,"total":7,"next":"Design"}');
    expect(progressLine(echo, { stepCount: 7, current: step(7, 'Accept') })).toBe(
      'workflowExecution.now.progress {"position":7,"total":7}',
    );
  });

  it('says nothing before the first start and once the run ended', () => {
    expect(progressLine(echo, { stepCount: 7, next: step(1, 'Gather') })).toBeUndefined();
    expect(progressLine(echo, { stepCount: 7 })).toBeUndefined();
    expect(progressLine(echo, undefined)).toBeUndefined();
  });
});
