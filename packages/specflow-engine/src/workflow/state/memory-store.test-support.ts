import { isDeepStrictEqual } from 'node:util';

import { createMemoryWorkflowStore } from './memory-store';
import type { ExecutionChange } from './store';

/**
 * {@link createMemoryWorkflowStore} that also records every non-empty change it applied, in order,
 * so a test can assert what an operation wrote (or that it wrote nothing).
 */
export function createRecordingMemoryWorkflowStore(): ReturnType<
  typeof createMemoryWorkflowStore
> & {
  readonly applied: ExecutionChange[];
} {
  const store = createMemoryWorkflowStore();
  const applied: ExecutionChange[] = [];

  return {
    ...store,
    applied,
    async apply(specId, change) {
      await store.apply(specId, change);
      const { verifySnapshot: _verifySnapshot, ...writes } = change;
      if (!isDeepStrictEqual(writes, {})) {
        applied.push(structuredClone(writes));
      }
    },
  };
}
