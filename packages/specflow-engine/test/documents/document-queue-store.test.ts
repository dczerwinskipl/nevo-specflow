// Integration (real files): the batch store and the lease record. Atomic publication, a tolerant
// listing that ignores stray and unsupported files, and a corrupt current-format record that fails
// closed.
import { randomUUID } from 'node:crypto';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import {
  DOCUMENT_BATCH_RELATIVE_DIR,
  DOCUMENT_LEASE_RELATIVE_DIR,
  encodeBatchPaths,
  type DocumentBatchRecord,
} from '../../src/specs/documents/changes/journal';
import {
  DOCUMENT_BATCH_KIND,
  documentBatchViews,
  listDocumentBatches,
  publishDocumentBatch,
  readBatchPaths,
  removeDocumentBatch,
  transitionDocumentBatch,
  writeBatchPaths,
} from '../../src/specs/documents/queue/batch-store';
import {
  leasePath,
  readQueueLease,
  removeQueueLease,
  removeQueueLeaseOf,
  writeQueueLease,
} from '../../src/specs/documents/queue/lease';
import { withJournalLock } from '../../src/specs/durable';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import { symlinksAvailable } from '../support/platform';
import { queueProject, type QueueProject } from '../support/document-queue';
import { git } from '../support/git-project';

afterEach(removeTrackedRoots);

const WORKSPACE_PATH = 'specs/active/hand/notes-1.md';

async function record(
  project: QueueProject,
  patch: Partial<DocumentBatchRecord> = {},
): Promise<DocumentBatchRecord> {
  const id = randomUUID();
  const encoded = encodeBatchPaths([
    {
      path: WORKSPACE_PATH,
      pre: { sha256: sha256Hex('a'), bytes: 1 },
      post: { sha256: sha256Hex('b'), bytes: 1 },
    },
  ]);
  await withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, () =>
    writeBatchPaths(project.engine.context, id, encoded),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    projectId: project.engine.context.project.projectId,
    operationId: id,
    workspaceId: project.workspaceId,
    workspaceRoot: project.root,
    specId: project.specId,
    slug: 'hand',
    state: 'committing',
    memberIds: [id],
    paths: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: 1 },
    branch: 'feature/work',
    parentHead: git(project.root, 'rev-parse', 'HEAD'),
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    executor: { pid: process.pid, hostId: 'host' },
    ...patch,
  };
}

describe('the batch store', () => {
  it('publishes a record and its path list and reads them back verified', async () => {
    const project = await queueProject();
    const batch = await record(project);
    await withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, () =>
      publishDocumentBatch(project.engine.context, batch),
    );
    expect(await listDocumentBatches(project.engine.context)).toEqual([batch]);
    expect(
      (await readBatchPaths(project.engine.context, batch)).map((entry) => entry.path),
    ).toEqual([WORKSPACE_PATH]);
    const [view] = await documentBatchViews.list(project.engine.context, project.workspaceId);
    expect(view).toMatchObject({ batchId: batch.operationId, state: 'committing' });
    expect([...view!.paths]).toEqual([WORKSPACE_PATH]);
    expect(await documentBatchViews.list(project.engine.context, randomUUID())).toEqual([]);

    await withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, () =>
      removeDocumentBatch(project.engine.context, batch.operationId),
    );
    expect(await listDocumentBatches(project.engine.context)).toEqual([]);
  });

  it('answers an empty listing before any batch ever existed', async () => {
    const project = await queueProject();
    expect(await listDocumentBatches(project.engine.context)).toEqual([]);
    expect(await documentBatchViews.list(project.engine.context, project.workspaceId)).toEqual([]);
  });

  it('ignores stray stage files and other names; a corrupt record fails closed', async () => {
    const project = await queueProject();
    const batch = await record(project);
    await withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, () =>
      publishDocumentBatch(project.engine.context, batch),
    );
    const directory = join(project.engine.context.project.stateRoot, DOCUMENT_BATCH_RELATIVE_DIR);
    await writeFile(join(directory, `.${randomUUID()}.json.${randomUUID()}.tmp`), '{');
    await writeFile(join(directory, 'notes.txt'), 'not a record');
    expect(await listDocumentBatches(project.engine.context)).toEqual([batch]);

    await writeFile(join(directory, `${randomUUID()}.json`), JSON.stringify({ version: 1 }));
    expect(await failure(listDocumentBatches(project.engine.context))).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
      details: { cause: 'journal-corrupt' },
    });
  });

  it('refuses a record over the 64 KiB cap', async () => {
    const project = await queueProject();
    const batch = await record(project, { reason: 'x'.repeat(70_000) });
    expect(
      await failure(
        withJournalLock(project.engine.context, DOCUMENT_BATCH_KIND, () =>
          publishDocumentBatch(project.engine.context, batch),
        ),
      ),
    ).toBeDefined();
  });

  it('moves a batch only along the state table and keeps what the state keeps', async () => {
    const project = await queueProject();
    const batch = await record(project);
    const context = project.engine.context;
    const now = new Date().toISOString();
    const committed = transitionDocumentBatch(
      context,
      batch,
      'committed',
      { sha: 'a'.repeat(40) },
      now,
    );
    expect(committed).toMatchObject({ state: 'committed', sha: 'a'.repeat(40) });
    expect(committed.executor).toBeUndefined();
    expect(committed.parentHead).toBe(batch.parentHead);
    expect(() =>
      transitionDocumentBatch(context, committed, 'failed', { reason: 'x-y' }, now),
    ).toThrow();
    expect(() => transitionDocumentBatch(context, batch, 'failed', {}, now)).toThrow();
    const failed = transitionDocumentBatch(
      context,
      batch,
      'failed',
      { reason: 'content-changed' },
      now,
    );
    expect(failed).toMatchObject({ state: 'failed', reason: 'content-changed' });
    expect(transitionDocumentBatch(context, failed, 'dissolved', {}, now).state).toBe('dissolved');
  });
});

