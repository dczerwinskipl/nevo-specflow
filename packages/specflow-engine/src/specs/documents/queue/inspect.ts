import { join } from 'node:path';

import { hashWorkingFile } from '../../document-rules/working-file';
import type { DocumentPathFacts } from '../../../version-control/commits/document-change';
import {
  inspectBatchPaths,
  type BatchPathInspection,
  type BatchPathObservation,
} from '../changes/inspection';
import type { BatchPathExpectation } from '../changes/journal';
import type { FileState } from '../changes/plan/model';
import { RAW_CONTENT_MAX_BYTES } from '../limits';

/** A path that holds something other than a readable file: equal to no recorded state. */
const UNREADABLE: FileState = { sha256: '0'.repeat(64), bytes: -1 };

/**
 * The hash and size of the file at `path` below `root`; `null` when it does not exist. A symbolic
 * link, a directory, a special file and a file over the raw content limit are unreadable: equal to
 * no recorded state, so the queue never treats a swapped-in link as the planned content.
 */
export async function readWorkingState(root: string, path: string): Promise<FileState> {
  const found = await hashWorkingFile(join(root, path), RAW_CONTENT_MAX_BYTES);
  if (found.kind === 'absent') {
    return null;
  }

  if (found.kind !== 'file') {
    return UNREADABLE;
  }

  return { sha256: found.sha256, bytes: found.bytes };
}

function sameState(left: FileState, right: FileState): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

/**
 * What the worker saw of each batch path: the working file's hash and size, and whether the commit
 * the facts were read at holds the recorded post state. A deleted path holds it when the commit does
 * not list the path; a written one when the commit's blob is exactly the working file (the port's
 * attribute-aware blob ids) and the working file is the post state.
 */
export async function observeBatchPaths(
  root: string,
  expectations: readonly BatchPathExpectation[],
  facts: readonly DocumentPathFacts[],
): Promise<BatchPathObservation[]> {
  const byPath = new Map(facts.map((fact) => [fact.path, fact]));
  const observations: BatchPathObservation[] = [];
  for (const expectation of expectations) {
    const fact = byPath.get(expectation.path);
    if (fact === undefined) {
      throw new Error('A batch path has no Git facts.');
    }

    const working = await readWorkingState(root, expectation.path);
    const headHoldsPost =
      expectation.post === null
        ? fact.head === null
        : fact.head !== null && fact.head === fact.working && sameState(working, expectation.post);
    observations.push({ path: expectation.path, working, headHoldsPost });
  }

  return observations;
}

export async function inspectBatch(
  root: string,
  expectations: readonly BatchPathExpectation[],
  facts: readonly DocumentPathFacts[],
): Promise<BatchPathInspection[]> {
  return inspectBatchPaths(await observeBatchPaths(root, expectations, facts), expectations);
}
