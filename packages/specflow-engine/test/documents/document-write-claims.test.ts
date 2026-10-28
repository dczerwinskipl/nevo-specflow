// Integration: document-change journals are resource claims that Create and Close see, and the
// other way round. The journals are the claim records; there is no second store.
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { createSpecificationForTesting } from '../../src/testing';
import { assertSharedResourcesAvailable } from '../../src/specs/coordination/resources';
import { publishJournal, withJournalLock, journalDirectory } from '../../src/specs/durable';
import { buildJournal } from '../../src/specs/documents/changes/test-support';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../src/specs/documents/changes/journal/kind';
import type { DocumentChangeStage } from '../../src/specs/documents/changes/journal/stages';
import { listDocumentChangeJournals } from '../../src/specs/documents/write/journal-store';
import {
  documentsProject,
  failure,
  removeTrackedRoots,
  type DocumentsFixture,
} from '../support/documents-fixture';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

async function publish(
  fixture: DocumentsFixture,
  stage: DocumentChangeStage,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const operationId = randomUUID();
  await withJournalLock(fixture.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
    await publishJournal(
      fixture.engine.context,
      DOCUMENT_CHANGE_JOURNAL_KIND,
      buildJournal(stage, {
        operationId,
        projectId: fixture.engine.context.project.projectId,
        workspaceId: fixture.engine.workspace.workspaceId,
        workspaceRoot: fixture.root,
        ...overrides,
      }),
    );
  });
  return operationId;
}

const scoped = (fixture: DocumentsFixture): string[] => [
  'checkout-scoped:' + fixture.engine.workspace.workspaceId,
];
const exclusive = (fixture: DocumentsFixture): string[] => [
  'checkout:' + fixture.engine.workspace.workspaceId,
];

describe('document-change journals as claims', () => {
  it('exclude a Close of the checkout and coexist with scoped claims, in every stage that holds one', async () => {
    const fixture = await documentsProject();
    for (const stage of [
      'reserved',
      'files-writing',
      'queued',
      'committing',
      'commit-failed',
      'recovery-required',
    ] as const) {
      const operationId = await publish(fixture, stage);
      const error = await failure(
        assertSharedResourcesAvailable(fixture.engine.context, exclusive(fixture)),
      );
      expect(error).toMatchObject({ code: 'RESOURCE_CONFLICT' });
      await expect(
        assertSharedResourcesAvailable(fixture.engine.context, scoped(fixture)),
      ).resolves.toBeUndefined();
      // the same operation asking again never conflicts with its own journal
      await expect(
        assertSharedResourcesAvailable(fixture.engine.context, exclusive(fixture), {
          kind: 'document-change',
          operationId,
        }),
      ).resolves.toBeUndefined();
      await rmJournal(fixture, operationId);
    }
  });

  it('do not claim once settled or refused', async () => {
    const fixture = await documentsProject();
    await publish(fixture, 'completed');
    await publish(fixture, 'failed');
    await expect(
      assertSharedResourcesAvailable(fixture.engine.context, exclusive(fixture)),
    ).resolves.toBeUndefined();
  });

  it('do not claim another checkout', async () => {
    const fixture = await documentsProject();
    await publish(fixture, 'queued', { workspaceId: randomUUID() });
    await expect(
      assertSharedResourcesAvailable(fixture.engine.context, exclusive(fixture)),
    ).resolves.toBeUndefined();
  });

  it('let a Create into the same checkout proceed', async () => {
    const fixture = await documentsProject();
    await publish(fixture, 'queued');
    const created = await createSpecificationForTesting(fixture.engine, {
      operationId: randomUUID(),
      title: 'Coexisting feature',
      created: '2026-10-24',
      archetype: { id: 'feature', version: 1 },
      optionalDocumentIds: [],
      target: { kind: 'existing', workspaceId: fixture.engine.workspace.workspaceId },
    });
    expect(created.slug).toBe('coexisting-feature');
  });

  it('fail closed on a corrupt journal and ignore stray files', async () => {
    const fixture = await documentsProject();
    await publish(fixture, 'completed');
    const directory = journalDirectory(fixture.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND);
    await mkdir(join(directory, 'batches'), { recursive: true });
    await writeFile(join(directory, 'notes.txt'), 'x');
    await expect(
      assertSharedResourcesAvailable(fixture.engine.context, exclusive(fixture)),
    ).resolves.toBeUndefined();
    expect(await listDocumentChangeJournals(fixture.engine.context)).toHaveLength(1);

    await writeFile(join(directory, `${randomUUID()}.json`), '{"version":1,"broken":true}');
    expect(
      await failure(assertSharedResourcesAvailable(fixture.engine.context, scoped(fixture))),
    ).toMatchObject({ code: 'RESOURCE_JOURNAL_CORRUPT' });
  });
});

async function rmJournal(fixture: DocumentsFixture, operationId: string): Promise<void> {
  await rm(
    join(
      journalDirectory(fixture.engine.context, DOCUMENT_CHANGE_JOURNAL_KIND),
      operationId + '.json',
    ),
  );
}
