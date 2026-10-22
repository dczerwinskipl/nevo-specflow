import { describe, expect, it } from 'vitest';

import {
  decodeOperationList,
  isDismissible,
  isRunningOperation,
  needsAttention,
} from './operationList';

const id = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';

describe('decodeOperationList', () => {
  it('reads rows and keeps unknown statuses and kinds (forward compatibility)', () => {
    const list = decodeOperationList({
      items: [
        {
          operationId: id,
          kind: 'future-kind',
          status: 'queued',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      counts: { inProgress: 0, recoveryRequired: 0, failed: 0, completed: 0 },
      truncated: true,
      generatedAt: '2026-01-01T00:00:00Z',
    });
    expect(list?.items).toEqual([
      { operationId: id, kind: 'future-kind', status: 'queued', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(list?.truncated).toBe(true);
  });

  it('drops a row it cannot identify and keeps the rest', () => {
    const list = decodeOperationList({
      items: [
        { kind: 'specification-create', status: 'completed' },
        null,
        'x',
        {
          operationId: id,
          kind: 'specification-create',
          status: 'completed',
          updatedAt: 'now',
        },
      ],
    });
    expect(list?.items.map((item) => item.operationId)).toEqual([id]);
    expect(list?.counts).toEqual({ inProgress: 0, recoveryRequired: 0, failed: 0, completed: 0 });
  });

  it('keeps steps with a known shape only and ignores fields it does not know', () => {
    const list = decodeOperationList({
      items: [
        {
          operationId: id,
          kind: 'specification-create',
          status: 'in-progress',
          updatedAt: 'now',
          steps: [{ id: 'reserving', status: 'done' }, { id: 5 }, null],
          path: 'C:/secret',
        },
      ],
    });
    expect(list?.items[0]?.steps).toEqual([{ id: 'reserving', status: 'done' }]);
    expect(list?.items[0]).not.toHaveProperty('path');
  });

  it('is undefined for an answer that is not a list', () => {
    expect(decodeOperationList('<html>')).toBeUndefined();
    expect(decodeOperationList({ items: 'no' })).toBeUndefined();
    expect(decodeOperationList(null)).toBeUndefined();
  });
});

describe('row predicates', () => {
  it('lets only finished rows be hidden and only running rows speed up polling', () => {
    expect(isDismissible({ status: 'completed' })).toBe(true);
    expect(isDismissible({ status: 'failed' })).toBe(true);
    expect(isDismissible({ status: 'recovery-required' })).toBe(false);
    expect(isDismissible({ status: 'in-progress' })).toBe(false);
    expect(isDismissible({ status: 'something-new' })).toBe(false);
    expect(isRunningOperation({ status: 'in-progress' })).toBe(true);
    expect(isRunningOperation({ status: 'queued' })).toBe(false);
    expect(needsAttention({ status: 'recovery-required' })).toBe(true);
  });
});
