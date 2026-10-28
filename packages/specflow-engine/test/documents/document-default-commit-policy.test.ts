// Integration (real project, real Git): the DEFAULT commit policy. Nothing is committed automatically
// unless the configuration enables `git.commits.auto.<capability>`; a manual commit is always there.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { DocumentError } from '../../src/specs/document-rules/errors';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { readSpecificationDocumentTree } from '../../src/specs/documents/reading';
import { reserveCloseOperation } from '../../src/testing';
import { enableAutoCommitForTesting, GIT_ON, ledgerPaths } from '../support/document-writes';
import {
  commitCount,
  committedPaths,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueSave,
  workingTreeClean,
} from '../support/document-queue';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import { commitStaged, git } from '../support/git-project';
import { commitUncommitted, specPath } from '../support/manual-commit';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

describe('the default commit policy (automatic commit off)', () => {
  it('writes to disk and the ledger, commits nothing, and reads as the manual policy', async () => {
    const project = await queueProject({ autoCommit: 'default' });
    const before = commitCount(project);

    await queueSave(project, 1, 'one\n');
    await queueSave(project, 2, 'two\n');

    expect(commitCount(project)).toBe(before);
    expect(engineCommits(project)).toEqual([]);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(
      await runQueueOnce(project.engine, isolatedQueue(), undefined, { flush: true }),
    ).toMatchObject({ status: 'idle' });
    expect(commitCount(project)).toBe(before);
    expect(
      (await readSpecificationDocumentTree(project.engine, project.specId)).commits,
    ).toMatchObject({
      policy: 'manual',
      uncommitted: 2,
    });
  });

  it('keeps Close out until a manual commit holds exactly the ledger paths', async () => {
    const project = await queueProject({ autoCommit: 'default' });
    await queueSave(project, 1, 'one\n');
    const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
    await mkdir(join(project.root, '.nevo'), { recursive: true });
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(project.root, 'add', '.nevo/config.yaml');
    commitStaged(project.root, 'pin the integration target');
    const request = {
      kind: 'specification-close' as const,
      operationId: randomUUID(),
      specId: project.specId,
    };
    const refused = await failure(
      reserveCloseOperation(project.engine, request, { flush: { queue: isolatedQueue() } }),
    );
    expect(refused).toBeInstanceOf(DocumentError);
    expect(refused).toMatchObject({
      code: 'DOCUMENT_COMMITS_PENDING',
      details: { cause: 'commit-uncommitted' },
    });

    const result = await commitUncommitted(project, { message: 'Commit the notes' });
    expect(result.commit.state).toBe('committed');
    expect(committedPaths(project, result.commit.sha!)).toEqual([specPath(1)]);
    expect(await ledgerPaths(project)).toEqual([]);
    expect(workingTreeClean(project)).toBe(true);
  });

  it('commits through the queue once the configuration enables it', async () => {
    const project = await queueProject({ autoCommit: 'default' });
    await queueSave(project, 1, 'before enabling\n');
    expect(engineCommits(project)).toEqual([]);

    await enableAutoCommitForTesting(project.root);
    const id = await queueSave(project, 2, 'after enabling\n');
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, { flush: true });
    expect(result).toMatchObject({ status: 'committed', operationIds: [id] });
    // The earlier uncommitted change is never committed silently by the switch.
    expect(committedPaths(project, engineCommits(project)[0]!)).toEqual([specPath(2)]);
  });
});
