import { Value } from 'typebox/value';
import {
  SessionAssociationOriginSchema,
  SessionAssociationRefSchema,
  type SessionAssociationOrigin,
} from '@nevo/specflow-contracts/sessions';
import type { StoreDatabase } from './database';
import { StoreFault, fail } from './encoding';

/**
 * The association sidecar of the Session store: which Specification (and which of its Tasks) a
 * Session belongs to. It lives outside the core Session aggregates; the core create transaction
 * writes it verbatim and never reads it back for lifecycle decisions. The home Specification is
 * immutable (no operation updates `spec`) and Tasks are append-only.
 */
export interface AssociationWrite {
  specId: string;
  taskIds: string[];
  origin: SessionAssociationOrigin;
}
export interface StoredAssociation {
  specId: string;
  taskIds: string[];
  origin: SessionAssociationOrigin;
  createdAt: string;
}

/** Hashed by the project-scoped create idempotency record: `{ input, association }`. */
export function createFingerprint(input: unknown, association: AssociationWrite | undefined) {
  // A standalone create keeps its original fingerprint; any association makes it differ.
  return association ? { input, association } : input;
}

function valid(association: AssociationWrite): void {
  if (
    !Value.Check(SessionAssociationRefSchema, {
      specId: association.specId,
      taskIds: association.taskIds,
    }) ||
    !Value.Check(SessionAssociationOriginSchema, association.origin)
  ) {
    fail('SESSION_INPUT_INVALID', 'Invalid Session association.');
  }
}

export function createSessionAssociations({ get, all, run }: StoreDatabase) {
  function insertTasks(
    sessionId: string,
    taskIds: readonly string[],
    origin: SessionAssociationOrigin,
    at: number,
  ): void {
    for (const taskId of taskIds) {
      run(
        'INSERT OR IGNORE INTO session_association_tasks VALUES(?,?,?,?)',
        sessionId,
        taskId,
        origin,
        at,
      );
    }
  }

  function tasksOf(sessionIds: readonly string[]): Map<string, string[]> {
    const tasks = new Map<string, string[]>();
    if (!sessionIds.length) {
      return tasks;
    }

    for (const row of all(
      `SELECT session,task FROM session_association_tasks WHERE session IN (${sessionIds.map(() => '?').join(',')}) ORDER BY session,added,task`,
      ...sessionIds,
    )) {
      const owned = tasks.get(String(row.session)) ?? [];
      owned.push(String(row.task));
      tasks.set(String(row.session), owned);
    }

    return tasks;
  }

  function read(sessionId: string): StoredAssociation | null {
    const row = get(
      'SELECT spec,origin,created FROM session_associations WHERE session=?',
      sessionId,
    );
    if (!row) {
      return null;
    }

    return {
      specId: String(row.spec),
      taskIds: tasksOf([sessionId]).get(sessionId) ?? [],
      origin: row.origin as SessionAssociationOrigin,
      createdAt: new Date(Number(row.created)).toISOString(),
    };
  }

  return {
    /** Runs inside the create transaction, after the Session row exists. */
    write(
      sessionId: string,
      createdSeq: number,
      actor: string,
      association: AssociationWrite,
      at: number,
    ): void {
      valid(association);
      run(
        'INSERT INTO session_associations VALUES(?,?,?,?,?,?)',
        sessionId,
        association.specId,
        createdSeq,
        association.origin,
        actor,
        at,
      );
      insertTasks(sessionId, association.taskIds, association.origin, at);
    },
    read,
    /** Appends Tasks of the home Specification; refused for another home or a standalone Session. */
    associateTasks(
      sessionId: string,
      specId: string,
      taskIds: readonly string[],
      origin: SessionAssociationOrigin,
      at: number,
    ): StoredAssociation {
      valid({ specId, taskIds: [...taskIds], origin });
      const home = get('SELECT spec FROM session_associations WHERE session=?', sessionId);
      if (!home) {
        throw new StoreFault('SESSION_INPUT_INVALID', 'A standalone Session has no Tasks.', {
          reason: 'standalone',
        });
      }

      if (home.spec !== specId) {
        throw new StoreFault(
          'SESSION_INPUT_INVALID',
          'Tasks belong to the Session home Specification only.',
          { reason: 'foreign-specification' },
        );
      }

      insertTasks(sessionId, taskIds, origin, at);

      return read(sessionId)!;
    },
    tasksOf,
  };
}
