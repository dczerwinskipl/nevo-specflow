import { describe, expect, it } from 'vitest';
import { createSessionOperationStorage } from './createOperationStorage';
import { startCreate } from './startCreate';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';
import { archetypeSelectionFixture } from '../workspace/model/createRequest.test-support';

const selection = archetypeSelectionFixture;

function setup() {
  const values = new Map<string, string>();
  const storage = createSessionOperationStorage('u', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
  const attempt = { current: null };
  const draft = { title: '  Payment limits ', goal: ' ', choice: initialWorkspaceChoice };

  return { storage, attempt, draft, values };
}

describe('startCreate', () => {
  it('stores the trimmed request and the untouched draft, and sends nothing', () => {
    const { storage, attempt, draft } = setup();
    const request = startCreate({
      attempt,
      storage,
      draft,
      buildTarget: () => ({ kind: 'new-worktree' }),
      selection: archetypeSelectionFixture,
      now: () => 42,
    });
    expect(request).toMatchObject({
      title: 'Payment limits',
      target: { kind: 'new-worktree' },
      ...archetypeSelectionFixture,
    });
    expect(request).not.toHaveProperty('goal');
    expect(request?.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.load(request?.operationId ?? '')).toEqual({ request, startedAt: 42 });
    expect(storage.loadDraft(request?.operationId ?? '')).toMatchObject({
      title: '  Payment limits ',
      operationId: request?.operationId,
    });
  });

  it('keeps the operation id of an identical second submit and changes it for an edited one', () => {
    const { storage, attempt, draft } = setup();
    const build = () => undefined;
    const first = startCreate({ attempt, storage, draft, buildTarget: build, selection });
    const again = startCreate({ attempt, storage, draft, buildTarget: build, selection });
    const edited = startCreate({
      attempt,
      storage,
      draft: { ...draft, title: 'Other' },
      buildTarget: build,
      selection,
    });
    expect(again?.operationId).toBe(first?.operationId);
    expect(edited?.operationId).not.toBe(first?.operationId);
  });

  it('keeps the first operation resumable when a second one is started', () => {
    const { storage, draft } = setup();
    const first = startCreate({
      attempt: { current: null },
      storage,
      draft,
      buildTarget: () => undefined,
      selection,
    });
    const second = startCreate({
      attempt: { current: null },
      storage,
      draft: { ...draft, title: 'Second' },
      buildTarget: () => undefined,
      selection,
    });
    expect(second?.operationId).not.toBe(first?.operationId);
    expect(storage.load(first?.operationId ?? '')?.request).toEqual(first);
    expect(storage.load(second?.operationId ?? '')?.request).toEqual(second);
    expect(storage.loadDraft(first?.operationId ?? '')?.title).toBe('  Payment limits ');
  });

  it('stores nothing when the request cannot be prepared', () => {
    const { storage, attempt, draft, values } = setup();
    const request = startCreate({
      attempt,
      storage,
      draft,
      selection,
      buildTarget: () => {
        throw new TypeError('broken');
      },
    });
    expect(request).toBeUndefined();
    expect(values.size).toBe(0);
  });
});
