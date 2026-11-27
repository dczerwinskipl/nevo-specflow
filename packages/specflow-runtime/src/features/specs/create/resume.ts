import type { CreateRequestStore, StoredCreateRequest } from './request-store';

/** Records of Creates that ended with a refusal are kept this long for the inspection, then pruned. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The Runtime startup step of accepted Creates: every Create a previous Runtime accepted and did not
 * see through (it died before the Engine journal existed, during a stage, or before the first-step
 * start) is run again with its operation id and request, as the principal who asked. The Engine
 * replays a completed journal, resumes one whose executor is provably gone (ADR 0027) and reserves
 * one that never was reserved (nothing was written before), so the operation is resumed or settled
 * with a readable outcome, never lost and never doubled. Records newer than this Runtime belong to
 * requests in flight; refused ones are only kept for the inspection, then pruned.
 */
export async function resumeAcceptedCreates(input: {
  readonly store: CreateRequestStore;
  /** Epoch ms at which this Runtime started. */
  readonly startedAt: number;
  readonly now: () => Date;
  /** Runs the Create again exactly as `POST /api/specs` would (it records its own outcome). */
  readonly run: (record: StoredCreateRequest) => Promise<unknown>;
  readonly stopped: () => boolean;
  readonly onFailure: (operationId: string, error: unknown) => void;
}): Promise<void> {
  for (const record of await input.store.list()) {
    if (input.stopped()) {
      return;
    }

    try {
      const createdAt = Date.parse(record.createdAt);
      const expired = input.now().getTime() - createdAt > RETENTION_MS;
      if (record.failure?.definite || expired) {
        if (expired) {
          await input.store.remove(record.operationId);
        }

        continue;
      }

      if (!(createdAt < input.startedAt)) {
        continue;
      }

      await input.run(record);
    } catch (error) {
      input.onFailure(record.operationId, error);
    }
  }
}
