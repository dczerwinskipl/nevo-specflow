import { describe, expect, it } from 'vitest';

import { createOperationProgressRegistry, type StoredProgressEvent } from '../../operations';
import { startCreateProgress } from './progress';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const created = {
  operationId,
  specId: operationId,
  kind: 'specification-create' as const,
  status: 'completed' as const,
  slug: 'a-spec',
  workspaceId: operationId,
  relativeManifestPath: 'specs/a-spec/specification.yaml',
};

async function replay(registry: ReturnType<typeof createOperationProgressRegistry>) {
  const events = [];
  for await (const item of registry.watch(operationId, 'specification-create', { waitMs: 0 })) {
    events.push(item.event);
  }

  return events;
}

describe('Create progress adapter (journal stage -> public step)', () => {
  it('maps a new-worktree create onto the four public steps without leaking stages', async () => {
    const registry = createOperationProgressRegistry();
    const progress = startCreateProgress(registry, operationId, 'new-worktree');
    for (const stage of [
      'reserved',
      'git-initiated',
      'git-provisioned',
      'manifest-writing',
      'manifest-written',
      'registry-writing',
      'registry-linked',
      'completed',
    ] as const) {
      progress.onStage({ stage, target: 'new-worktree' });
    }

    progress.complete(created);
    const events = await replay(registry);
    expect(events[0]).toMatchObject({
      type: 'snapshot',
      status: 'completed',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'preparing-workspace', status: 'done' },
        { id: 'writing-specification', status: 'done' },
        { id: 'registering', status: 'done' },
      ],
    });
    expect(events.at(-1)).toMatchObject({ type: 'completed', result: created });
    expect(JSON.stringify(events)).not.toMatch(/git-initiated|manifest|registry-/);
  });

  it('lists no workspace step for an existing target and reports the running step', async () => {
    const registry = createOperationProgressRegistry();
    const progress = startCreateProgress(registry, operationId, 'existing');
    progress.onStage({ stage: 'reserved', target: 'existing' });
    progress.onStage({ stage: 'git-provisioned', target: 'existing' });
    progress.onStage({ stage: 'manifest-writing', target: 'existing' });
    const iterator = registry.watch(operationId, 'specification-create', { waitMs: 0 });
    const first: StoredProgressEvent | undefined = (await iterator.next()).value as
      StoredProgressEvent | undefined;
    await iterator.return(undefined);
    expect(first?.event).toMatchObject({
      type: 'snapshot',
      currentStep: 'writing-specification',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'writing-specification', status: 'running' },
        { id: 'registering', status: 'pending' },
      ],
    });
  });

  it('publishes recovery-required and code-only failures', async () => {
    const registry = createOperationProgressRegistry();
    startCreateProgress(registry, operationId, 'existing').fail('CREATE_RECOVERY_REQUIRED');
    const events = await replay(registry);
    expect(events.at(-1)).toMatchObject({ type: 'recovery-required' });

    const other = createOperationProgressRegistry();
    startCreateProgress(other, operationId, 'existing').fail('BRANCH_ALREADY_EXISTS');
    const failed = await replay(other);
    expect(failed.at(-1)).toMatchObject({ type: 'failed', code: 'BRANCH_ALREADY_EXISTS' });
    expect(JSON.stringify(failed)).not.toContain('secret');

    const unknown = createOperationProgressRegistry();
    startCreateProgress(unknown, operationId, 'existing').fail(undefined);
    expect((await replay(unknown)).at(-1)).toMatchObject({
      type: 'failed',
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('Create progress with the scaffold commit (git enabled)', () => {
  it('adds committing-specification between writing and registering, for both targets', async () => {
    for (const target of ['new-worktree', 'existing'] as const) {
      const registry = createOperationProgressRegistry();
      const progress = startCreateProgress(registry, operationId, target, true);
      for (const stage of [
        'reserved',
        'manifest-written',
        'commit-writing',
        'commit-written',
        'registry-writing',
        'completed',
      ] as const) {
        progress.onStage({ stage, target });
      }

      progress.complete(created);
      const [snapshot] = await replay(registry);
      const ids = (snapshot as unknown as { steps: { id: string; status: string }[] }).steps.map(
        (s) => s.id,
      );
      expect(ids).toEqual([
        'reserving',
        ...(target === 'new-worktree' ? ['preparing-workspace'] : []),
        'writing-specification',
        'committing-specification',
        'registering',
      ]);
    }
  });

  it('reports the running committing step and publishes COMMIT_FAILED as recovery-required', async () => {
    const registry = createOperationProgressRegistry();
    const progress = startCreateProgress(registry, operationId, 'existing', true);
    progress.onStage({ stage: 'commit-writing', target: 'existing' });
    const iterator = registry.watch(operationId, 'specification-create', { waitMs: 0 });
    const first = (await iterator.next()).value as StoredProgressEvent | undefined;
    await iterator.return(undefined);
    expect(first?.event).toMatchObject({ currentStep: 'committing-specification' });
    progress.fail('COMMIT_FAILED');
    expect((await replay(registry)).at(-1)).toMatchObject({ type: 'recovery-required' });
  });

  it('keeps BRANCH_PROTECTED and COMMIT_BLOCKED as plain failures (nothing was created)', async () => {
    for (const code of ['BRANCH_PROTECTED', 'COMMIT_BLOCKED']) {
      const registry = createOperationProgressRegistry();
      startCreateProgress(registry, operationId, 'existing', true).fail(code);
      expect((await replay(registry)).at(-1)).toMatchObject({ type: 'failed', code });
    }
  });
});
