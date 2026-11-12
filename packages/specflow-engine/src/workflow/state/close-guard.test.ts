import { describe, expect, it } from 'vitest';

import { guardCloseReservations } from './close-guard';
import { createMemoryWorkflowStore } from './memory-store.test-support';
import type { WorkflowStore } from './store';

describe('guardCloseReservations', () => {
  it('refuses every change of a Specification with an unsettled Close, and only of it', async () => {
    const memory = createMemoryWorkflowStore();
    const applied: string[] = [];
    const inner: WorkflowStore = {
      ...memory,
      apply: (specId, change) => {
        applied.push(specId);

        return memory.apply(specId, change);
      },
    };
    const closing = new Set(['closing']);
    const store = guardCloseReservations(inner, (specId) => Promise.resolve(closing.has(specId)));

    await expect(store.apply('closing', {})).rejects.toMatchObject({
      code: 'WORKFLOW_SPECIFICATION_BUSY',
    });
    expect(applied).toEqual([]);
    await store.apply('other', {});
    closing.clear();
    await store.apply('closing', {});
    expect(applied).toEqual(['other', 'closing']);
  });
});
