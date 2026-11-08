import { randomBytes, randomUUID } from 'node:crypto';
import type { SessionInfo, SessionListFilter } from '@nevo/specflow-contracts/sessions';
import type { DemoCatalogue } from '../../demo-catalogue';
import type { DemoState } from '../../../demo/state';
import { SessionError } from '../errors';
import type { SessionListSource } from '../http/list';
import { createSessionCursors } from '../persistence/cursors';
import { StoreFault } from '../persistence/encoding';
import type { SessionListRow, SessionListSummary } from '../persistence/protocol';
import { buildDemoSessions, seededDemoAgent, type SessionSummary } from './contribution';
import { DEMO_SEEDED_AT } from './seeded-at';

export { DEMO_SEEDED_AT } from './seeded-at';

const readiness: Record<SessionSummary['status'], SessionInfo['readiness']> = {
  attention: 'requiresAttention',
  active: 'busy',
  quiet: 'ready',
  unknown: 'unavailable',
};

interface DemoListEntry {
  row: SessionListRow;
  summary: SessionListSummary;
}

function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof StoreFault) {
      throw new SessionError(error.code as SessionError['code'], error.message);
    }

    throw error;
  }
}

/**
 * The demo `GET /api/sessions` source: seeded catalogue Sessions (oldest, in catalogue order) and
 * then the Sessions allocated in this environment, newest first, with the same filters and a
 * signed cursor of the same shape. Demo Sessions are never archived and never standalone.
 */
export function createDemoSessionList(options: {
  state: DemoState;
  catalogue: DemoCatalogue;
  /** When each allocated Session was created, by Session ID. */
  allocatedAt: ReadonlyMap<string, string>;
}): SessionListSource {
  const projectId = options.state.catalogue.project.id;
  // Per Runtime process: a demo cursor never outlives the in-memory demo state it pages.
  const cursors = createSessionCursors(randomUUID(), projectId, randomBytes(32));

  async function entries(): Promise<DemoListEntry[]> {
    const agent = seededDemoAgent(options.state.catalogue);
    const seeded = new Map<string, { specId: string; session: SessionSummary }>();
    for (const record of await options.catalogue.all()) {
      for (const session of buildDemoSessions(record)) {
        if (!seeded.has(session.id)) {
          seeded.set(session.id, { specId: record.id, session });
        }
      }
    }

    const ordered = [...seeded.values()];
    const result: DemoListEntry[] = ordered.map(({ specId, session }, index) => ({
      row: {
        projectId,
        sessionId: session.id,
        specId,
        // Catalogue order reads newest first.
        createdSeq: ordered.length - index,
        taskIds: session.taskIds,
        readiness: readiness[session.status],
        updatedAt: DEMO_SEEDED_AT,
      },
      summary: {
        sessionId: session.id,
        title: session.title,
        ...agent,
        readiness: readiness[session.status],
        createdAt: DEMO_SEEDED_AT,
        updatedAt: DEMO_SEEDED_AT,
      },
    }));
    [...options.state.sessions.values()].forEach((detail, index) => {
      const at = options.allocatedAt.get(detail.sessionId) ?? DEMO_SEEDED_AT;
      result.push({
        row: {
          projectId,
          sessionId: detail.sessionId,
          specId: detail.specId,
          createdSeq: ordered.length + index + 1,
          taskIds: [],
          readiness: 'ready',
          updatedAt: at,
        },
        summary: {
          sessionId: detail.sessionId,
          title: detail.title,
          providerId: detail.configuration.providerId,
          providerTitle: detail.configuration.providerTitle,
          modelId: detail.configuration.modelId,
          modelTitle: detail.configuration.modelTitle,
          readiness: 'ready',
          createdAt: at,
          updatedAt: at,
        },
      });
    });

    return result.sort((a, b) => b.row.createdSeq - a.row.createdSeq);
  }

  function selects(filter: SessionListFilter, row: SessionListRow): boolean {
    if (filter.archived === 'only' || 'standalone' in filter) {
      return false;
    }

    return (
      !('specId' in filter) ||
      (row.specId === filter.specId &&
        (filter.taskId === undefined || (row.taskIds ?? []).includes(filter.taskId)))
    );
  }

  return {
    async scan(filter, cursor, scanBudget) {
      const after =
        cursor === undefined ? undefined : guarded(() => cursors.listBoundary(cursor, filter));
      const selected = (await entries())
        .map((entry) => entry.row)
        .filter((row) => selects(filter, row) && (after === undefined || row.createdSeq < after));

      return { rows: selected.slice(0, scanBudget), hasMore: selected.length > scanBudget };
    },
    async summaries(sessionIds) {
      const wanted = new Set(sessionIds);

      return (await entries())
        .filter((entry) => wanted.has(entry.row.sessionId))
        .map((entry) => entry.summary);
    },
    cursor: (filter, after) => Promise.resolve(guarded(() => cursors.listCursor(filter, after))),
  };
}
