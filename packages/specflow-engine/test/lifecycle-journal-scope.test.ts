import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  listCloseJournals,
  reserveCloseOperation,
} from '../src/testing';
import { closeJournalPath } from '../src/specs/lifecycle/journal-store';
import { createGitTestProject, git, commitStaged } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

describe('E2.T10 Close journal destination ownership', () => {
  it('rejects a pinned primary Close that drops the destination without changing source claims', async () => {
    const root = await createGitTestProject(
      'specflow-close-scope-Ż ',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    commitStaged(root, 'select integration target');
    const engine = await bootstrapProjectHome(root);
    const spec = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Journal destination consistency',
      created: '2026-10-17',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    git(root, 'add', '--', spec.relativeManifestPath, 'specs/active/' + spec.slug + '/overview.md');
    commitStaged(root, 'commit authored specification');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    const path = closeJournalPath(engine.context, operationId);
    const original = JSON.parse(await readFile(path, 'utf8')) as {
      plan: {
        target?: unknown;
        targetBranch?: string;
        configRevision?: string;
        integrateToTargetBranch?: boolean;
      };
    };

    // Removing the primary target previously left the SAME resource list:
    // its workspaceId/ref were already represented by the source.
    await writeFile(
      path,
      JSON.stringify({
        ...original,
        plan: {
          ...original.plan,
          target: undefined,
          targetBranch: undefined,
          configRevision: undefined,
        },
      }),
    );
    await expect(listCloseJournals(engine.context)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });

    // On primary, an explicit integration flag is not legal. The Close
    // fingerprint alone is insufficient: false equals the primary default.
    await writeFile(
      path,
      JSON.stringify({
        ...original,
        plan: { ...original.plan, integrateToTargetBranch: false },
      }),
    );
    await expect(listCloseJournals(engine.context)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });
  }, 120000);
});
