import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextFact, SessionExecutor } from '../../managed/context/sessionContextTypes';
import type { FeedState } from '../../managed/feed';
import { startedSessionOf, type StartedSession } from './startedSession';
import { useFocusStartedComposer } from './useFocusStartedComposer';

/**
 * What a Session screen shows for a Session just started here until its first snapshot arrives
 * (new-session-ui-spec.md, section 3(c)): the start values stand in for the snapshot's provider,
 * model, effort and executor, the header says "New session" and what the connection really is, and
 * Context has no Work history to wait for. Everything is `undefined` once the snapshot is there, or
 * for a Session that was not started here, so the screen's own derivations apply unchanged.
 */
export interface StartedSessionFallback {
  /** What the Session was started with, while it is remembered (also after its snapshot). */
  startedHere: StartedSession | undefined;
  /** The same, only while there is no snapshot: the stand-in for it. */
  pending: StartedSession | undefined;
  providerId: string | undefined;
  modelId: string | undefined;
  effort: string | undefined;
  executor: ContextFact<SessionExecutor> | undefined;
  /** Header title when the Session has none of its own yet. */
  title: string | undefined;
  /** Header subtitle while there is no snapshot: the connection as it really is. */
  subtitle: string | undefined;
}

export function useStartedSessionFallback(input: {
  owner: string;
  sessionId: string;
  hasSnapshot: boolean;
  connection: FeedState['connection'];
}): StartedSessionFallback {
  const { t } = useTranslation();
  const startedHere = startedSessionOf(input.owner, input.sessionId);
  const pending = input.hasSnapshot ? undefined : startedHere;
  // Once the Composer is active, a Session just started here takes focus (the user writes next).
  useFocusStartedComposer(input.owner, input.sessionId, input.hasSnapshot && !!startedHere);

  const executor = useMemo<ContextFact<SessionExecutor> | undefined>(
    () =>
      pending && {
        status: 'ready',
        value: {
          providerId: pending.providerIcon ?? pending.providerId,
          providerTitle: pending.providerTitle,
          modelTitle: pending.modelTitle,
          effort: pending.effort,
        },
      },
    [pending],
  );

  return {
    startedHere,
    pending,
    providerId: pending?.providerId,
    modelId: pending?.modelId,
    effort: pending?.effort,
    executor,
    // A Session started here is still "New session" until it has a name.
    title: startedHere ? (startedHere.title ?? t('sessionStart.heading')) : undefined,
    subtitle: pending
      ? input.connection === 'connected' || input.connection === 'loading'
        ? t('managedSession.ready')
        : t(`managedSession.${input.connection}`)
      : undefined,
  };
}
