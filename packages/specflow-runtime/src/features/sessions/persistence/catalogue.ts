import { Value } from 'typebox/value';
import {
  SessionListFilterSchema,
  SessionListLimits,
  type SessionInfo,
  type SessionListFilter,
  type SessionListItem,
} from '@nevo/specflow-contracts/sessions';
import type { SQLInputValue } from 'node:sqlite';
import type { StoreDatabase } from './database';
import type { createSessionAssociations } from './associations';
import type { StoredSession } from './protocol';
import { decode, fail, type Row } from './encoding';

/** Store-derived identity of a Session: the only source of its authorization scope. */
export interface SessionIdentity {
  projectId: string;
  sessionId: string;
  /** The immutable home Specification; absent for a standalone Session. */
  specId?: string;
}
/** One scanned list index row, read from the projection columns without decoding `data`. */
export interface SessionListRow extends SessionIdentity {
  createdSeq: number;
  /** Present for an associated Session. */
  taskIds?: string[];
  readiness: SessionInfo['readiness'];
  archivedAt?: string;
  updatedAt: string;
}
export interface SessionListScan {
  rows: SessionListRow[];
  /** More index rows exist after the last scanned row. */
  hasMore: boolean;
}
/** A list item's Session facts; the caller adds the (possibly redacted) association. */
export type SessionListSummary = Omit<SessionListItem, 'association'>;

const IDENTITIES_MAX = SessionListLimits.scanBudget;
const SUMMARIES_MAX = SessionListLimits.maxLimit;

interface Dependencies extends StoreDatabase {
  projectId: string;
  associations: ReturnType<typeof createSessionAssociations>;
}

function ids(sessionIds: readonly string[], max: number): void {
  if (
    !Array.isArray(sessionIds) ||
    sessionIds.length > max ||
    new Set(sessionIds).size !== sessionIds.length ||
    sessionIds.some((id) => typeof id !== 'string')
  ) {
    fail('SESSION_INPUT_INVALID', `At most ${max} unique Session IDs are allowed.`);
  }
}

const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(',');

/** Batch identity, bounded keyset list and list summaries over the indexed projection. */
export function createSessionCatalogue({ get, all, projectId, associations }: Dependencies) {
  function identity(row: Row): SessionIdentity {
    return {
      projectId: String(row.project),
      sessionId: String(row.id),
      ...(row.spec !== null && row.spec !== undefined ? { specId: String(row.spec) } : {}),
    };
  }

  return {
    identity(sessionId: string): SessionIdentity {
      const row = get(
        'SELECT s.id,s.project,a.spec FROM sessions s LEFT JOIN session_associations a ON a.session=s.id WHERE s.id=?',
        sessionId,
      );

      return row ? identity(row) : fail('SESSION_NOT_FOUND', 'Session not found.');
    },
    /** One indexed query; unknown Session IDs are omitted. */
    identities(sessionIds: readonly string[]): SessionIdentity[] {
      ids(sessionIds, IDENTITIES_MAX);
      if (!sessionIds.length) {
        return [];
      }

      return all(
        `SELECT s.id,s.project,a.spec FROM sessions s LEFT JOIN session_associations a ON a.session=s.id WHERE s.id IN (${placeholders(sessionIds)})`,
        ...sessionIds,
      ).map(identity);
    },
    /**
     * Scans at most `scanBudget` index rows in `created_seq` descending order after `after`. The
     * caller authorizes each row; a filter only selects.
     */
    list(
      filter: SessionListFilter,
      after: number | undefined,
      scanBudget: number,
    ): SessionListScan {
      if (
        !Value.Check(SessionListFilterSchema, filter) ||
        !Number.isInteger(scanBudget) ||
        scanBudget < 1 ||
        scanBudget > SessionListLimits.scanBudget ||
        (after !== undefined && (!Number.isSafeInteger(after) || after < 1))
      ) {
        fail('SESSION_INPUT_INVALID', 'Invalid Session list request.');
      }

      const where: string[] = ['s.project=?'];
      const args: SQLInputValue[] = [projectId];
      const order = 'specId' in filter ? 'a.created_seq' : 's.created_seq';
      if (after !== undefined) {
        where.push(`${order}<?`);
        args.push(after);
      }

      if (filter.archived === 'exclude') {
        where.push('s.archived_at IS NULL');
      } else if (filter.archived === 'only') {
        where.push('s.archived_at IS NOT NULL');
      }

      let from = 'sessions s LEFT JOIN session_associations a ON a.session=s.id';
      if ('specId' in filter) {
        from = 'session_associations a JOIN sessions s ON s.id=a.session';
        where.push('a.spec=?');
        args.push(filter.specId);
        if (filter.taskId !== undefined) {
          where.push(
            'EXISTS(SELECT 1 FROM session_association_tasks t WHERE t.session=a.session AND t.task=?)',
          );
          args.push(filter.taskId);
        }
      } else if ('standalone' in filter) {
        where.push('a.session IS NULL');
      }

      const scanned = all(
        `SELECT s.id,s.project,a.spec,${order} AS created_seq,s.readiness,s.archived_at,s.updated_at FROM ${from} WHERE ${where.join(' AND ')} ORDER BY ${order} DESC LIMIT ?`,
        ...args,
        scanBudget + 1,
      );
      const page = scanned.slice(0, scanBudget);
      const tasks = associations.tasksOf(
        page.filter((row) => row.spec !== null).map((row) => String(row.id)),
      );

      return {
        rows: page.map((row) => ({
          ...identity(row),
          createdSeq: Number(row.created_seq),
          ...(row.spec !== null ? { taskIds: tasks.get(String(row.id)) ?? [] } : {}),
          readiness: row.readiness as SessionInfo['readiness'],
          ...(row.archived_at !== null ? { archivedAt: String(row.archived_at) } : {}),
          updatedAt: String(row.updated_at),
        })),
        hasMore: scanned.length > scanBudget,
      };
    },
    /** Decodes only the Sessions a page returns; unknown Session IDs are omitted. */
    summaries(sessionIds: readonly string[]): SessionListSummary[] {
      ids(sessionIds, SUMMARIES_MAX);
      if (!sessionIds.length) {
        return [];
      }

      const order = new Map(sessionIds.map((id, index) => [id, index]));

      return all(
        `SELECT id,data FROM sessions WHERE id IN (${placeholders(sessionIds)})`,
        ...sessionIds,
      )
        .sort((a, b) => order.get(String(a.id))! - order.get(String(b.id))!)
        .map((row) => {
          const { session, activeTurn } = decode<StoredSession>(row).snapshot;

          return {
            sessionId: session.sessionId,
            ...(session.title ? { title: session.title } : {}),
            providerId: session.providerId,
            ...(session.modelId ? { modelId: session.modelId } : {}),
            readiness: session.readiness,
            ...(activeTurn
              ? { activeTurn: { turnId: activeTurn.turnId, state: activeTurn.state } }
              : {}),
            ...(session.archivedAt ? { archivedAt: session.archivedAt } : {}),
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          };
        });
    },
  };
}
