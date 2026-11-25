import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import { SpecIdSchema, TaskIdSchema } from '@nevo/specflow-contracts/documents';
import {
  SessionCapabilities,
  SessionListArchivedSchema,
  type AgentStepOrigin,
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
import type { AgentStepOrigins } from './agent-step';
import { capabilityRefusal, sessionRouteErrors } from './route-docs';
import { sessionScope } from '../scope';
import { specScope } from '../../specs';

const closed = { additionalProperties: false } as const;
// Query values arrive as strings (no coercion): `limit` and `standalone` are parsed here.
const querystring = Type.Object(
  {
    specId: Type.Optional(SpecIdSchema),
    taskId: Type.Optional(TaskIdSchema),
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
  agentStepOrigins?: AgentStepOrigins,
): void {
  feature.get(
    '/api/sessions',
    {
      config: { openApiResponses: sessionRouteErrors.list },
      schema: {
        tags: ['Sessions'],
        summary: 'List Sessions',
        description:
          'List Sessions with keyset pagination in immutable creation order, newest first. Filters select but never grant: specId requires spec.view before association disclosure, each row requires session.view at store-derived scope. An unfiltered caller with only Specification-scoped grants must supply specId or standalone. At most 500 index rows scanned per request, default limit 50/max 100; a page can be empty with nextCursor present after authorization filtering. Cursor is HMAC-signed and bound to store generation, project and exact filter. Default archived=exclude.',
        querystring,
        response: { 200: SessionListPageSchema, ...capabilityRefusal },
      },
    },
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
      const associations = new Map(
        visible.map((row) => [row.sessionId, association(request, row, projectId())] as const),
      );
      const origins = await agentStepsOf(agentStepOrigins, [...associations.values()]);
      const items: SessionListItem[] = visible.flatMap((row) => {
        // A Session deleted between the scan and the decode is simply absent.
        const summary = byId.get(row.sessionId);
        const listed = associations.get(row.sessionId)!;
        const agentStep =
          listed.kind === 'specification'
            ? origins.get(listed.specId)?.get(row.sessionId)
            : undefined;

        return summary
          ? [{ ...summary, association: listed, ...(agentStep ? { agentStep } : {}) }]
          : [];
      });

      return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) };
    },
  );
}

/**
 * The agent step origins of the Specifications a page discloses (`specification` associations
 * only), one read per Specification; one that cannot be read leaves its rows without.
 */
async function agentStepsOf(
  origins: AgentStepOrigins | undefined,
  associations: readonly ListAssociation[],
): Promise<ReadonlyMap<string, ReadonlyMap<string, AgentStepOrigin>>> {
  const found = new Map<string, ReadonlyMap<string, AgentStepOrigin>>();
  if (!origins) {
    return found;
  }

  for (const listed of associations) {
    if (listed.kind === 'specification' && !found.has(listed.specId)) {
      found.set(listed.specId, await origins(listed.specId).catch(() => new Map()));
    }
  }

  return found;
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
