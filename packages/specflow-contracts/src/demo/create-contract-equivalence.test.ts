import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { ExistingSpecTargetSchema, NewSpecWorktreeTargetSchema } from '../specs/create';
import { CreateOptionsSchema } from '../specs/create-options';
import {
  DemoCreateOptionsSchema,
  DemoCreateTargetSchema,
  DemoExistingTargetSchema,
  DemoNewWorktreeTargetSchema,
} from './index';

const ID = '0b8f1c1e-0a11-4c6e-9a01-000000000001';

describe('demo create contract equals the real create contract', () => {
  it('derives the demo options and target schemas from the real ones (no hand copy)', () => {
    expect(JSON.stringify(DemoCreateOptionsSchema)).toBe(JSON.stringify(CreateOptionsSchema));
    expect(JSON.stringify(DemoExistingTargetSchema)).toBe(JSON.stringify(ExistingSpecTargetSchema));
    expect(JSON.stringify(DemoNewWorktreeTargetSchema)).toBe(
      JSON.stringify(NewSpecWorktreeTargetSchema),
    );
  });

  it('accepts the same documents in both directions', () => {
    const options = {
      primaryWorkspaceId: ID,
      workspaces: [
        {
          workspaceId: ID,
          kind: 'primary',
          name: 'repo',
          path: '/work/repo',
          managed: false,
          specCount: 0,
          state: 'available',
          selectable: true,
          branch: 'develop',
        },
      ],
      newWorktree: { status: 'available', branchProtected: true },
      defaultBaseRef: 'develop',
      branchPattern: 'feature/{slug}',
      worktreesRoot: { path: '/work/repo-worktrees', exists: true },
      commits: { protectedBranches: ['main'], allowedBranches: ['feature/**'] },
      baseRefs: [{ ref: 'develop', checkedOutWorkspaceId: ID }],
    };
    expect(Value.Check(CreateOptionsSchema, options)).toBe(true);
    expect(Value.Check(DemoCreateOptionsSchema, options)).toBe(true);
    const extra = { ...options, surprise: 1 };
    expect(Value.Check(CreateOptionsSchema, extra)).toBe(false);
    expect(Value.Check(DemoCreateOptionsSchema, extra)).toBe(false);
    for (const target of [
      { kind: 'existing', workspaceId: ID },
      { kind: 'new-worktree', baseRef: 'x', branch: 'y', integrationTargetWorkspaceId: ID },
    ]) {
      expect(Value.Check(DemoCreateTargetSchema, target)).toBe(true);
    }
  });
});
