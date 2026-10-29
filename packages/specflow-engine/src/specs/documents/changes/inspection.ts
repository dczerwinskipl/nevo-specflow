import {
  decideReplay,
  type DocumentPathState,
} from '../../../version-control/commits/document-change';
import type { BatchPathExpectation } from './journal/batch';
import type { FileState } from './plan/model';

export type { DocumentPathState };

/**
 * What a worker observed of one batch path: the working tree's bytes (hash and size, `null` when the
 * file is absent) and whether `HEAD` already holds the recorded post state (an absent path for a
 * delete, the post content otherwise). The commit port reads the facts; this module only judges
 * them, so the judgement is testable without Git.
 */
export interface BatchPathObservation {
  readonly path: string;
  readonly working: FileState;
  readonly headHoldsPost: boolean;
}

export interface BatchPathInspection {
  readonly path: string;
  readonly state: DocumentPathState;
}

function sameState(left: FileState, right: FileState): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

/**
 * The per-path inspection of a batch against its recorded expectations. `committed`: `HEAD` holds the post state.
 * `at-post`: the working tree holds it and `HEAD` does not yet. `at-pre`: the working tree is still
 * as before the batch. `foreign`: anything else; such a path is never committed silently.
 */
export function classifyBatchPath(
  observation: BatchPathObservation,
  expectation: BatchPathExpectation,
): DocumentPathState {
  if (observation.headHoldsPost) {
    return 'committed';
  }

  if (sameState(observation.working, expectation.post)) {
    return 'at-post';
  }

  if (sameState(observation.working, expectation.pre)) {
    return 'at-pre';
  }

  return 'foreign';
}

/**
 * Inspects every expectation against the observation of the same path. A missing observation is a
 * programming error of the caller and throws.
 */
export function inspectBatchPaths(
  observations: readonly BatchPathObservation[],
  expectations: readonly BatchPathExpectation[],
): BatchPathInspection[] {
  const byPath = new Map(observations.map((entry) => [entry.path, entry]));

  return expectations.map((expectation) => {
    const observation = byPath.get(expectation.path);
    if (observation === undefined) {
      throw new Error('A batch path was not observed.');
    }

    return { path: expectation.path, state: classifyBatchPath(observation, expectation) };
  });
}

/**
 * What the states of a whole batch mean for a replay: `done` (every path committed), `pending`
 * (nothing committed and every path at its pre or post state: the commit is still to be made) or
 * `recovery-required` (foreign content, or only some of the paths committed).
 */
export function decideBatchReplay(
  inspections: readonly BatchPathInspection[],
): ReturnType<typeof decideReplay> {
  return decideReplay(inspections.map((entry) => entry.state));
}
