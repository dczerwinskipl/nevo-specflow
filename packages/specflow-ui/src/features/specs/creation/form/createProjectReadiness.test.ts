import type { ArchetypeInfo } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import { createOptionsFixture } from '../options/creationOptions.stories-support';
import {
  createGoalMaxLength,
  createTitleMaxLength,
  projectCreateReadiness,
} from './createProjectReadiness';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';

const ready = { status: 'ready', options: createOptionsFixture('default') } as const;
const base = {
  title: 'Payment limits',
  goal: '',
  workspaceState: ready,
  choice: initialWorkspaceChoice,
  forbidden: false,
  archetypesLoading: false,
  archetype: { id: 'feature' } as ArchetypeInfo,
};

describe('projectCreateReadiness', () => {
  it('allows Create with a name and a usable workspace choice', () => {
    expect(projectCreateReadiness(base)).toEqual({ prerequisite: undefined, canSubmit: true });
  });

  it('uses the Runtime limits of the real schema (title 200, goal 4000), not the demo 240', () => {
    expect(createTitleMaxLength).toBe(200);
    expect(createGoalMaxLength).toBe(4000);
    expect(projectCreateReadiness({ ...base, title: 'x'.repeat(201) }).canSubmit).toBe(false);
    expect(projectCreateReadiness({ ...base, goal: 'x'.repeat(4001) }).canSubmit).toBe(false);
  });

  it.each([
    ['a blank name', { title: '  ' }, 'create.prerequisite.title'],
    [
      'loading options',
      { workspaceState: { status: 'loading' } as const },
      'create.prerequisite.workspaceLoading',
    ],
    [
      'failed options',
      { workspaceState: { status: 'error' } as const },
      'create.prerequisite.workspaceError',
    ],
    ['no permission', { forbidden: true }, 'create.prerequisite.forbidden'],
    ['loading archetypes', { archetypesLoading: true }, 'create.archetype.loading'],
    ['no archetype', { archetype: undefined }, 'create.prerequisite.archetype'],
    [
      'no archetypes installed',
      { archetype: undefined, noArchetypes: true },
      'create.prerequisite.noArchetypes',
    ],
  ])('is blocked by %s with its reason', (_name, change, key) => {
    const result = projectCreateReadiness({ ...base, ...change });
    expect(result.canSubmit).toBe(false);
    expect(result.prerequisite).toEqual({ key });
  });
});

describe('projectCreateReadiness: the field of the first problem', () => {
  it('follows the form order: name, archetype, then the workspace fields', () => {
    const pending = {
      ...initialWorkspaceChoice,
      tile: 'new' as const,
      base: { on: true, ref: '' },
    };
    const all = { ...base, title: '', archetype: undefined, choice: pending };
    expect(projectCreateReadiness(all).problemField).toBe('name');
    expect(projectCreateReadiness({ ...all, title: 'T' }).problemField).toBe('archetype');
    expect(projectCreateReadiness({ ...all, title: 'T', archetype: base.archetype })).toMatchObject(
      { problemField: 'base', canSubmit: false },
    );
  });

  it('loading, no permission and nothing installed have no field to lead to', () => {
    expect(projectCreateReadiness({ ...base, forbidden: true }).problemField).toBeUndefined();
    expect(
      projectCreateReadiness({ ...base, archetypesLoading: true }).problemField,
    ).toBeUndefined();
    expect(
      projectCreateReadiness({ ...base, workspaceState: { status: 'loading' } }).problemField,
    ).toBeUndefined();
  });
});
