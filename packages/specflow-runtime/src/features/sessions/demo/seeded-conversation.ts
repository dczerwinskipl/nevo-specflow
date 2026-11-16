import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import type { DemoSpecification } from '../../demo-catalogue';
import { DEMO_SEEDED_AT } from './seeded-at';

type Conversation = Pick<SessionSnapshot, 'entries' | 'activeTurn' | 'interaction'>;

/**
 * The conversation a seeded demo Session shows, so its page backs what its list row says: every
 * seeded Session has the request it was started with, a Session that is working has that Turn
 * running, and a Session that asks for input has that Turn waiting on the question its signal
 * names. A Session allocated in the demo environment has no seeded conversation.
 */
export function seededDemoConversation(
  record: DemoSpecification,
  sessionId: string,
): Conversation | undefined {
  const execution = record.currentExecutions?.find((item) => item.sessionId === sessionId);
  const question = record.signals?.find(
    (signal) =>
      signal.kind === 'attention' &&
      signal.target.kind === 'session' &&
      signal.target.sessionId === sessionId,
  );
  if (!execution && !question) {
    return undefined;
  }

  const turnId = derivedId(sessionId, '00000001');
  const request = execution
    ? `Implement ${execution.taskIds.join(', ')} of “${record.title}”.`
    : `Continue the work on “${record.title}”.`;
  const conversation: Conversation = {
    entries: [
      {
        id: derivedId(sessionId, '00000002'),
        ordinal: 0,
        revision: 0,
        turnId,
        kind: 'request',
        text: { text: request, complete: true },
        createdAt: DEMO_SEEDED_AT,
      },
    ],
  };
  if (question) {
    return {
      ...conversation,
      activeTurn: { turnId, state: 'waitingForUser', revision: 0, startedAt: DEMO_SEEDED_AT },
      interaction: {
        interactionId: derivedId(sessionId, '00000003'),
        turnId,
        workId: derivedId(sessionId, '00000004'),
        revision: 0,
        kind: 'question',
        prompt: question.reason ?? question.label,
        options: [
          { id: 'resume', label: 'Resume the queued work' },
          { id: 'replan', label: 'Discard it and plan again' },
        ],
        allowText: false,
      },
    };
  }

  return {
    ...conversation,
    activeTurn: { turnId, state: 'active', revision: 0, startedAt: DEMO_SEEDED_AT },
  };
}

/** A stable id of the Session's seeded conversation: the Session's UUID under another prefix. */
function derivedId(sessionId: string, prefix: string): string {
  return prefix + sessionId.slice(8);
}
