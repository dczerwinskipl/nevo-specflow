import type { SessionInfo } from '@nevo/specflow-contracts/sessions';
import type { RequestAuthorization } from '../../auth';
import {
  SessionError,
  listedSession,
  type SessionListScan,
  type StoredListSummary,
  type SessionsRuntime,
} from '../../sessions';
import type { ProjectIdSource } from '../../specs';
import { canStartSession } from '../start-authorization';

/** At most this many associated Sessions; `hasMore` reports the rest (D12). */
export const WORKSPACE_SESSION_LIMIT = 100;

type Status = 'active' | 'attention' | 'quiet' | 'authenticationRequired' | 'unknown';
interface WorkspaceSessionItem {
  id: string;
  title?: string;
  taskIds: string[];
  status: Status;
  providerId: string;
  providerTitle?: string;
  modelId?: string;
  modelTitle?: string;
  updatedAt: string;
}
export type StartSessionReason = 'sessions_disabled' | 'forbidden' | 'no_provider';

/** Effective Session readiness only; an Engine attempt never colours a Session row. */
export function workspaceSessionStatus(readiness: SessionInfo['readiness']): Status {
  switch (readiness) {
    case 'busy':
      return 'active';
    case 'requiresAttention':
      return 'attention';
    case 'ready':
      return 'quiet';
    case 'authenticationRequired':
      return 'authenticationRequired';
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

    if (!canStartSession(authz, options.projectId(), specId)) {
      return { available: false, reason: 'forbidden' };
    }

    return coordinator.usable() ? { available: true } : { available: false, reason: 'no_provider' };
  }

  return async (specId: string, context: { readonly authz: RequestAuthorization }) => {
    const action = startSession(specId, context.authz);
    const coordinator = options.sessions.coordinator;
    if (!coordinator) {
      // Disabled Sessions have no readable registry. Clients read this together with the
      // `sessions_disabled` reason of `startSession`: Sessions are turned off, not failing.
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
      const scanned = scan.rows.slice(0, WORKSPACE_SESSION_LIMIT);
      const summaries = scanned.length
        ? await coordinator.store.call<StoredListSummary[]>({
            op: 'summaries',
            sessionIds: scanned.map((row) => row.sessionId),
          })
        : [];
      // The list read's projection: catalogue titles and the effective readiness.
      const byId = new Map(
        summaries.map((summary) => [
          summary.sessionId,
          listedSession(summary, coordinator.provider),
        ]),
      );
      // A Session deleted between the scan and the decode is simply absent.
      const rows = scanned.filter((row) => byId.has(row.sessionId));
      const items: WorkspaceSessionItem[] = rows.map((row) => {
        const summary = byId.get(row.sessionId)!;

        return {
          id: row.sessionId,
          ...(summary.title ? { title: summary.title } : {}),
          taskIds: row.taskIds ?? [],
          status: workspaceSessionStatus(summary.readiness),
          providerId: summary.providerId,
          ...(summary.providerTitle ? { providerTitle: summary.providerTitle } : {}),
          ...(summary.modelId ? { modelId: summary.modelId } : {}),
          ...(summary.modelTitle ? { modelTitle: summary.modelTitle } : {}),
          updatedAt: summary.updatedAt,
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
        // Store-derived identities: the workspace read authorizes the rows without resolving them.
        sessionIdentities: rows.map((row) => ({
          projectId: row.projectId,
          sessionId: row.sessionId,
          ...(row.specId !== undefined ? { specId: row.specId } : {}),
        })),
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
