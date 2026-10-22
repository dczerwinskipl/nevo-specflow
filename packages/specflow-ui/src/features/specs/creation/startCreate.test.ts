import { describe, expect, it } from 'vitest';
import { createSessionOperationStorage } from './createOperationStorage';
import { startCreate } from './startCreate';
import { initialWorkspaceChoice } from './workspace/workspaceChoice';

function setup() {
  const values = new Map<string, string>();
  const storage = createSessionOperationStorage('u', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
  const attempt = { current: null };
  const draft = { title: '  Payment limits ', goal: ' ', choice: initialWorkspaceChoice };
  return { storage, attempt, draft };
}

describe('startCreate', () => {
  it('stores the trimmed request and the untouched draft, and sends nothing', () => {
    const { storage, attempt, draft } = setup();
    const request = startCreate({
      attempt,
      storage,
      draft,
      buildTarget: () => ({ kind: 'new-worktree' }),
      now: () => 42,
    });
    expect(request).toMatchObject({ title: 'Payment limits', target: { kind: 'new-worktree' } });
    expect(request).not.toHaveProperty('goal');
    expect(request?.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.load()).toEqual({ request, startedAt: 42 });
    expect(storage.loadDraft()).toMatchObject({ title: '  Payment limits ' });
  });

  it('keeps the operation id of an identical second submit and changes it for an edited one', () => {
    const { storage, attempt, draft } = setup();
    const build = () => undefined;
    const first = startCreate({ attempt, storage, draft, buildTarget: build });
    const again = startCreate({ attempt, storage, draft, buildTarget: build });
    const edited = startCreate({
      attempt,
      storage,
      draft: { ...draft, title: 'Other' },
      buildTarget: build,
    });
    expect(again?.operationId).toBe(first?.operationId);
    expect(edited?.operationId).not.toBe(first?.operationId);
  });

  it('stores nothing when the request cannot be prepared', () => {
    const { storage, attempt, draft } = setup();
    const request = startCreate({
      attempt,
      storage,
      draft,
      buildTarget: () => {
        throw new TypeError('broken');
      },
    });
    expect(request).toBeUndefined();
    expect(storage.load()).toBeUndefined();
    expect(storage.loadDraft()).toBeUndefined();
  });
});
