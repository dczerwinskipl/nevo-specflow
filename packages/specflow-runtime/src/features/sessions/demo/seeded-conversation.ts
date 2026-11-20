import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import type { DemoSpecification } from '../../demo-catalogue';
import { buildDemoSessions } from './contribution';
import { DEMO_SEEDED_AT } from './seeded-at';

type Conversation = Pick<SessionSnapshot, 'entries' | 'activeTurn' | 'interaction'>;

/** The choices of a seeded question that asks for input (`attentionReason: 'input'`). */
const INPUT_OPTIONS = [
  { id: 'resume', label: 'Resume the queued work' },
  { id: 'replan', label: 'Discard it and plan again' },
];

/**
 * The conversation a seeded demo Session shows, derived from the same summary its list row is
 * built from (`buildDemoSessions`), so the page backs what the row says:
 * - every seeded Session has the request it was started with;
 * - `active` (it executes Tasks): that Turn runs;
 * - `attention`: that Turn waits on the question its signal names; the choices are offered only when
 *   the signal asks for input, otherwise the answer is free text;
 * - `quiet` and `unknown`: the request only, nothing runs.
 * A Session allocated in the demo environment has no seeded conversation.
 */
export function seededDemoConversation(
  record: DemoSpecification,
  sessionId: string,
): Conversation | undefined {
  const session = buildDemoSessions(record).find((item) => item.id === sessionId);
  if (!session) {
    return undefined;
  }

  const turnId = derivedId(sessionId, '00000001');
  const request =
    session.taskIds.length > 0
      ? `Implement ${session.taskIds.join(', ')} of “${record.title}”.`
      : `Continue the work on “${record.title}”.`;
  const entries: Conversation['entries'] = [
    {
      id: derivedId(sessionId, '00000002'),
      ordinal: 0,
      revision: 0,
      turnId,
      kind: 'request',
      text: { text: request, complete: true },
      createdAt: DEMO_SEEDED_AT,
    },
  ];

  switch (session.status) {
    case 'active':
      return {
        entries,
        activeTurn: { turnId, state: 'active', revision: 0, startedAt: DEMO_SEEDED_AT },
      };
    case 'attention': {
      const signal = record.signals?.find(
        (item) =>
          item.kind === 'attention' &&
          item.target.kind === 'session' &&
          item.target.sessionId === sessionId,
      );
      const input = signal?.attentionReason === 'input';

      return {
        entries,
        activeTurn: { turnId, state: 'waitingForUser', revision: 0, startedAt: DEMO_SEEDED_AT },
        interaction: {
          interactionId: derivedId(sessionId, '00000003'),
          turnId,
          workId: derivedId(sessionId, '00000004'),
          revision: 0,
          kind: 'question',
          prompt: signal?.reason ?? signal?.label ?? session.title,
          ...(input ? { options: INPUT_OPTIONS } : {}),
          allowText: !input,
        },
      };
    }

    default:
      return { entries };
  }
}

/** A stable id of the Session's seeded conversation: the Session's UUID under another prefix. */
function derivedId(sessionId: string, prefix: string): string {
  return prefix + sessionId.slice(8);
}
