// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import {
  forgetStartedSessions,
  rememberStartedSession,
  type StartedSession,
} from './startedSession';
import { useStartedSessionFallback } from './useStartedSessionFallback';

afterEach(() => {
  cleanup();
  forgetStartedSessions();
});

const started: StartedSession = {
  providerId: 'claude',
  providerIcon: 'claude',
  providerTitle: 'Claude',
  modelId: 'm1',
  modelTitle: 'Model one',
  effort: 'high',
};

function use(
  connection: 'loading' | 'connected' | 'reconnecting' | 'error',
  hasSnapshot = false,
  owner = 'alice',
) {
  return renderHook(
    () => useStartedSessionFallback({ owner, sessionId: 's1', hasSnapshot, connection }),
    {
      wrapper: ({ children }) => (
        <LocalizationProvider instance={createSpecFlowI18n('en')}>{children}</LocalizationProvider>
      ),
    },
  ).result.current;
}

describe('useStartedSessionFallback', () => {
  it('has nothing to say for a Session that was not started here', () => {
    const fallback = use('connected');
    expect(fallback).toMatchObject({
      startedHere: undefined,
      pending: undefined,
      providerId: undefined,
      executor: undefined,
      title: undefined,
      subtitle: undefined,
    });
  });

  it('stands in for the snapshot with the start values, as New session, ready', () => {
    rememberStartedSession('alice', 's1', started);
    const fallback = use('connected');
    expect(fallback).toMatchObject({
      providerId: 'claude',
      modelId: 'm1',
      effort: 'high',
      title: 'New session',
      subtitle: 'Ready',
      executor: {
        status: 'ready',
        value: { providerId: 'claude', providerTitle: 'Claude', modelTitle: 'Model one' },
      },
    });
  });

  it('shows the own name as the title at once', () => {
    rememberStartedSession('alice', 's1', { ...started, title: 'Review SSO' });
    expect(use('loading').title).toBe('Review SSO');
  });

  it('follows the real connection instead of claiming the Session is ready', () => {
    rememberStartedSession('alice', 's1', started);
    expect(use('error').subtitle).toBe('Connection lost');
    expect(use('reconnecting').subtitle).toBe('Reconnecting…');
    expect(use('loading').subtitle).toBe('Ready');
  });

  it('steps aside once the snapshot is there, but keeps the title and what it was started with', () => {
    rememberStartedSession('alice', 's1', started);
    const fallback = use('connected', true);
    expect(fallback).toMatchObject({
      pending: undefined,
      providerId: undefined,
      executor: undefined,
      subtitle: undefined,
      title: 'New session',
    });
    expect(fallback.startedHere).toBeDefined();
  });

  it("never reads another user's start", () => {
    rememberStartedSession('alice', 's1', started);
    expect(use('connected', false, 'bob')).toMatchObject({
      startedHere: undefined,
      title: undefined,
    });
  });
});
