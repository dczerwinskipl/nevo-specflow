import type { StartCatalogue, StartMode } from '../catalogue/startCatalogue';
import { chosenAgent, providerDefaultEffort, type AgentChoice } from '../choice/agentChoice';
import { chosenSessionName, type SessionNameChoice } from '../choice/sessionName';
import type {
  ContextFact,
  ContextSpecification,
  SessionContextViewModel,
} from '../../managed/context/sessionContextTypes';

/**
 * What a Session was started with, handed to the Session screen that opens it
 * (new-session-ui-spec.md, section 3(c)): the Session's first snapshot has not loaded yet, but the
 * start values are known, so the screen shows the ready empty state, the Context and the Composer's
 * pickers at once instead of a loading line. Only the start values; once the snapshot arrives the
 * Session screen reads the Session itself.
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
  /** The Specification the Session was pinned to, when it was. */
  specification?: ContextFact<ContextSpecification>;
}

export interface StartedSessionInput {
  catalogue: StartCatalogue;
  choice: AgentChoice;
  name: SessionNameChoice;
  specification?: ContextFact<ContextSpecification>;
  /** Translates a mode's title (a catalogue title or a message of the engine's safety modes). */
  modeTitle: (title: StartMode['title']) => string;
}

export function startedSessionFrom(input: StartedSessionInput): StartedSession | undefined {
  const { provider, model, mode } = chosenAgent(input.catalogue, input.choice);
  if (!provider) {
    return undefined;
  }

  const title = chosenSessionName(input.name);

  return {
    providerId: provider.id,
    providerIcon: provider.icon,
    providerTitle: provider.title,
    ...(model ? { modelId: model.id, modelTitle: model.title } : {}),
    ...(model && input.choice.effort !== providerDefaultEffort
      ? { effort: input.choice.effort }
      : {}),
    ...(mode ? { modeId: mode.id, modeTitle: input.modeTitle(mode.title) } : {}),
    ...(title ? { title } : {}),
    ...(input.specification ? { specification: input.specification } : {}),
  };
}

/**
 * The Context of a Session started here: its Specification when it was pinned to one, else no
 * association at all (a standalone Session), instead of the "scope unknown" note a Session opened
 * from elsewhere carries.
 */
export function startedSessionContext(started: StartedSession): SessionContextViewModel {
  return started.specification
    ? { scope: { kind: 'specification' }, specification: started.specification }
    : { scope: { kind: 'standalone' } };
}

/** The most Sessions remembered at once: a start is opened at once, so a few suffice. */
const capacity = 16;
const startedSessions = new Map<string, StartedSession>();
/** Sessions whose Composer still has to take focus once they open (one time each). */
const awaitingFocus = new Set<string>();

/** Remembers what a Session was started with, for the screen that opens it (this page load only). */
export function rememberStartedSession(sessionId: string, started: StartedSession): void {
  startedSessions.delete(sessionId);
  startedSessions.set(sessionId, started);
  awaitingFocus.add(sessionId);
  for (const oldest of startedSessions.keys()) {
    if (startedSessions.size <= capacity) {
      break;
    }

    startedSessions.delete(oldest);
    awaitingFocus.delete(oldest);
  }
}

export function startedSessionOf(sessionId: string): StartedSession | undefined {
  return startedSessions.get(sessionId);
}

/** True once for a Session just started here: the Composer then takes focus (the user writes next). */
export function consumeStartFocus(sessionId: string): boolean {
  return awaitingFocus.delete(sessionId);
}

/** Forgets every remembered start (tests and stories). */
export function forgetStartedSessions(): void {
  startedSessions.clear();
  awaitingFocus.clear();
}
