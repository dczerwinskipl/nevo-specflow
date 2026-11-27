import type { ExecutorIdentity } from '@nevo/specflow-engine';

import type { CreateRequestStore, StoredCreateRequest } from './request-store';

/** Records are kept this long for the inspection, then pruned. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The Runtime stopped before the Create had a result and it was not continued: an executor that
 * cannot be proven gone, or a rerun that did not finish either. Nothing more happens by itself; the
 * owner sees it failed and can try again or go back to the form.
 */
export const CREATE_INTERRUPTED = 'CREATE_INTERRUPTED';
/** The principal who asked may no longer create (or start the agent): the Create is not rerun as them. */
export const CREATE_RESUME_FORBIDDEN = 'CREATE_RESUME_FORBIDDEN';

export interface ResumeAcceptedCreatesInput {
  readonly store: CreateRequestStore;
  /** Epoch ms at which this Runtime started. */
  readonly startedAt: number;
  readonly now: () => Date;
  /** Whether the recorded executor is provably gone (`dead`), runs, or cannot be judged. */
  readonly executorState: (
    executor: ExecutorIdentity,
  ) => Promise<'dead' | 'alive' | 'self' | 'unknown'>;
  /** Whether the Engine holds a journal of the operation (something may have been reserved). */
  readonly journalExists: (operationId: string) => Promise<boolean>;
  /** Whether the principal may still create (and, with a first step, start the agent). */
  readonly authorized: (record: StoredCreateRequest) => boolean;
  /** Runs the Create again exactly as `POST /api/specs` would (it records its own outcome). */
  readonly run: (record: StoredCreateRequest) => Promise<unknown>;
  readonly stopped: () => boolean;
  readonly onFailure: (operationId: string, error: unknown) => void;
}

/**
 * The Runtime startup step of accepted Creates (ADR 0027). A Create an earlier Runtime accepted and
 * did not see through is rerun ONCE, at this start, and only when its executor is provably gone: the
 * Engine replays a completed journal, resumes one whose executor is gone, or reserves one that never
 * was. Everything else is settled with a reason the owner sees instead of being rerun later:
 *
 * - an executor that cannot be judged: `CREATE_INTERRUPTED`;
 * - a principal who may no longer create or start the agent: `CREATE_RESUME_FORBIDDEN`;
 * - a rerun that did not finish either (seen at the next start): `CREATE_INTERRUPTED`.
 *
 * The failure is definite when the Engine holds no journal (nothing was reserved); with a journal the
 * inspection keeps reading the journal's own state. A live executor's Create is left to it; records
 * newer than this Runtime belong to requests in flight.
 */
export async function resumeAcceptedCreates(input: ResumeAcceptedCreatesInput): Promise<void> {
  const settle = async (record: StoredCreateRequest, code: string) => {
    const definite = !(await input.journalExists(record.operationId));
    await input.store.write({ ...record, resumed: true, failure: { code, definite } });
  };

  for (const record of await input.store.list()) {
    if (input.stopped()) {
      return;
    }

    try {
      const createdAt = Date.parse(record.createdAt);
      if (input.now().getTime() - createdAt > RETENTION_MS) {
        await input.store.remove(record.operationId);
        continue;
      }

      if (record.failure?.definite || !(createdAt < input.startedAt)) {
        continue;
      }

      if (record.resumed) {
        if (!record.failure) {
          await settle(record, CREATE_INTERRUPTED);
        }

        continue;
      }

      const state = record.executor ? await input.executorState(record.executor) : 'unknown';
      if (state === 'alive' || state === 'self') {
        continue;
      }

      if (state !== 'dead') {
        await settle(record, CREATE_INTERRUPTED);
        continue;
      }

      if (!input.authorized(record)) {
        await settle(record, CREATE_RESUME_FORBIDDEN);
        continue;
      }

      // Marked before the rerun: if this Runtime dies during it, the next start settles it.
      await input.store.write({ ...record, resumed: true });
      await input.run(record);
    } catch (error) {
      input.onFailure(record.operationId, error);
    }
  }
}
