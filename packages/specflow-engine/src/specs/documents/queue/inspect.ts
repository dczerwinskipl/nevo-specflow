import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256Hex } from '../../../hash';
import type { DocumentPathFacts } from '../../../version-control/commits/document-change';
import {
  inspectBatchPaths,
  type BatchPathInspection,
  type BatchPathObservation,
} from '../changes/inspection';
import type { BatchPathExpectation } from '../changes/journal';
import type { FileState } from '../changes/plan/model';

/** A path that holds something other than a readable file: equal to no recorded state. */
const UNREADABLE: FileState = { sha256: '0'.repeat(64), bytes: -1 };

/** The hash and size of the file at `path` below `root`; `null` when it does not exist. */
export async function readWorkingState(root: string, path: string): Promise<FileState> {
  try {
    const bytes = await readFile(join(root, path));
    return { sha256: sha256Hex(bytes), bytes: bytes.length };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    return UNREADABLE;
  }
}

function sameState(left: FileState, right: FileState): boolean {
  if (left === null || right === null) return left === right;
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
    if (fact === undefined) throw new Error('A batch path has no Git facts.');
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
