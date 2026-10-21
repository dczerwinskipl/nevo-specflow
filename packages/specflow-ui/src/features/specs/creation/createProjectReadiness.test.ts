import { describe, expect, it } from 'vitest';
import { createOptionsFixture } from './creationOptions.stories-support';
import {
  createGoalMaxLength,
  createTitleMaxLength,
  projectCreateReadiness,
} from './createProjectReadiness';
import { initialWorkspaceChoice } from './workspaceChoice';

const ready = { status: 'ready', options: createOptionsFixture('default') } as const;
const base = {
  title: 'Payment limits',
  goal: '',
  workspaceState: ready,
  choice: initialWorkspaceChoice,
  forbidden: false,
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
  ])('is blocked by %s with its reason', (_name, change, key) => {
    const result = projectCreateReadiness({ ...base, ...change });
    expect(result.canSubmit).toBe(false);
    expect(result.prerequisite).toEqual({ key });
  });
});
