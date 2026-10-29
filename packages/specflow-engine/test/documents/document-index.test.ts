import { describe, expect, it } from 'vitest';

import { prepareDocumentIndex } from '../../src/version-control/commits/document-index';

const EMPTY = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
const OTHER = '1'.repeat(40);

function harness(entries: Record<string, string>, ignoreCase: boolean) {
  const events: string[] = [];
  const deps = {
    indexEntries: () => Promise.resolve(new Map(Object.entries(entries))),
    ignoreCase: () => Promise.resolve(ignoreCase),
    mutatePaths: (args: readonly string[], paths: readonly string[]) => {
      events.push(`mutate:${args.join(' ')}:${paths.join(',')}`);

      return Promise.resolve({ exitCode: 0 });
    },
    takeBack: (paths: readonly string[]) => {
      events.push(`takeBack:${paths.join(',')}`);

      return Promise.resolve();
    },
    owned: (paths: readonly string[]) => {
      events.push(`owned:${paths.join(',')}`);
    },
    addArgs: ['add', '--intent-to-add'],
  };

  return { deps, events };
}

const fact = (path: string, working: string | null) => ({ path, working, head: null });

describe('prepareDocumentIndex', () => {
  it('records ownership before the add runs', async () => {
    const { deps, events } = harness({}, false);
    await prepareDocumentIndex([fact('docs/new.md', OTHER)], deps);
    expect(events).toEqual(['owned:docs/new.md', 'mutate:add --intent-to-add:docs/new.md']);
  });

  it('keeps ownership when the add fails and takes the entries back', async () => {
    const { deps, events } = harness({}, false);
    const failing = {
      ...deps,
      mutatePaths: () => Promise.resolve({ exitCode: 1 }),
    };
    await expect(prepareDocumentIndex([fact('docs/new.md', OTHER)], failing)).rejects.toMatchObject(
      { code: 'COMMIT_FAILED', reason: 'intent-to-add' },
    );
    expect(events).toEqual(['owned:docs/new.md', 'takeBack:docs/new.md']);
  });

  it('treats a case variant of a tracked entry as that entry on a case-insensitive checkout', async () => {
    const { deps, events } = harness({ 'docs/Case.md': OTHER }, true);
    await prepareDocumentIndex([fact('docs/case.md', OTHER)], deps);
    expect(events).toEqual([]);
  });

  it('adds a case variant on a case-sensitive checkout', async () => {
    const { deps, events } = harness({ 'docs/Case.md': OTHER }, false);
    await prepareDocumentIndex([fact('docs/case.md', OTHER)], deps);
    expect(events).toEqual(['owned:docs/case.md', 'mutate:add --intent-to-add:docs/case.md']);
  });

  it('removes a stale intent-to-add entry whatever the case of the lookup', async () => {
    const { deps, events } = harness({ 'docs/Ghost.md': EMPTY }, true);
    await prepareDocumentIndex([fact('docs/ghost.md', null)], deps);
    expect(events).toEqual(['mutate:reset -q:docs/ghost.md']);
  });

  it('does nothing and reads nothing when HEAD tracks every path', async () => {
    const { deps, events } = harness({}, false);
    let asked = false;
    await prepareDocumentIndex([{ path: 'docs/a.md', working: OTHER, head: EMPTY }], {
      ...deps,
      ignoreCase: () => {
        asked = true;

        return Promise.resolve(false);
      },
    });
    expect(events).toEqual([]);
    expect(asked).toBe(false);
  });
});
