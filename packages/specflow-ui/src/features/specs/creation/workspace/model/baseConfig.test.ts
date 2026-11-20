import { describe, expect, it } from 'vitest';
import { createOptionsFixture } from '../../options/creationOptions.stories-support';
import { baseConfigMessage, preferredBaseRef } from './baseConfig';
import { buildCreateTarget } from './createRequest';
import { buildCreateFacts } from './createFacts';
import { baseOverride } from './workspaceOverrides';
import { workspaceProblems } from './workspaceValidation';
import { initialWorkspaceChoice } from './workspaceChoice';

const choice = { ...initialWorkspaceChoice, tile: 'new' as const };

describe('committed configuration of the starting source', () => {
  it('prefers a usable integration branch and sends the source displayed in the untouched form', () => {
    const options = createOptionsFixture('base-config-fallback');
    expect(preferredBaseRef(options)).toBe('refs/heads/develop');
    expect(buildCreateTarget(choice, options)).toEqual({
      kind: 'new-worktree',
      baseRef: 'refs/heads/develop',
    });
    expect(buildCreateFacts(choice, options, 'Title')?.base).toBe('develop');
    expect(workspaceProblems(choice, options, 'Title')).toEqual([]);
    const opened = { ...choice, ...baseOverride(options, choice, true) };
    expect(opened.base.ref).toBe('refs/heads/develop');
    expect(buildCreateTarget(opened, options)).toEqual(buildCreateTarget(choice, options));
    const restored = { ...opened, ...baseOverride(options, opened, false) };
    expect(buildCreateTarget(restored, options)).toEqual(buildCreateTarget(choice, options));
  });

  it('falls back to the first usable branch when the integration branch cannot be used', () => {
    const options = createOptionsFixture('base-config-fallback');
    options.baseRefs = options.baseRefs.map((item) =>
      item.ref === 'refs/heads/develop'
        ? { ...item, projectConfig: { status: 'unusable', reason: 'invalid-yaml' } }
        : item,
    );
    expect(preferredBaseRef(options)).toBe('refs/heads/feature/platform');
    expect(buildCreateTarget(choice, options)).toEqual({
      kind: 'new-worktree',
      baseRef: 'refs/heads/feature/platform',
    });
  });

  it.each(['HEAD', 'refs/tags/v1', '0123456789abcdef0123456789abcdef01234567'])(
    'keeps a usable configured %s without an override',
    (ref) => {
      const options = createOptionsFixture();
      options.defaultBaseRef = ref;
      expect(preferredBaseRef(options)).toBe(ref);
      expect(buildCreateTarget(choice, options)).toEqual({ kind: 'new-worktree' });
    },
  );

  it('blocks a new workspace before submit when every source is unusable, but preserves existing placements', () => {
    const options = createOptionsFixture('base-config-unusable');
    expect(preferredBaseRef(options)).toBe('HEAD');
    expect(workspaceProblems(choice, options)).toEqual([
      { field: 'base', message: baseConfigMessage(options.defaultBaseConfig) },
    ]);
    expect(workspaceProblems({ ...choice, tile: 'main' }, options)).toEqual([]);
    expect(
      workspaceProblems(
        { ...choice, tile: 'existing', existingWorkspaceId: options.workspaces[1]!.workspaceId },
        options,
      ),
    ).toEqual([]);
  });

  it('flags a remembered selected branch that becomes unusable without silently choosing another', () => {
    const options = createOptionsFixture('base-config-unusable');
    const selected = { ...choice, base: { on: true, ref: options.baseRefs[2]!.ref } };
    expect(workspaceProblems(selected, options)[0]).toEqual({
      field: 'base',
      message: baseConfigMessage(options.baseRefs[2]!.projectConfig),
    });
    expect(buildCreateTarget(selected, options)).toEqual({
      kind: 'new-worktree',
      baseRef: selected.base.ref,
    });
  });
});
