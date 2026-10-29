import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../hash';
import type { ResolvedProjectHome } from '../../project/home/home';
import {
  assertClaimsAvailable,
  claimCheckOf,
  classifyJournalText,
  firstBlobMismatch,
  guardRefusalAsCommitFailed,
  isExactPathSet,
  isExpiredUnsupportedJournal,
  journalPath,
  listJournalRowsTolerant,
  listJournals,
  listJournalsDetailed,
  moveJournalToSettled,
  overlaps,
  payloadDirectory,
  payloadOperationIdOf,
  publishJournal,
  readJournal,
  readJournalRowTolerant,
  readPayload,
  removeExpiredSettledJournals,
  removePayloadFilesExcept,
  removeSettledJournal,
  settledJournalPath,
  sortedResources,
  validateJournalOperationId,
  writePayload,
  SharedResourceError,
  type JournalKind,
} from './index';
import { GitCapabilityError } from '../../git/errors';

/** A kind that is not Create: proves the core never names one. */
interface SampleJournal {
  readonly version: 7;
  readonly operationId: string;
  readonly state: 'open' | 'done';
}

class SampleError extends Error {
  constructor(readonly sampleCode: string) {
    super(sampleCode);
  }
}

const KIND: JournalKind<SampleJournal> = {
  name: 'sample',
  label: 'Sample',
  relativeDir: 'engine/operations/sample',
  version: 7,
  maxBytes: 4096,
  listingMaxFiles: 3,
  parse: (_context, value, operationId) => {
    const record = value as SampleJournal;
    if (record.operationId !== operationId || !['open', 'done'].includes(record.state)) {
      throw new SampleError('invalid');
    }

    return record;
  },
  isSettled: (record) => record.state === 'done',
  errors: {
    invalid: () => new SampleError('invalid'),
    unsupported: () => new SampleError('unsupported'),
    invalidOperationId: () => new SampleError('bad-id'),
    payloadUnprovable: (message) => new SampleError('payload:' + message),
  },
};

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5 })),
  );
});

async function fixture(): Promise<ResolvedProjectHome> {
  const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-durable-')));
  roots.push(stateRoot);
  await mkdir(join(stateRoot, KIND.relativeDir), { recursive: true });

  return { project: { stateRoot } } as unknown as ResolvedProjectHome;
}

const record = (state: SampleJournal['state'] = 'open'): SampleJournal => ({
  version: 7,
  operationId: randomUUID(),
  state,
});

async function age(path: string, ms: number): Promise<void> {
  const time = new Date(Date.now() - ms);
  await utimes(path, time, time);
}

describe('journal store', () => {
  it('publishes, reads by id and lists current journals; unsupported ones are listed apart', async () => {
    const context = await fixture();
    const open = record();
    await publishJournal(context, KIND, open);
    const old = randomUUID();
    await writeFile(journalPath(context, KIND, old), '{not json');

    expect(await readJournal(context, KIND, open.operationId)).toEqual(open);
    expect(await readJournal(context, KIND, randomUUID())).toBeUndefined();
    await expect(readJournal(context, KIND, old)).rejects.toMatchObject({
      sampleCode: 'unsupported',
    });
    const listing = await listJournalsDetailed(context, KIND);
    expect(listing.journals).toEqual([open]);
    expect(listing.unsupported.map((entry) => entry.operationId)).toEqual([old]);
    expect(await listJournals(context, KIND)).toEqual([open]);
  });

  it('reports the kind errors for a bad id, a corrupt file and an oversize file', async () => {
    const context = await fixture();
    expect(() => validateJournalOperationId(KIND, 'nope')).toThrow(SampleError);
    const id = randomUUID();
    await writeFile(
      journalPath(context, KIND, id),
      JSON.stringify({ version: 7, operationId: id }),
    );
    await expect(readJournal(context, KIND, id)).rejects.toMatchObject({ sampleCode: 'invalid' });
    const big = randomUUID();
    await writeFile(journalPath(context, KIND, big), ' '.repeat(KIND.maxBytes + 1));
    await expect(readJournal(context, KIND, big)).rejects.toMatchObject({ sampleCode: 'invalid' });
  });

  it('ignores stage files and moves a settled journal out of the active listing', async () => {
    const context = await fixture();
    const done = record('done');
    await publishJournal(context, KIND, done);
    await writeFile(
      join(
        context.project.stateRoot,
        KIND.relativeDir,
        `.${randomUUID()}.json.${randomUUID()}.tmp`,
      ),
      'partial',
    );
    expect(await listJournals(context, KIND)).toEqual([done]);

    await moveJournalToSettled(context, KIND, done.operationId);
    expect(await listJournals(context, KIND)).toEqual([]);
    expect((await stat(settledJournalPath(context, KIND, done.operationId))).isFile()).toBe(true);
    await removeSettledJournal(context, KIND, done.operationId);
    await removeSettledJournal(context, KIND, done.operationId);
    await expect(stat(settledJournalPath(context, KIND, done.operationId))).rejects.toThrow();
  });

  it('lists tolerant rows, memoises unchanged files and caps the names read', async () => {
    const context = await fixture();
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) {
      await publishJournal(context, KIND, { version: 7, operationId: id, state: 'open' });
    }

    await writeFile(journalPath(context, KIND, randomUUID()), '{broken');
    let reads = 0;
    const reader = {
      readRow: (_path: string, operationId: string) => {
        reads += 1;

        return Promise.resolve({ operationId, readable: true });
      },
      unreadable: (operationId: string) => ({ operationId, readable: false }),
    };
    const first = await listJournalRowsTolerant(context, KIND, reader);
    expect(first).toHaveLength(3);
    const readsAfterFirst = reads;
    await listJournalRowsTolerant(context, KIND, reader);
    expect(reads).toBe(readsAfterFirst);

    // listingMaxFiles is 3: a fourth file is not read.
    await publishJournal(context, KIND, record());
    expect(await listJournalRowsTolerant(context, KIND, reader)).toHaveLength(3);

    expect(await readJournalRowTolerant(context, KIND, ids[0]!, reader)).toEqual({
      operationId: ids[0],
      readable: true,
    });
    expect(await readJournalRowTolerant(context, KIND, randomUUID(), reader)).toBeUndefined();
    expect(await readJournalRowTolerant(context, KIND, 'not-an-id', reader)).toBeUndefined();
  });
});

