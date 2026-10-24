import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { overlaps, resourcesForCreate } from '../src/specs/coordination/resources';
import type { CreateJournal } from '../src/specs/create/journal';

function claim(specId: string, target: CreateJournal['target']): CreateJournal {
  return {
    version: 1,
    projectId: '11111111-1111-4111-8111-111111111111',
    operationId: randomUUID(),
    requestIntent: {
      title: 'Resource example',
      target: { kind: 'existing', workspaceId: randomUUID() },
      archetype: { id: 'minimal', version: 1 },
      optionalDocumentIds: [],
      addedDocuments: [],
      folders: [],
    },
    inputFingerprint: 'a'.repeat(64),
    specId,
    slug: 'resource-example',
    title: 'Resource example',
    created: '2026-10-18',
    stage: 'reserved',
    target,
    files: [],
  };
}

describe('E2.T10 shared resource compatibility', () => {
  it('permits independent Creates in one checkout, but not an exclusive Close', () => {
    const workspaceId = randomUUID();
    const root = '/verified/test-checkout';
    const first = resourcesForCreate(
      claim(randomUUID(), { kind: 'existing', workspaceId, workspaceRoot: root }),
    );
    const second = resourcesForCreate(
      claim(randomUUID(), { kind: 'existing', workspaceId, workspaceRoot: root }),
    );
    expect(overlaps(first, second)).toBe(false);
    expect(overlaps(second, first)).toBe(false);
    expect(overlaps(first, ['checkout:' + workspaceId])).toBe(true);
    expect(overlaps(['checkout:' + workspaceId], second)).toBe(true);
  });

  it('preserves exclusive ownership of one Specification identity', () => {
    const workspaceId = randomUUID();
    const specId = randomUUID();
    const first = resourcesForCreate(
      claim(specId, { kind: 'existing', workspaceId, workspaceRoot: '/one' }),
    );
    const second = resourcesForCreate(
      claim(specId, { kind: 'existing', workspaceId, workspaceRoot: '/one' }),
    );
    expect(overlaps(first, second)).toBe(true);
  });

  it('allows distinct managed worktree refs and paths while preserving disposal exclusion', () => {
    const first = resourcesForCreate(
      claim(randomUUID(), {
        kind: 'new-worktree',
        workspaceId: randomUUID(),
        workspaceRoot: '/worktrees/first',
        branch: 'spec/first',
        baseCommit: 'a'.repeat(40),
        instanceId: randomUUID(),
      }),
    );
    const second = resourcesForCreate(
      claim(randomUUID(), {
        kind: 'new-worktree',
        workspaceId: randomUUID(),
        workspaceRoot: '/worktrees/second',
        branch: 'spec/second',
        baseCommit: 'a'.repeat(40),
        instanceId: randomUUID(),
      }),
    );
    expect(overlaps(first, second)).toBe(false);
    expect(overlaps(first, ['git-worktree-admin:11111111-1111-4111-8111-111111111111'])).toBe(true);
    expect(overlaps(second, ['git-worktree-admin:11111111-1111-4111-8111-111111111111'])).toBe(
      true,
    );
    expect(overlaps(first, ['ref:refs/heads/spec/first'])).toBe(true);
    expect(overlaps(first, ['worktree-path:/worktrees/first'])).toBe(true);
  });
});
