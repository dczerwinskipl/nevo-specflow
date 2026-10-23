import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  projectCloseOperation,
  projectClosePreview,
  projectCreatedSpecification,
} from '../src/specs/operations/projection';
import type { CloseJournal, ClosePlan, CloseStage } from '../src/specs/lifecycle/model';

const operationId = randomUUID();
const specId = randomUUID();
const plan: ClosePlan = {
  operationId,
  fingerprint: 'f'.repeat(64),
  slug: 'test-specification',
  registryRevision: 1,
  specId,
  kind: 'specification-close' as const,
  location: 'active' as const,
  integrateToTargetBranch: true,
  // Internal only: none of these may occur in public transport results.
  resources: ['checkout:secret'],
  source: {
    workspaceId: randomUUID(),
    root: '/private/worktree',
    branch: 'internal',
    head: 'a'.repeat(40),
  },
  target: {
    workspaceId: randomUUID(),
    root: '/private/primary',
    branch: 'main',
    head: 'b'.repeat(40),
  },
};

function journal(stage: CloseStage): CloseJournal {
  return {
    version: 1,
    stage,
    projectId: randomUUID(),
    gitInstanceId: randomUUID(),
    plan,
    integration: {
      sourceCommit: 'a'.repeat(40),
      targetCommit: 'b'.repeat(40),
      mergeBaseCommit: 'c'.repeat(40),
      sourceTree: 'd'.repeat(40),
      targetTree: 'e'.repeat(40),
      relationship: 'divergent',
    },
    scratch: {
      root: '/private/scratch',
      instanceId: randomUUID(),
      conflictPaths: ['src/conflicted.ts'],
    },
  };
}

describe('Q05 transport-neutral operation projections', () => {
  it('returns only a stable Create completion identity', () => {
    const result = projectCreatedSpecification({
      operationId,
      specId,
      slug: 'example',
      workspaceId: randomUUID(),
      workspaceRoot: '/private/worktree',
      relativeManifestPath: 'specs/active/example/specification.yaml',
    });
    expect(result).toEqual({
      operationId,
      specId,
      kind: 'specification-create',
      status: 'completed',
      slug: 'example',
      workspaceId: result.workspaceId,
      relativeManifestPath: 'specs/active/example/specification.yaml',
    });
    expect(JSON.stringify(result)).not.toContain('/private/');
  });

  it.each([
    ['completed', 'completed'],
    ['reserved', 'in-progress'],
    ['integration-verified', 'in-progress'],
    ['archive-initiated', 'recovery-required'],
    ['archive-commit-initiated', 'recovery-required'],
    ['integration-publish-initiated', 'recovery-required'],
    ['integration-scratch-initiated', 'recovery-required'],
    ['disposal-initiated', 'recovery-required'],
    ['integration-scratch-conflict', 'requires-resolution'],
    ['archived-linked-awaiting-integration', 'requires-resolution'],
  ] as const)('maps %s without exposing durable evidence', (stage, status) => {
    const result = projectCloseOperation(journal(stage));
    expect(result).toMatchObject({ operationId, specId, kind: 'specification-close', status });
    expect(result).not.toHaveProperty('stage');
    expect(result).not.toHaveProperty('journal');
    expect(result).not.toHaveProperty('scratchRoot');
    expect(JSON.stringify(result)).not.toContain('/private/');
    expect(result.conflictPaths).toEqual(
      status === 'requires-resolution' ? ['src/conflicted.ts'] : undefined,
    );
  });

  it('includes verified terminal outcomes and a minimal preview', () => {
    const completed = { ...journal('completed'), outcome: 'integrated-and-removed' as const };
    expect(projectCloseOperation(completed)).toEqual({
      operationId,
      specId,
      kind: 'specification-close',
      status: 'completed',
      outcome: 'integrated-and-removed',
    });
    expect(projectClosePreview(completed.plan)).toEqual({
      operationId,
      specId,
      kind: 'specification-close',
      location: 'active',
      integrationRequired: true,
    });
  });
});