describe('the queue lease record', () => {
  it('creates, reads, replaces and releases one lease per checkout', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    expect(await readQueueLease(context, project.workspaceId)).toBeUndefined();
    const batchId = randomUUID();
    const executor = { pid: process.pid, hostId: 'host' };
    const created = await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      writeQueueLease(context, {
        workspaceId: project.workspaceId,
        executor,
        batchId,
        acquiredAt: new Date().toISOString(),
      }),
    );
    expect(await readQueueLease(context, project.workspaceId)).toEqual(created);
    const next = randomUUID();
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      writeQueueLease(context, { ...created, batchId: next }),
    );
    expect((await readQueueLease(context, project.workspaceId))?.batchId).toBe(next);
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      removeQueueLease(context, project.workspaceId),
    );
    expect(await readQueueLease(context, project.workspaceId)).toBeUndefined();
    // Releasing a lease that is not there is fine.
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      removeQueueLease(context, project.workspaceId),
    );
  });

  it('releases the lease only for the batch it names', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    const batchId = randomUUID();
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      writeQueueLease(context, {
        workspaceId: project.workspaceId,
        executor: { pid: process.pid, hostId: 'host' },
        batchId,
        acquiredAt: new Date().toISOString(),
      }),
    );
    // A slow executor releasing the batch an operator took over must not remove the new holder's lease.
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      removeQueueLeaseOf(context, project.workspaceId, randomUUID()),
    );
    expect((await readQueueLease(context, project.workspaceId))?.batchId).toBe(batchId);
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      removeQueueLeaseOf(context, project.workspaceId, batchId),
    );
    expect(await readQueueLease(context, project.workspaceId)).toBeUndefined();
  });

  it('fails closed on a corrupt lease', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    await withJournalLock(context, DOCUMENT_BATCH_KIND, () =>
      writeQueueLease(context, {
        workspaceId: project.workspaceId,
        executor: { pid: process.pid, hostId: 'host' },
        batchId: randomUUID(),
        acquiredAt: new Date().toISOString(),
      }),
    );
    await writeFile(leasePath(context, project.workspaceId), '{"version":1}');
    expect(await failure(readQueueLease(context, project.workspaceId))).toMatchObject({
      details: { cause: 'journal-corrupt' },
    });
  });

  it.skipIf(!symlinksAvailable)('fails closed on a lease that is a symbolic link', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    await mkdir(join(context.project.stateRoot, DOCUMENT_LEASE_RELATIVE_DIR), { recursive: true });
    const target = join(project.root, 'elsewhere.json');
    await writeFile(target, '{}');
    await symlink(target, leasePath(context, project.workspaceId));
    expect(await failure(readQueueLease(context, project.workspaceId))).toMatchObject({
      details: { cause: 'journal-corrupt' },
    });
  });
});