describe('unsupported classification', () => {
  it.each([
    ['a string version', '{"version":"7"}'],
    ['invalid JSON', '{no'],
    ['an array', '[7]'],
    ['null', 'null'],
  ])('classifies %s as unsupported', (_name, text) => {
    expect(classifyJournalText(text)).toEqual({ kind: 'unsupported' });
  });

  it('reads nothing but the shape of a parsable file and ages by mtime', () => {
    expect(classifyJournalText('{"version":7,"x":1}')).toEqual({
      kind: 'current',
      value: { version: 7, x: 1 },
    });
    expect(isExpiredUnsupportedJournal(0, 100, 100)).toBe(true);
    expect(isExpiredUnsupportedJournal(1, 100, 100)).toBe(false);
  });
});

describe('payload store', () => {
  const file = (content: string) => ({
    sha256: sha256Hex(content),
    bytes: Buffer.byteLength(content, 'utf8'),
    content,
  });

  it('stores by hash, reads back verified and reports the kind error for a changed file', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const first = file('first €');
    await writePayload(context, KIND, operationId, [first, first, file('second')]);
    expect(await readdir(payloadDirectory(context, KIND, operationId))).toHaveLength(2);
    expect(await readPayload(context, KIND, operationId, first)).toBe(first.content);
    await expect(
      readPayload(context, KIND, operationId, { sha256: first.sha256, bytes: first.bytes + 1 }),
    ).rejects.toMatchObject({ sampleCode: 'payload:Sample payload is missing or unreadable.' });
    await expect(
      readPayload(context, KIND, operationId, { sha256: sha256Hex('zzz'), bytes: 3 }),
    ).rejects.toBeInstanceOf(SampleError);
    await expect(
      writePayload(context, KIND, operationId, [{ sha256: sha256Hex('a'), content: 'b' }]),
    ).rejects.toThrow('Sample payload content does not match its hash.');
  });

  it('keeps only the named files when part of the payload is released', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    const plan = file('plan');
    const content = file('content');
    await writePayload(context, KIND, operationId, [plan, content]);
    await removePayloadFilesExcept(context, KIND, operationId, [plan.sha256]);
    expect(await readdir(payloadDirectory(context, KIND, operationId))).toEqual([plan.sha256]);
    expect(await readPayload(context, KIND, operationId, plan)).toBe('plan');
    await expect(
      removePayloadFilesExcept(context, KIND, randomUUID(), []),
    ).resolves.toBeUndefined();
  });

  it('names the directory so that journal readers never see it', async () => {
    const context = await fixture();
    const operationId = randomUUID();
    await writePayload(context, KIND, operationId, [file('x')]);
    expect(payloadOperationIdOf(`${operationId}.payload`)).toBe(operationId);
    expect(payloadOperationIdOf(`${operationId}.json`)).toBeUndefined();
    expect(await listJournals(context, KIND)).toEqual([]);
  });
});

