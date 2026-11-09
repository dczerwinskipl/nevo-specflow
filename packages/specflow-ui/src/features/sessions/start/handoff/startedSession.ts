import type { StartCatalogue, StartMode } from '../catalogue/startCatalogue';

/**
 * What a Session was started with, handed to the Session screen that opens it
 * (full-session.md "Starting a Session"): the Session's first snapshot has not loaded yet, but the
 * start values are known, so the screen shows the ready empty state, the Context and the Composer's
 * pickers at once instead of a loading line. Only the start values; once the snapshot arrives the
 * Session screen reads the Session itself. The Specification is not among them: the start seeds the
 * Session's association read instead, so first paint and a reload show the same Context.
 */
export interface StartedSession {
  providerId: string;
  /** Identity of the provider's mark for `SessionProviderIcon`. */
  providerIcon: string | undefined;
  providerTitle: string;
  modelId?: string;
  modelTitle?: string;
  /** A chosen effort; absent at the provider default. */
  effort?: string;
  modeId?: string;
  /** The mode's title as the user saw it. */
  modeTitle?: string;
  /** The own name; absent when the agent names the Session from the first message. */
  title?: string;
}

/**
 * What a start request carried, as it was actually sent: the Session is opened with this, not with
 * the form's current values (a kept request is resent unchanged, possibly after a reload that reset
 * the form).
 */
export interface SentStart {
  providerId: string;
  modelId?: string;
  /** An explicit effort; absent at the provider default. */
  effort?: string;
  /** The work mode's id in the provider's catalogue. */
  modeId?: string;
  /** The own name; absent when the agent names the Session. */
  title?: string;
}

export interface StartedSessionInput {
  /** The catalogue the titles are read from; without it (or without the provider) ids stand in. */
  catalogue: StartCatalogue | undefined;
  sent: SentStart;
  /** Translates a mode's title (a catalogue title or a message of the engine's safety modes). */
  modeTitle: (title: StartMode['title']) => string;
}

export function startedSessionFrom(input: StartedSessionInput): StartedSession {
  const { sent } = input;
  const provider = input.catalogue?.providers.find((p) => p.id === sent.providerId);
  const model = sent.modelId ? provider?.models.find((m) => m.id === sent.modelId) : undefined;
  const mode = sent.modeId ? provider?.modes.find((m) => m.id === sent.modeId) : undefined;

  return {
    providerId: sent.providerId,
    providerIcon: provider?.icon ?? sent.providerId,
    providerTitle: provider?.title ?? sent.providerId,
    ...(sent.modelId ? { modelId: sent.modelId, modelTitle: model?.title ?? sent.modelId } : {}),
    ...(sent.effort ? { effort: sent.effort } : {}),
    ...(sent.modeId
      ? { modeId: sent.modeId, modeTitle: mode ? input.modeTitle(mode.title) : sent.modeId }
      : {}),
    ...(sent.title ? { title: sent.title } : {}),
  };
}

/** The most Sessions remembered at once: a start is opened at once, so a few suffice. */
const capacity = 16;
const startedSessions = new Map<string, StartedSession>();
/** Sessions whose Composer still has to take focus once they open (one time each). */
const awaitingFocus = new Set<string>();
/** A start belongs to the signed-in user who made it: no other identity ever reads it. */
const keyOf = (owner: string, sessionId: string) => `${owner}\u0000${sessionId}`;

/** Remembers what a Session was started with, for the screen that opens it (this page load only). */
export function rememberStartedSession(
  owner: string,
  sessionId: string,
  started: StartedSession,
): void {
  const key = keyOf(owner, sessionId);
  startedSessions.delete(key);
  startedSessions.set(key, started);
  awaitingFocus.add(key);
  for (const oldest of startedSessions.keys()) {
    if (startedSessions.size <= capacity) {
      break;
    }

    startedSessions.delete(oldest);
    awaitingFocus.delete(oldest);
  }
}

export function startedSessionOf(owner: string, sessionId: string): StartedSession | undefined {
  return startedSessions.get(keyOf(owner, sessionId));
}

/** True once for a Session just started here: the Composer then takes focus (the user writes next). */
export function consumeStartFocus(owner: string, sessionId: string): boolean {
  return awaitingFocus.delete(keyOf(owner, sessionId));
}

/** Forgets every remembered start: on a change of identity, in tests and in stories. */
export function forgetStartedSessions(): void {
  startedSessions.clear();
  awaitingFocus.clear();
}
