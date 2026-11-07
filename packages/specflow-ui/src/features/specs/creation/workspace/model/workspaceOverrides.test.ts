import { describe, expect, it } from 'vitest';
import { createOptionsFixture } from '../../options/creationOptions.stories-support';
import { buildCreateRequest } from './createRequest.test-support';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';
import {
  baseOverride,
  baseUnchangeable,
  branchNameChanged,
  branchNameOverride,
  targetOverride,
  targetUnchangeable,
} from './workspaceOverrides';
import { defaultBaseValue, defaultTargetWorkspaceId } from './workspaceTiles';
import { workspaceProblems } from './workspaceValidation';

const options = createOptionsFixture('default');
const operationId = '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77';
const fresh: WorkspaceChoice = { ...initialWorkspaceChoice, tile: 'new' };
const apply = (choice: WorkspaceChoice, patch: Partial<WorkspaceChoice> | null) => ({
  ...choice,
  ...patch,
});
const target = (choice: WorkspaceChoice, title = 'Payment limits') =>
  buildCreateRequest(choice, options, title, operationId).target;

describe('the decision-row transitions keep the request semantics of the former switches', () => {
  it('Start from: Change preselects the listed default ref and sends nothing until it differs', () => {
    const changed = apply(fresh, baseOverride(options, fresh, true));
    expect(changed.base).toEqual({ on: true, ref: defaultBaseValue(options) });
    expect(changed.base.ref).toMatch(/^refs\/heads\//u);
    expect(target(changed)).toEqual({ kind: 'new-worktree' });

    const other = options.baseRefs.find((item) => item.ref !== changed.base.ref)!.ref;
    const picked = apply(changed, { base: { on: true, ref: other } });
    expect(target(picked)).toEqual({ kind: 'new-worktree', baseRef: other });

    // Restore default forgets the pick: nothing is sent again.
    const reset = apply(picked, baseOverride(options, picked, false));
    expect(reset.base).toEqual(initialWorkspaceChoice.base);
    expect(target(reset)).toEqual({ kind: 'new-worktree' });
  });

  it('Merge into: Change preselects the default target, which is never sent as a pin', () => {
    const changed = apply(fresh, targetOverride(options, fresh, true));
    expect(changed.target).toEqual({ on: true, workspaceId: defaultTargetWorkspaceId(options) });
    expect(target(changed)).toEqual({ kind: 'new-worktree' });

    const other = options.workspaces.find(
      (w) => w.integrationSelectable === true && w.workspaceId !== changed.target.workspaceId,
    )!.workspaceId;
    const picked = apply(changed, { target: { on: true, workspaceId: other } });
    expect(target(picked)).toEqual({ kind: 'new-worktree', integrationTargetWorkspaceId: other });
    expect(target(apply(picked, targetOverride(options, picked, false)))).toEqual({
      kind: 'new-worktree',
    });
  });

  it('Branch name: Change shows both fields with the generated values, which are not sent', () => {
    const changed = apply(fresh, branchNameOverride(fresh, true));
    expect(branchNameChanged(changed)).toBe(true);
    expect(changed.slug).toEqual({ on: true, value: '', edited: false });
    expect(changed.branch).toEqual({ on: true, name: '', edited: false });
    expect(buildCreateRequest(changed, options, 'Payment limits', operationId)).toEqual({
      title: 'Payment limits',
      operationId,
      target: { kind: 'new-worktree' },
    });

    const typed = apply(changed, {
      slug: { on: true, value: 'limits', edited: true },
      branch: { on: true, name: 'feature/own', edited: true },
    });
    expect(buildCreateRequest(typed, options, 'Payment limits', operationId)).toMatchObject({
      slug: 'limits',
      target: { kind: 'new-worktree', branch: 'feature/own' },
    });

    // Changing again keeps what was typed; Restore default forgets both.
    expect(apply(typed, branchNameOverride(typed, true))).toEqual(typed);
    const reset = apply(typed, branchNameOverride(typed, false));
    expect(branchNameChanged(reset)).toBe(false);
    expect(reset.slug).toEqual(initialWorkspaceChoice.slug);
    expect(reset.branch).toEqual(initialWorkspaceChoice.branch);
    expect(buildCreateRequest(reset, options, 'Payment limits', operationId)).toEqual({
      title: 'Payment limits',
      operationId,
      target: { kind: 'new-worktree' },
    });
  });

  it('a row that has nothing to choose from cannot be changed', () => {
    const noRefs = { ...options, baseRefs: [] };
    expect(baseUnchangeable(noRefs, fresh)).toBe(true);
    expect(baseOverride(noRefs, fresh, true)).toBeNull();
    const noTargets = {
      ...options,
      workspaces: options.workspaces.map((w) => ({ ...w, integrationSelectable: false })),
    };
    expect(targetUnchangeable(noTargets, fresh)).toBe(true);
    expect(targetOverride(noTargets, fresh, true)).toBeNull();
    // Going back to the default is always possible.
    expect(
      targetOverride(noTargets, { ...fresh, target: { on: true, workspaceId: 'x' } }, false),
    ).toEqual({ target: { on: false, workspaceId: '' } });
  });
});

describe('workspace problems name their field in the section order', () => {
  it('several problems at once: base, then target, then slug, then branch', () => {
    const many = apply(fresh, {
      base: { on: true, ref: '' },
      target: { on: true, workspaceId: '' },
      slug: { on: true, value: 'Not Valid', edited: true },
      branch: { on: true, name: '', edited: true },
    });
    expect(workspaceProblems(many, options, 'Payment limits').map((p) => p.field)).toEqual([
      'base',
      'target',
      'slug',
      'branch',
    ]);
  });

  it('a protected generated branch belongs to the branch field', () => {
    const protectedOptions = createOptionsFixture('new-branch-protected');
    expect(workspaceProblems(fresh, protectedOptions, 'Payment limits')).toEqual([
      expect.objectContaining({ field: 'branch' }),
    ]);
  });

  it('an existing workspace without a pick belongs to the workspace picker', () => {
    expect(workspaceProblems({ ...fresh, tile: 'existing' }, options, 'Payment limits')).toEqual([
      expect.objectContaining({ field: 'existing' }),
    ]);
  });
});
