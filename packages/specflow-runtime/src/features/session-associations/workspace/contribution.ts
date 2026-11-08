import { SessionCapabilities, type SessionInfo } from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { RequestAuthorization } from '../../auth';
import {
  SessionError,
  type SessionListScan,
  type SessionListSummary,
  type SessionsRuntime,
} from '../../sessions';
import { specScope, type ProjectIdSource } from '../../specs';

/** At most this many associated Sessions; `hasMore` reports the rest (D12). */
export const WORKSPACE_SESSION_LIMIT = 100;

type Status = 'active' | 'attention' | 'quiet' | 'unknown';
interface WorkspaceSessionItem {
  id: string;
  title?: string;
  taskIds: string[];
  status: Status;
}
export type StartSessionReason = 'sessions_disabled' | 'forbidden' | 'no_provider';

/** Session readiness only; an Engine attempt never colours a Session row. */
export function workspaceSessionStatus(readiness: SessionInfo['readiness']): Status {
  switch (readiness) {
    case 'busy':
      return 'active';
    case 'requiresAttention':
      return 'attention';
    case 'ready':
      return 'quiet';
    default:
      return 'unknown';
  }
}

/** Attention first, then active, then the most recently updated Session. */
export function recommendSessions(
  rows: readonly { id: string; status: Status; updatedAt: string }[],
): string[] {
  const rank = (status: Status) => (status === 'attention' ? 0 : status === 'active' ? 1 : 2);

  return [...rows]
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
    )
    .map((row) => row.id);
}

/**
 * Project mode: the workspace `sessions` section from the association registry (non-archived,
 * newest first, at most 100 rows), the ranked recommendation and the caller's `startSession`
 * action. Reason precedence: `sessions_disabled`, then `forbidden`, then `no_provider`.
 */
export function createWorkspaceSessionContribution(options: {
  sessions: SessionsRuntime;
  projectId: ProjectIdSource;
}) {
  function startSession(
    specId: string,
    authz: RequestAuthorization,
  ): { available: boolean; reason?: StartSessionReason } {
    const coordinator = options.sessions.coordinator;
    if (!coordinator) {
      return { available: false, reason: 'sessions_disabled' };
    }

    if (
      !authz.can({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.StartSession,
        scope: specScope(options.projectId(), specId),
      }) ||
      !authz.can({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.Create,
        scope: { projectId: options.sessions.projectId!, specId },
      })
    ) {
      return { available: false, reason: 'forbidden' };
    }

    return coordinator.usable() ? { available: true } : { available: false, reason: 'no_provider' };
  }

  return async (specId: string, context: { readonly authz: RequestAuthorization }) => {
    const action = startSession(specId, context.authz);
    const coordinator = options.sessions.coordinator;
    if (!coordinator) {
      return {
        section: { state: 'unavailable' as const, reason: 'source_unavailable' as const },
        startSession: action,
      };
    }

    try {
      const scan = await coordinator.store.call<SessionListScan>({
        op: 'list',
        filter: { specId, archived: 'exclude' },
        scanBudget: WORKSPACE_SESSION_LIMIT + 1,
      });
      const rows = scan.rows.slice(0, WORKSPACE_SESSION_LIMIT);
      const summaries = rows.length
        ? await coordinator.store.call<SessionListSummary[]>({
            op: 'summaries',
            sessionIds: rows.map((row) => row.sessionId),
          })
        : [];
      const titles = new Map(summaries.map((summary) => [summary.sessionId, summary.title]));
      const items: WorkspaceSessionItem[] = rows.map((row) => {
        const title = titles.get(row.sessionId);

        return {
          id: row.sessionId,
          ...(title ? { title } : {}),
          taskIds: row.taskIds ?? [],
          status: workspaceSessionStatus(row.readiness),
        };
      });

      return {
        section: {
          state: 'available' as const,
          data: {
            items,
            ...(scan.rows.length > WORKSPACE_SESSION_LIMIT ? { hasMore: true } : {}),
            // Session attention is Session readiness; Engine attention is composed by Specs.
            attention: [],
          },
        },
        recommendedSessionIds: recommendSessions(
          rows.map((row, index) => ({
            id: row.sessionId,
            status: items[index]!.status,
            updatedAt: row.updatedAt,
          })),
        ),
        startSession: action,
      };
    } catch (error) {
      // An unreadable Session store is an unavailable section, not a failed workspace read.
      if (!(error instanceof SessionError)) {
        throw error;
      }

      return {
        section: { state: 'unavailable' as const, reason: 'source_unavailable' as const },
        startSession: action,
      };
    }
  };
}
