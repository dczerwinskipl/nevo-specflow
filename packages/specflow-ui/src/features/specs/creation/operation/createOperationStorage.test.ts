import { describe, expect, it } from 'vitest';
import {
  createSessionOperationStorage,
  type StoredCreateOperation,
} from './createOperationStorage';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';
import { archetypeSelectionFixture } from '../workspace/model/createRequest.test-support';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const id = '11111111-1111-4111-8111-111111111111';
const operation: StoredCreateOperation = {
  request: {
    title: 'Title',
    operationId: '11111111-1111-4111-8111-111111111111',
    ...archetypeSelectionFixture,
  },
  startedAt: 1_000,
};

describe('create operation storage', () => {
  it('round-trips the unconfirmed operation per identity', () => {
    const backing = memoryStorage();
    const mine = createSessionOperationStorage('user:a', backing);
    mine.save(operation);
    expect(mine.load(id)).toEqual(operation);
    expect(createSessionOperationStorage('user:b', backing).load(id)).toBeUndefined();
    mine.clear(id);
    expect(mine.load(id)).toBeUndefined();
  });

  it('keeps one entry per operation: saving a second leaves the first resumable', () => {
    const mine = createSessionOperationStorage('user:a', memoryStorage());
    const other: StoredCreateOperation = {
      request: {
        title: 'Other',
        operationId: '22222222-2222-4222-8222-222222222222',
        ...archetypeSelectionFixture,
      },
      startedAt: 2,
    };
    mine.save(operation);
    mine.save(other);
    expect(mine.load(id)).toEqual(operation);
    mine.clear(other.request.operationId);
    expect(mine.load(id)).toEqual(operation);
    expect(mine.load(other.request.operationId)).toBeUndefined();
  });

  it('drops an entry of an unexpected shape instead of resuming it', () => {
    const backing = memoryStorage({
      [`specflow.create.operation.v1:user:a:${id}`]: JSON.stringify({ request: { title: 5 } }),
    });
    const storage = createSessionOperationStorage('user:a', backing);
    expect(storage.load(id)).toBeUndefined();
    expect(backing.values.size).toBe(0);
  });

  it.each([
    [
      'a malformed target',
      {
        title: 'T',
        operationId: operation.request.operationId,
        target: { kind: 'new-worktree', baseRef: 5 },
      },
    ],
    ['an unknown field', { title: 'T', operationId: operation.request.operationId, path: 'C:/x' }],
    ['a missing operation id', { title: 'T' }],
    [
      'an over-long slug',
      { title: 'T', operationId: operation.request.operationId, slug: 'a'.repeat(81) },
    ],
  ])('drops an entry with %s instead of POSTing it again', (_name, request) => {
    const backing = memoryStorage({
      [`specflow.create.operation.v1:user:a:${id}`]: JSON.stringify({ request, startedAt: 1 }),
    });
    const storage = createSessionOperationStorage('user:a', backing);
    expect(storage.load(id)).toBeUndefined();
    expect(backing.values.size).toBe(0);
  });

  it('keeps the form draft per identity, separate from the operation', () => {
    const backing = memoryStorage();
    const mine = createSessionOperationStorage('user:a', backing);
    mine.save(operation);
    mine.saveDraft({
      operationId: id,
      title: 'Title',
      goal: 'Goal',
      choice: { ...initialWorkspaceChoice, tile: 'new' },
      failure: { kind: 'name-conflict' },
    });
    mine.clear(id);
    expect(mine.loadDraft(id)).toMatchObject({
      title: 'Title',
      goal: 'Goal',
      choice: { tile: 'new' },
      failure: { kind: 'name-conflict' },
    });
    expect(createSessionOperationStorage('user:b', backing).loadDraft(id)).toBeUndefined();
    mine.clearDraft(id);
    expect(mine.loadDraft(id)).toBeUndefined();
  });

  it('completes an older draft choice with the defaults and drops a damaged draft', () => {
    const backing = memoryStorage({
      [`specflow.create.draft.v1:user:a:${id}`]: JSON.stringify({
        operationId: id,
        title: 'T',
        goal: '',
        choice: { tile: 'main' },
      }),
    });
    const storage = createSessionOperationStorage('user:a', backing);
    expect(storage.loadDraft(id)?.choice).toEqual({ ...initialWorkspaceChoice, tile: 'main' });
    backing.values.set(
      `specflow.create.draft.v1:user:a:${id}`,
      JSON.stringify({ operationId: id, title: 5 }),
    );
    expect(storage.loadDraft(id)).toBeUndefined();
    expect(backing.values.size).toBe(0);
  });

  it('treats unreadable JSON as absent', () => {
    const backing = memoryStorage({ [`specflow.create.operation.v1:user:a:${id}`]: '{nope' });
    expect(createSessionOperationStorage('user:a', backing).load(id)).toBeUndefined();
  });

  it('never throws when storage is missing or refuses writes', () => {
    const none = createSessionOperationStorage('user:a', undefined);
    none.save(operation);
    none.clear(id);
    expect(none.load(id)).toBeUndefined();
    const full = createSessionOperationStorage('user:a', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => {
      full.save(operation);
      full.clear(id);
    }).not.toThrow();
  });
});
