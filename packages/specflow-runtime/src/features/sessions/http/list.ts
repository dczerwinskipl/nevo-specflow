import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import {
  AssociationTargetIdSchema,
  SessionCapabilities,
  SessionListArchivedSchema,
  SessionListLimits,
  SessionListPageSchema,
  type ListAssociation,
  type SessionListArchived,
  type SessionListFilter,
  type SessionListItem,
  type SessionListPage,
} from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionError } from '../errors';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import type {
  SessionListRow,
  SessionListScan,
  SessionListSummary,
  StoredListSummary,
} from '../persistence/protocol';
import { listedSession } from './projection';
import { sessionScope } from '../scope';
import { specScope } from '../../specs';

const closed = { additionalProperties: false } as const;
// Query values arrive as strings (no coercion): `limit` and `standalone` are parsed here.
const querystring = Type.Object(
  {
    specId: Type.Optional(AssociationTargetIdSchema),
    taskId: Type.Optional(AssociationTargetIdSchema),
    standalone: Type.Optional(Type.Literal('true')),
    archived: Type.Optional(SessionListArchivedSchema),
    limit: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,2}$' })),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  },
  closed,
);
interface Query {
  specId?: string;
  taskId?: string;
  standalone?: 'true';
  archived?: SessionListArchived;
  limit?: string;
  cursor?: string;
}

function filterOf(query: Query): SessionListFilter {
  const archived = query.archived ?? 'exclude';
  if (query.taskId !== undefined && query.specId === undefined) {
    throw new SessionError('SESSION_INPUT_INVALID', 'taskId requires specId.', {
      field: 'taskId',
    });
  }

  if (query.specId !== undefined && query.standalone !== undefined) {
    throw new SessionError('SESSION_INPUT_INVALID', 'specId and standalone are exclusive.', {
      field: 'standalone',
    });
  }

  if (query.specId !== undefined) {
    return {
      specId: query.specId,
      ...(query.taskId !== undefined ? { taskId: query.taskId } : {}),
      archived,
    };
  }

  return query.standalone ? { standalone: true, archived } : { archived };
}

function limitOf(value: string | undefined): number {
  const limit = value === undefined ? SessionListLimits.defaultLimit : Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SessionListLimits.maxLimit) {
    throw new SessionError('SESSION_INPUT_INVALID', 'Page limit is out of range.', {
      field: 'limit',
    });
  }

  return limit;
}

/** Where the list reads from: the Session store (project) or the demo catalogue. */
export interface SessionListSource {
  /** At most `scanBudget` rows, newest first, after the row a cursor of the same filter names. */
  scan(
    filter: SessionListFilter,
    cursor: string | undefined,
    scanBudget: number,
  ): Promise<SessionListScan>;
  /**
   * Only the rows a page returns, with catalogue titles and effective readiness; unknown Session
   * IDs are omitted.
   */
  summaries(sessionIds: readonly string[]): Promise<SessionListSummary[]>;
  /** A cursor continuing after `after`, bound to the filter. */
  cursor(filter: SessionListFilter, after: number): Promise<string>;
}

export function storeSessionListSource(coordinator: SessionCoordinator): SessionListSource {
  const store = coordinator.store;

  return {
    scan: (filter, cursor, scanBudget) =>
      store.call<SessionListScan>({
        op: 'list',
        filter,
        ...(cursor !== undefined ? { cursor } : {}),
        scanBudget,
      }),
    summaries: async (sessionIds) =>
      sessionIds.length
        ? (
            await store.call<StoredListSummary[]>({ op: 'summaries', sessionIds: [...sessionIds] })
          ).map((summary) => listedSession(summary, coordinator.provider))
        : [],
    cursor: (filter, after) => store.call<string>({ op: 'list-cursor', filter, after }),
  };
}

/**
 * `GET /api/sessions`: newest first, keyset-paged on the creation order. A filter only selects;
 * every scanned row is authorized at its own store-derived scope and its association is redacted
 * without `spec.view`. One request scans at most 500 index rows, so a page may be short (even
 * empty) while `nextCursor` is present.
 */
export function registerSessionListRoute(
  feature: FastifyInstance,
  source: () => SessionListSource,
  projectId: () => string,
): void {
  feature.get(
    '/api/sessions',
    { schema: { querystring, response: { 200: SessionListPageSchema } } },
    async (request): Promise<SessionListPage> => {
      request.authz.requireAccess();
      const sessions = source();
      request.authz.requireCapabilityInAnyScope({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.View,
      });
      const query = request.query as Query;
      const filter = filterOf(query);
      const limit = limitOf(query.limit);
      if ('specId' in filter) {
        // Selecting by a Specification (or its Task) is a Specification read: without spec.view a
        // page of matching rows would reveal which Sessions belong to it.
        request.authz.require({
          resource: SpecCapabilities,
          capability: SpecCapabilities.capabilities.View,
          scope: specScope(projectId(), filter.specId),
        });
      } else if (
        !('standalone' in filter) &&
        !request.authz.hasCapabilityInAnyScope({
          resource: SessionCapabilities,
          capability: SessionCapabilities.capabilities.View,
          withoutDimension: 'specId',
        })
      ) {
        // Only Specification-scoped grants: an unfiltered scan would be all refusals.
        throw new SessionError(
          'SESSION_LIST_SCOPE_REQUIRED',
          'Select a Specification to list its Sessions.',
          { field: 'specId' },
        );
      }

      const scan = await sessions.scan(filter, query.cursor, SessionListLimits.scanBudget);
      const visible: SessionListRow[] = [];
      let scanned = 0;
      for (const row of scan.rows) {
        scanned += 1;
        if (canView(request, row)) {
          visible.push(row);
          if (visible.length === limit) {
            break;
          }
        }
      }

      const more = scanned < scan.rows.length || scan.hasMore;
      const last = scan.rows[scanned - 1];
      const [summaries, nextCursor] = await Promise.all([
        sessions.summaries(visible.map((row) => row.sessionId)),
        more && last ? sessions.cursor(filter, last.createdSeq) : Promise.resolve(undefined),
      ]);
      const byId = new Map(summaries.map((summary) => [summary.sessionId, summary]));
      const items: SessionListItem[] = visible.flatMap((row) => {
        // A Session deleted between the scan and the decode is simply absent.
        const summary = byId.get(row.sessionId);

        return summary ? [{ ...summary, association: association(request, row, projectId()) }] : [];
      });

      return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) };
    },
  );
}

function canView(request: FastifyRequest, row: SessionListRow): boolean {
  return request.authz.can({
    resource: SessionCapabilities,
    capability: SessionCapabilities.capabilities.View,
    scope: sessionScope(row, SessionCapabilities.capabilities.View),
  });
}

function association(
  request: FastifyRequest,
  row: SessionListRow,
  projectId: string,
): ListAssociation {
  if (row.specId === undefined) {
    return { kind: 'standalone' };
  }

  return request.authz.can({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: specScope(projectId, row.specId),
  })
    ? { kind: 'specification', specId: row.specId, taskIds: row.taskIds ?? [] }
    : { kind: 'restricted' };
}
