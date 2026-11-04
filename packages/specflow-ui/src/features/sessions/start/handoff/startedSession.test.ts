import { afterEach, describe, expect, it } from 'vitest';
import { codexClaudeCatalogue } from '../catalogue/startCatalogue.stories-support';
import {
  consumeStartFocus,
  forgetStartedSessions,
  rememberStartedSession,
  startedSessionContext,
  startedSessionFrom,
  startedSessionOf,
  type StartedSession,
} from './startedSession';

afterEach(forgetStartedSessions);

const choice = { providerId: 'claude', modelId: 'model-a', effort: 'high', mode: 'acceptEdits' };
const input = {
  catalogue: codexClaudeCatalogue,
  choice,
  name: { mode: 'agent', value: '' } as const,
  modeTitle: (title: unknown) => String(title),
};

describe('startedSessionFrom', () => {
  it('carries the provider, model, effort and mode as the user saw them', () => {
    expect(startedSessionFrom(input)).toEqual({
      providerId: 'claude',
      providerIcon: 'claude',
      providerTitle: 'Claude',
      modelId: 'model-a',
      modelTitle: 'claude model A',
      effort: 'high',
      modeId: 'acceptEdits',
      modeTitle: 'Accept edits',
    });
  });

  it('leaves out the provider default effort, an absent model and the agent-given name', () => {
    const started = startedSessionFrom({
      ...input,
      choice: { ...choice, modelId: '', effort: 'provider-default' },
    });
    expect(started).not.toHaveProperty('effort');
    expect(started).not.toHaveProperty('modelId');
    expect(started).not.toHaveProperty('title');
  });

  it('keeps an own name trimmed, and the pinned Specification', () => {
    const specification = {
      status: 'ready',
      value: { id: 's', key: 'SPEC-1', title: 'Logowanie SSO' },
    } as const;
    expect(
      startedSessionFrom({
        ...input,
        name: { mode: 'custom', value: '  Review SSO ' },
        specification,
      }),
    ).toMatchObject({ title: 'Review SSO', specification });
  });

  it('has nothing to hand over for a provider the catalogue does not know', () => {
    expect(
      startedSessionFrom({ ...input, choice: { ...choice, providerId: 'gone' } }),
    ).toBeUndefined();
  });
});

describe('startedSessionContext', () => {
  const base: StartedSession = { providerId: 'p', providerIcon: undefined, providerTitle: 'P' };

  it('is the Specification scope with its Specification when one was pinned', () => {
    const specification = {
      status: 'ready',
      value: { id: 's', key: 'SPEC-1', title: 'T' },
    } as const;
    expect(startedSessionContext({ ...base, specification })).toEqual({
      scope: { kind: 'specification' },
      specification,
    });
  });

  it('is standalone, not "unknown", for a Session without a Specification', () => {
    expect(startedSessionContext(base)).toEqual({ scope: { kind: 'standalone' } });
  });
});

describe('the start handoff', () => {
  const started: StartedSession = { providerId: 'p', providerIcon: undefined, providerTitle: 'P' };

  it('is read by the Session it was remembered for, and by no other', () => {
    rememberStartedSession('a', started);
    expect(startedSessionOf('a')).toBe(started);
    expect(startedSessionOf('b')).toBeUndefined();
  });

  it('asks for the Composer focus exactly once', () => {
    rememberStartedSession('a', started);
    expect(consumeStartFocus('a')).toBe(true);
    expect(consumeStartFocus('a')).toBe(false);
    expect(startedSessionOf('a')).toBe(started);
    expect(consumeStartFocus('never-started')).toBe(false);
  });

  it('forgets the oldest start once more than a few are remembered', () => {
    for (let index = 0; index < 20; index += 1) {
      rememberStartedSession(`s${index}`, started);
    }

    expect(startedSessionOf('s0')).toBeUndefined();
    expect(consumeStartFocus('s0')).toBe(false);
    expect(startedSessionOf('s19')).toBe(started);
  });
});
