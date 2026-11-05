import { describe, expect, it } from 'vitest';

import type { AgentArchetype, WorkStep, WorkflowTransition } from '../definitions/model';
import { resolveContinuation } from './resolve';

const reviewer: AgentArchetype = {
  id: 'reviewer',
  title: 'Reviewer',
  description: 'Reviews.',
  preferredProvider: 'codex',
  providers: [
    { provider: 'codex', model: 'gpt-x', effort: 'high' },
    { provider: 'claude', model: 'opus' },
    { provider: 'antigravity' },
  ],
};

const review: WorkStep = {
  kind: 'work',
  id: 'review',
  title: 'Review',
  purpose: 'Review.',
  executor: 'agent',
  archetype: 'reviewer',
  interaction: 'autonomous',
  transitions: [],
};

const transition = (overrides: Partial<WorkflowTransition> = {}): WorkflowTransition => ({
  id: 'done',
  target: { kind: 'step', step: 'review' },
  continuation: 'auto',
  session: 'fresh',
  feedback: 'optional',
  effects: [],
  ...overrides,
});

const archetypes = (id: string) => (id === 'reviewer' ? reviewer : undefined);

describe('resolveContinuation', () => {
  it('starts a fresh Session with the preferred provider and its model', () => {
    expect(resolveContinuation({ transition: transition(), next: review, archetypes })).toEqual({
      kind: 'continue',
      step: 'review',
      launch: {
        archetype: 'reviewer',
        provider: 'codex',
        model: 'gpt-x',
        effort: 'high',
        session: { mode: 'fresh' },
      },
    });
  });

  it('continues the finishing Session with the model the archetype has for that provider', () => {
    expect(
      resolveContinuation({
        transition: transition({ session: 'reuse' }),
        next: review,
        archetypes,
        finishing: { provider: 'claude', sessionId: 's-1' },
      }),
    ).toMatchObject({
      kind: 'continue',
      launch: { provider: 'claude', model: 'opus', session: { mode: 'reuse', sessionId: 's-1' } },
    });
  });

  it.each([
    [
      'the continued provider has no model',
      {
        transition: transition({ session: 'reuse' as const }),
        finishing: { provider: 'antigravity', sessionId: 's' },
      },
      { reason: 'model-missing', provider: 'antigravity' },
    ],
    [
      'there is no Session to continue',
      { transition: transition({ session: 'reuse' as const }) },
      { reason: 'session-unavailable' },
    ],
  ])('asks for attention when %s', (_name, input, expected) => {
    expect(resolveContinuation({ ...input, next: review, archetypes })).toMatchObject({
      kind: 'attention',
      step: 'review',
      ...expected,
    });
  });

  it('asks for attention when the preferred provider has no model, or none is preferred', () => {
    const withoutModel: AgentArchetype = { ...reviewer, providers: [{ provider: 'codex' }] };
    const withoutPreference: AgentArchetype = { ...reviewer, preferredProvider: undefined };
    expect(
      resolveContinuation({
        transition: transition(),
        next: review,
        archetypes: () => withoutModel,
      }),
    ).toMatchObject({ kind: 'attention', reason: 'model-missing', provider: 'codex' });
    expect(
      resolveContinuation({
        transition: transition(),
        next: review,
        archetypes: () => withoutPreference,
      }),
    ).toMatchObject({ kind: 'attention', reason: 'provider-not-chosen' });
    expect(
      resolveContinuation({ transition: transition(), next: review, archetypes: () => undefined }),
    ).toMatchObject({ kind: 'attention', reason: 'archetype-missing', archetype: 'reviewer' });
  });

  it('waits for the owner on an owner-action transition and prefills what would start', () => {
    expect(
      resolveContinuation({
        transition: transition({ continuation: 'owner-action' }),
        next: review,
        archetypes,
      }),
    ).toMatchObject({
      kind: 'attention',
      reason: 'owner-action',
      suggestion: { provider: 'codex', model: 'gpt-x' },
    });
    expect(
      resolveContinuation({
        transition: transition({ continuation: 'owner-action' }),
        next: review,
        archetypes: () => ({ ...reviewer, providers: [{ provider: 'codex' }] }),
      }),
    ).toMatchObject({ kind: 'attention', reason: 'owner-action', blocker: 'model-missing' });
  });

  it('treats human steps, waits and the end of the run without starting an agent', () => {
    expect(
      resolveContinuation({
        transition: transition(),
        next: { ...review, executor: 'human' },
        archetypes,
      }),
    ).toEqual({ kind: 'attention', step: 'review', reason: 'human-step' });
    expect(
      resolveContinuation({
        transition: transition(),
        next: { kind: 'wait-for-tasks', id: 'wait', title: 'W', purpose: 'W', transitions: [] },
        archetypes,
      }),
    ).toEqual({ kind: 'none', reason: 'waiting-for-tasks' });
    expect(resolveContinuation({ transition: transition(), archetypes })).toEqual({
      kind: 'none',
      reason: 'terminal',
    });
  });
});
