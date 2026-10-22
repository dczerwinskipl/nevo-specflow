import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { createPageView, createTargetLine } from './createPageView';
import type { CreatePhase } from './createOperationReducer';

describe('createPageView', () => {
  it.each<[CreatePhase, string]>([
    ['idle', 'working'],
    ['submitting', 'working'],
    ['monitoring', 'working'],
    ['completed', 'completed'],
    ['failed', 'refused'],
    ['outcome-unknown', 'unknown'],
    ['recovery-required', 'unknown'],
  ])('shows %s as %s', (phase, view) => {
    expect(createPageView({ phase }, false)).toBe(view);
  });

  it('an operation the server does not know is not found whatever the phase', () => {
    expect(createPageView({ phase: 'outcome-unknown' }, true)).toBe('not-found');
  });
});

describe('createTargetLine', () => {
  const t = ((key: string, values?: Record<string, string>) =>
    `${key}${values ? JSON.stringify(values) : ''}`) as unknown as TFunction;

  it('names the typed branch of a new workspace, else only the new workspace', () => {
    expect(createTargetLine({ kind: 'new-worktree', branch: 'feat/x' }, undefined, t)).toBe(
      'create.page.target.newWorkspaceBranch{"branch":"feat/x"}',
    );
    expect(createTargetLine({ kind: 'new-worktree' }, undefined, t)).toBe(
      'create.page.target.newWorkspace',
    );
  });

  it('names an existing workspace when its name is known and says it is the project checkout otherwise', () => {
    expect(createTargetLine({ kind: 'existing', workspaceId: 'w' }, 'api', t)).toBe(
      'create.page.target.existing{"name":"api"}',
    );
    expect(createTargetLine({ kind: 'existing', workspaceId: 'w' }, undefined, t)).toBe(
      'create.page.target.existingUnnamed',
    );
    expect(createTargetLine(undefined, undefined, t)).toBe('create.page.target.main');
  });
});
