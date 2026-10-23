import { describe, expect, it } from 'vitest';
import {
  createOptionsFixture,
  workspaceIds as ids,
} from '../../options/creationOptions.stories-support';
import { buildCreateFacts, toCreateFacts } from './createFacts';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';

const choice = (patch: Partial<WorkspaceChoice> = {}): WorkspaceChoice => ({
  ...initialWorkspaceChoice,
  ...patch,
});

describe('buildCreateFacts', () => {
  it('states a new workspace with the generated branch, the worktrees folder, the base and the merge target', () => {
    expect(
      buildCreateFacts(choice({ tile: 'new' }), createOptionsFixture(), 'Payment limits'),
    ).toEqual({
      place: 'new',
      base: 'develop',
      branch: 'feature/payment-limits',
      folder: '/work/acme-app-worktrees',
      mergeInto: { name: 'acme-app', branch: 'develop' },
    });
  });

  it('carries the explicit base, branch, slug and merge target the owner set', () => {
    const facts = buildCreateFacts(
      choice({
        tile: 'new',
        base: { on: true, ref: 'feature/platform' },
        branch: { on: true, name: 'feature/mine', edited: true },
        slug: { on: true, value: 'my-slug', edited: true },
        target: { on: true, workspaceId: ids.platform },
      }),
      createOptionsFixture(),
      'Payment limits',
    );
    expect(facts).toMatchObject({
      base: 'feature/platform',
      branch: 'feature/mine',
      slug: 'my-slug',
      mergeInto: { name: 'platform', branch: 'feature/platform' },
    });
  });

  it('keeps the merge target that cannot take a merge now, with the reason (creation is not affected)', () => {
    const facts = buildCreateFacts(
      choice({ tile: 'new' }),
      createOptionsFixture('target-dirty'),
      'Payment limits',
    );
    expect(facts).toMatchObject({
      mergeInto: { name: 'acme-app', branch: 'develop' },
      mergeReason: 'dirty',
    });
  });

  it('names the existing workspace and the current folder', () => {
    expect(
      buildCreateFacts(
        choice({ tile: 'existing', existingWorkspaceId: ids.platform }),
        createOptionsFixture(),
        'x',
      ),
    ).toEqual({ place: 'existing', workspace: { name: 'platform', branch: 'feature/platform' } });
    expect(buildCreateFacts(choice({ tile: 'main' }), createOptionsFixture(), 'x')).toEqual({
      place: 'main',
      workspace: { name: 'acme-app', branch: 'develop' },
    });
  });
});

describe('toCreateFacts', () => {
  it('reads stored facts and drops damaged ones', () => {
    expect(
      toCreateFacts({ place: 'existing', workspace: { name: 'api', branch: 'b' }, folder: 3 }),
    ).toEqual({ place: 'existing', workspace: { name: 'api', branch: 'b' } });
    expect(toCreateFacts({ place: 'elsewhere' })).toBeUndefined();
    expect(toCreateFacts('x')).toBeUndefined();
    expect(toCreateFacts({ place: 'new', workspace: { branch: 'b' } })).toEqual({ place: 'new' });
  });
});

describe('commit fact (Git enabled only)', () => {
  it('is carried only when the options say the Engine commits', () => {
    for (const tile of ['new', 'main'] as const) {
      expect(
        buildCreateFacts(choice({ tile }), createOptionsFixture('commits'), 'x'),
      ).toMatchObject({
        commit: true,
      });
      expect(buildCreateFacts(choice({ tile }), createOptionsFixture(), 'x')).not.toHaveProperty(
        'commit',
      );
    }
    expect(
      buildCreateFacts(
        choice({ tile: 'existing', existingWorkspaceId: ids.platform }),
        createOptionsFixture('commits'),
        'x',
      ),
    ).toMatchObject({ place: 'existing', commit: true });
  });

  it('survives storing and reading; a damaged flag is dropped', () => {
    expect(toCreateFacts({ place: 'main', commit: true })).toEqual({ place: 'main', commit: true });
    expect(toCreateFacts({ place: 'main', commit: 'yes' })).toEqual({ place: 'main' });
  });
});
