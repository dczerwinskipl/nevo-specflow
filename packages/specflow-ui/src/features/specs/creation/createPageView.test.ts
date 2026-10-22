import { describe, expect, it } from 'vitest';
import { createPageView, createSettingsModel, shortenGoal } from './createPageView';
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

describe('shortenGoal', () => {
  it('is absent for an empty goal and collapses whitespace', () => {
    expect(shortenGoal(undefined)).toBeUndefined();
    expect(shortenGoal('  \n ')).toBeUndefined();
    expect(shortenGoal('Reduce   recurring\npayment limits')).toBe(
      'Reduce recurring payment limits',
    );
  });

  it('cuts a long goal at a word edge with an ellipsis', () => {
    const goal = 'word '.repeat(80);
    const short = shortenGoal(goal, 40)!;
    expect(short.endsWith('word…')).toBe(true);
    expect(short.length).toBeLessThanOrEqual(41);
  });
});

describe('createSettingsModel', () => {
  it('is absent for a direct link: no request and no facts', () => {
    expect(createSettingsModel(undefined, undefined, undefined)).toBeUndefined();
  });

  it('carries the new-workspace facts the form saved, with the explicit slug and the shortened goal', () => {
    expect(
      createSettingsModel(
        { target: { kind: 'new-worktree' }, slug: 'limits', goal: 'Goal text' },
        'ignored draft goal',
        {
          place: 'new',
          base: 'main',
          branch: 'feature/limits',
          folder: '/work/trees',
          mergeInto: { name: 'api', branch: 'main' },
          mergeReason: 'dirty',
        },
      ),
    ).toEqual({
      place: 'new',
      base: 'main',
      branch: 'feature/limits',
      folder: '/work/trees',
      mergeInto: { name: 'api', branch: 'main' },
      mergeReason: 'dirty',
      slug: 'limits',
      goal: 'Goal text',
    });
  });

  it('without facts it states only what the request knows and omits the rest', () => {
    expect(
      createSettingsModel({ target: { kind: 'new-worktree', branch: 'feat/x' } }, '', undefined),
    ).toEqual({ place: 'new', branch: 'feat/x' });
    expect(
      createSettingsModel({ target: { kind: 'existing', workspaceId: 'w' } }, undefined, undefined),
    ).toEqual({ place: 'existing' });
    expect(createSettingsModel({}, undefined, undefined)).toEqual({ place: 'main' });
  });

  it('names the existing workspace and the current folder branch from the facts', () => {
    expect(
      createSettingsModel({ target: { kind: 'existing', workspaceId: 'w' } }, undefined, {
        place: 'existing',
        workspace: { name: 'api', branch: 'feature/api' },
      }),
    ).toEqual({ place: 'existing', workspace: { name: 'api', branch: 'feature/api' } });
  });

  it('does not carry new-workspace rows into another place', () => {
    expect(
      createSettingsModel({ target: { kind: 'existing', workspaceId: 'w' } }, undefined, {
        place: 'existing',
        folder: '/x',
        branch: 'b',
      }),
    ).toEqual({ place: 'existing' });
  });
});
