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

const sent = { providerId: 'claude', modelId: 'model-a', effort: 'high', modeId: 'acceptEdits' };
const input = {
  catalogue: codexClaudeCatalogue,
  sent,
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

  it('leaves out an absent effort, model and name', () => {
    const started = startedSessionFrom({ ...input, sent: { providerId: 'claude' } });
    expect(started).not.toHaveProperty('effort');
    expect(started).not.toHaveProperty('modelId');
    expect(started).not.toHaveProperty('modeId');
    expect(started).not.toHaveProperty('title');
  });

  it('keeps the own name that was sent, and the pinned Specification', () => {
    const specification = {
      status: 'ready',
      value: { id: 's', key: 'SPEC-1', title: 'Logowanie SSO' },
    } as const;
    expect(
      startedSessionFrom({ ...input, sent: { ...sent, title: 'Review SSO' }, specification }),
    ).toMatchObject({ title: 'Review SSO', specification });
  });

  it('is what was sent, not what any form holds: the ids stand in where the catalogue lacks them', () => {
    expect(startedSessionFrom({ ...input, catalogue: undefined })).toMatchObject({
      providerId: 'claude',
      providerTitle: 'claude',
      modelTitle: 'model-a',
      modeTitle: 'acceptEdits',
    });
    expect(startedSessionFrom({ ...input, sent: { ...sent, providerId: 'gone' } })).toMatchObject({
      providerTitle: 'gone',
      modelTitle: 'model-a',
    });
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
    rememberStartedSession('alice', 'a', started);
    expect(startedSessionOf('alice', 'a')).toBe(started);
    expect(startedSessionOf('alice', 'b')).toBeUndefined();
  });

  it('is never read by another signed-in user, nor focused for them', () => {
    rememberStartedSession('alice', 'a', started);
    expect(startedSessionOf('bob', 'a')).toBeUndefined();
    expect(consumeStartFocus('bob', 'a')).toBe(false);
    expect(startedSessionOf('alice', 'a')).toBe(started);
  });

  it('is forgotten altogether when the identity changes', () => {
    rememberStartedSession('alice', 'a', started);
    forgetStartedSessions();
    expect(startedSessionOf('alice', 'a')).toBeUndefined();
    expect(consumeStartFocus('alice', 'a')).toBe(false);
  });

  it('asks for the Composer focus exactly once', () => {
    rememberStartedSession('alice', 'a', started);
    expect(consumeStartFocus('alice', 'a')).toBe(true);
    expect(consumeStartFocus('alice', 'a')).toBe(false);
    expect(startedSessionOf('alice', 'a')).toBe(started);
    expect(consumeStartFocus('alice', 'never-started')).toBe(false);
  });

  it('forgets the oldest start once more than a few are remembered', () => {
    for (let index = 0; index < 20; index += 1) {
      rememberStartedSession('alice', `s${index}`, started);
    }

    expect(startedSessionOf('alice', 's0')).toBeUndefined();
    expect(consumeStartFocus('alice', 's0')).toBe(false);
    expect(startedSessionOf('alice', 's19')).toBe(started);
  });
});