describe('retention', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('removes old settled and unsupported journals with their payload, never open ones', async () => {
    const context = await fixture();
    const done = record('done');
    const open = record('open');
    const fresh = record('done');
    for (const item of [done, open, fresh]) {
      await publishJournal(context, KIND, item);
    }

    const unsupported = randomUUID();
    await writeFile(journalPath(context, KIND, unsupported), '{not json');
    await writePayload(context, KIND, done.operationId, [{ sha256: sha256Hex('p'), content: 'p' }]);
    for (const id of [done.operationId, open.operationId, unsupported]) {
      await age(journalPath(context, KIND, id), 8 * DAY);
    }

    const removed = await removeExpiredSettledJournals(context, KIND);
    expect(removed).toBe(2);
    const left = (await listJournals(context, KIND)).map((entry) => entry.operationId).sort();
    expect(left).toEqual([open.operationId, fresh.operationId].sort());
    await expect(stat(payloadDirectory(context, KIND, done.operationId))).rejects.toThrow();
  });

  it('removes an old orphaned payload but keeps one whose journal exists or is kept', async () => {
    const context = await fixture();
    const orphan = randomUUID();
    const kept = randomUUID();
    const withJournal = record();
    await publishJournal(context, KIND, withJournal);
    for (const id of [orphan, kept, withJournal.operationId]) {
      await writePayload(context, KIND, id, [{ sha256: sha256Hex('p'), content: 'p' }]);
      await age(payloadDirectory(context, KIND, id), 8 * DAY);
    }

    await removeExpiredSettledJournals(context, KIND, { keepOperationId: kept });
    await expect(stat(payloadDirectory(context, KIND, orphan))).rejects.toThrow();
    expect((await stat(payloadDirectory(context, KIND, kept))).isDirectory()).toBe(true);
    expect(
      (await stat(payloadDirectory(context, KIND, withJournal.operationId))).isDirectory(),
    ).toBe(true);
  });

  it('is bounded by the limit', async () => {
    const context = await fixture();
    for (let i = 0; i < 3; i += 1) {
      const item = record('done');
      await publishJournal(context, KIND, item);
      await age(journalPath(context, KIND, item.operationId), 8 * DAY);
    }

    expect(await removeExpiredSettledJournals(context, KIND, { limit: 2 })).toBe(2);
    expect(await removeExpiredSettledJournals(context, KIND, { limit: 2 })).toBe(1);
  });

  it('returns 0 when the directory does not exist', async () => {
    const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-durable-')));
    roots.push(stateRoot);
    const context = { project: { stateRoot } } as unknown as ResolvedProjectHome;
    expect(await removeExpiredSettledJournals(context, KIND)).toBe(0);
  });
});

describe('claims', () => {
  it('lets scoped claims coexist and makes the exclusive claim conflict with them', () => {
    expect(overlaps(['checkout-scoped:a'], ['checkout-scoped:a'])).toBe(false);
    expect(overlaps(['checkout-scoped:a'], ['checkout:a'])).toBe(true);
    expect(overlaps(['checkout:a'], ['checkout-scoped:a'])).toBe(true);
    expect(overlaps(['checkout-scoped:a'], ['checkout:b'])).toBe(false);
    expect(overlaps(['spec:x'], ['spec:x'])).toBe(true);
    expect(sortedResources(['b', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('lists every source first and reports the first conflict in source order', async () => {
    const context = await fixture();
    const order: string[] = [];
    const source = (name: string, conflict: boolean, records: string[]) =>
      claimCheckOf<string>({
        list: () => {
          order.push('list:' + name);

          return Promise.resolve(records);
        },
        assertAvailable: (found, requested, self) => {
          order.push(
            'check:' +
              name +
              ':' +
              found.join(',') +
              ':' +
              requested.join(',') +
              ':' +
              self?.operationId,
          );
          if (conflict) {
            throw new SharedResourceError('RESOURCE_CONFLICT', name);
          }
        },
      });
    await expect(
      assertClaimsAvailable(
        context,
        [source('first', true, ['x']), source('second', true, [])],
        ['r'],
        { kind: 'create', operationId: 'op' },
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT', message: 'first' });
    expect(order).toEqual(['list:first', 'list:second', 'check:first:x:r:op']);
  });
});

describe('committed evidence primitives', () => {
  it('compares exact path sets regardless of the expected order', () => {
    expect(isExactPathSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(isExactPathSet(['a', 'b'], ['a'])).toBe(false);
    expect(isExactPathSet(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('returns the first path whose blob differs', async () => {
    const commits = {
      blobMatchesWorkingFile: (_root: string, _sha: string, path: string) =>
        Promise.resolve(path !== 'b'),
    };
    expect(await firstBlobMismatch(commits, 'r', 'sha', ['a', 'b', 'c'])).toBe('b');
    expect(await firstBlobMismatch(commits, 'r', 'sha', ['a', 'c'])).toBeUndefined();
  });

  it('maps a policy refusal after files exist to COMMIT_FAILED and leaves other errors alone', () => {
    const refusal = new GitCapabilityError('BRANCH_PROTECTED', 'x', 'branch-protected');
    const mapped = guardRefusalAsCommitFailed(refusal);
    expect(mapped).toBeInstanceOf(GitCapabilityError);
    expect(mapped).toMatchObject({ code: 'COMMIT_FAILED' });
    expect((mapped as GitCapabilityError).reason).toBe('BRANCH_PROTECTED:branch-protected');
    expect(guardRefusalAsCommitFailed(new GitCapabilityError('COMMIT_BLOCKED', 'x'))).toMatchObject(
      {
        code: 'COMMIT_FAILED',
      },
    );
    const other = new GitCapabilityError('GIT_UNAVAILABLE', 'x');
    expect(guardRefusalAsCommitFailed(other)).toBe(other);
    const plain = new Error('plain');
    expect(guardRefusalAsCommitFailed(plain)).toBe(plain);
  });
});
