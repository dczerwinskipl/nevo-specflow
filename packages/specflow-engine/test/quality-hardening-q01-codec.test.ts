import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  reserveCloseOperation,
  withProjectControlLock,
  type CloseJournal,
} from '../src/testing';
import { isCloseJournal } from '../src/specs/lifecycle/journal-codec';
import {
  closeJournalPath,
  publishCloseJournal,
  readCloseJournal,
} from '../src/specs/lifecycle/journal-store';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Q01 pure Close journal codec and durable store boundary', () => {
  it('rejects forged checkpoints without persisting them', async () => {
    const root = await createGitTestProject(
      'q01-close-codec-Ż ',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'pin integration target',
    );
    const engine = await bootstrapProjectHome(root);
    const spec = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Close codec boundary',
      created: '2026-10-19',
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    git(root, 'add', '--', spec.relativeManifestPath, 'specs/active/' + spec.slug + '/overview.md');
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'commit canonical spec',
    );

    const operationId = randomUUID();
    const reserved = await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    const journal = reserved.journal;
    const context = engine.context;
    const journalPath = closeJournalPath(context, operationId);
    const originalBytes = await readFile(journalPath, 'utf8');
    const registryRevision = (await engine.readRegistry()).revision;
    const head = git(root, 'rev-parse', 'HEAD');

    expect(isCloseJournal(context, journal, operationId)).toBe(true);
    expect(await readCloseJournal(context, operationId)).toEqual(journal);

    const forged: readonly [string, unknown][] = [
      ['future version', { ...journal, version: 2 }],
      ['changed ownership', { ...journal, gitInstanceId: randomUUID() }],
      ['forged resource', { ...journal, plan: { ...journal.plan, resources: ['spec:other'] } }],
      [
        'forged completed stage',
        { ...journal, stage: 'completed', outcome: 'archived-in-primary' },
      ],
      ['unknown stage', { ...journal, stage: 'not-supported' }],
    ];

    for (const [label, value] of forged) {
      expect(isCloseJournal(context, value, operationId), label).toBe(false);
      await expect(
        withProjectControlLock(context, () => publishCloseJournal(context, value as CloseJournal)),
        label,
      ).rejects.toMatchObject({ code: 'CLOSE_JOURNAL_CORRUPT' });
      expect(await readFile(journalPath, 'utf8')).toBe(originalBytes);
    }

    expect((await engine.readRegistry()).revision).toBe(registryRevision);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);
});
