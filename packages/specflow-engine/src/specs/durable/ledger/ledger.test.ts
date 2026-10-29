import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../hash';
import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  LEDGER_BRANCH_MAX_CHARACTERS,
  LEDGER_MAX_BYTES,
  LEDGER_MAX_OPERATION_IDS,
  LEDGER_MAX_PATHS,
  LedgerCorruptError,
  LedgerLimitError,
  applyLedgerUpsert,
  encodeLedgerRecord,
  ledgerOwnerKey,
  ledgerOwnerOfKey,
  ledgerPath,
  ledgerRevisionOf,
  listLedgerRecords,
  parseLedgerRecord,
  readLedgerRecord,
  removeLedgerPaths,
  writeLedgerRecord,
  type LedgerOwner,
  type LedgerRecord,
  type LedgerSubject,
  type LedgerUpsert,
} from './index';

const PROJECT_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const SPEC_ID = '0a1b2c3d-0000-4000-8000-0123456789ab';
const OWNER: LedgerOwner = { kind: 'specification', id: SPEC_ID };
const SUBJECT: LedgerSubject = {
  projectId: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  workspaceRoot: '/work/repo',
  owner: OWNER,
};
const HEAD = 'a'.repeat(40);

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<ResolvedProjectHome> {
  const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-ledger-')));
  roots.push(stateRoot);

  return { project: { stateRoot, projectId: PROJECT_ID } } as unknown as ResolvedProjectHome;
}

function upsert(partial: Partial<LedgerUpsert> & { paths: LedgerUpsert['paths'] }): LedgerUpsert {
  return {
    operationId: randomUUID(),
    reason: 'auto-commit-off',
    recordedAt: '2026-10-27T10:00:00.000Z',
    branch: 'feature/x',
    head: HEAD,
    ...partial,
  };
}

const image = (text: string): string => sha256Hex(text);

describe('applyLedgerUpsert', () => {
  it('creates a record with one entry per path, sorted, and pins the branch and head', () => {
    const record = applyLedgerUpsert(
      undefined,
      SUBJECT,
      upsert({
        paths: [
          { path: 'specs/active/x/b.md', postSha256: image('b') },
          { path: 'specs/active/x/a.md', postSha256: null },
        ],
      }),
    );
    expect(record.entries.map((entry) => entry.path)).toEqual([
      'specs/active/x/a.md',
      'specs/active/x/b.md',
    ]);
    expect(record.entries[0]).toMatchObject({ postSha256: null, operationCount: 1 });
    expect(record).toMatchObject({ branch: 'feature/x', head: HEAD, owner: OWNER });
  });

  it('replaces the post-image of a path, appends the operation id and keeps the first pin', () => {
    const first = upsert({ paths: [{ path: 'a.md', postSha256: image('1') }] });
    const second = upsert({
      paths: [{ path: 'a.md', postSha256: image('2') }],
      reason: 'abandoned',
      branch: 'other',
      head: 'b'.repeat(40),
    });
    const record = applyLedgerUpsert(applyLedgerUpsert(undefined, SUBJECT, first), SUBJECT, second);
    expect(record.entries).toHaveLength(1);
    expect(record.entries[0]).toMatchObject({
      postSha256: image('2'),
      operationIds: [first.operationId, second.operationId],
      operationCount: 2,
      reason: 'abandoned',
    });
    expect(record).toMatchObject({ branch: 'feature/x', head: HEAD });
  });

  it('is idempotent by operation id: a re-run adds nothing and returns the same record', () => {
    const change = upsert({ paths: [{ path: 'a.md', postSha256: image('1') }] });
    const once = applyLedgerUpsert(undefined, SUBJECT, change);
    const twice = applyLedgerUpsert(once, SUBJECT, {
      ...change,
      recordedAt: '2027-01-01T00:00:00Z',
    });
    expect(twice).toBe(once);
  });

  it('re-pins the branch when the record had been emptied', () => {
    const emptied = removeLedgerPaths(
      applyLedgerUpsert(
        undefined,
        SUBJECT,
        upsert({ paths: [{ path: 'a.md', postSha256: null }] }),
      ),
      new Set(['a.md']),
      '2026-10-27T11:00:00.000Z',
    );
    expect(emptied.entries).toEqual([]);
    const next = applyLedgerUpsert(
      emptied,
      SUBJECT,
      upsert({ paths: [{ path: 'b.md', postSha256: null }], branch: null, head: null }),
    );
    expect(next).toMatchObject({ branch: null, head: null });
  });

  it('keeps the newest 50 operation ids and the true count', () => {
    let record: LedgerRecord | undefined;
    const ids: string[] = [];
    for (let index = 0; index < LEDGER_MAX_OPERATION_IDS + 5; index += 1) {
      const change = upsert({ paths: [{ path: 'a.md', postSha256: image(String(index)) }] });
      ids.push(change.operationId);
      record = applyLedgerUpsert(record, SUBJECT, change);
    }

    const [entry] = record!.entries;
    expect(entry!.operationIds).toEqual(ids.slice(-LEDGER_MAX_OPERATION_IDS));
    expect(entry!.operationCount).toBe(LEDGER_MAX_OPERATION_IDS + 5);
  });

  it('refuses a 201st distinct path before changing anything, but still updates a known one', () => {
    const paths = Array.from({ length: LEDGER_MAX_PATHS }, (_, index) => ({
      path: 'p/' + index + '.md',
      postSha256: image(String(index)),
    }));
    const full = applyLedgerUpsert(undefined, SUBJECT, upsert({ paths }));
    expect(full.entries).toHaveLength(LEDGER_MAX_PATHS);
    expect(() =>
      applyLedgerUpsert(
        full,
        SUBJECT,
        upsert({ paths: [{ path: 'one-more.md', postSha256: null }] }),
      ),
    ).toThrow(LedgerLimitError);
    expect(() =>
      applyLedgerUpsert(
        full,
        SUBJECT,
        upsert({
          paths: [
            { path: 'p/0.md', postSha256: image('changed') },
            { path: 'one-more.md', postSha256: null },
          ],
        }),
      ),
    ).toThrow(LedgerLimitError);
    const updated = applyLedgerUpsert(
      full,
      SUBJECT,
      upsert({ paths: [{ path: 'p/0.md', postSha256: image('changed') }] }),
    );
    expect(updated.entries.find((entry) => entry.path === 'p/0.md')?.postSha256).toBe(
      image('changed'),
    );
  });
});

describe('ledgerRevisionOf', () => {
  it('is stable for equal content in any order and changes with any entry', () => {
    const a = { path: 'a.md', postSha256: image('a') };
    const b = { path: 'b.md', postSha256: null };
    const revision = ledgerRevisionOf([a, b]);
    expect(ledgerRevisionOf([b, a])).toBe(revision);
    expect(ledgerRevisionOf([a])).not.toBe(revision);
    expect(ledgerRevisionOf([a, { ...b, postSha256: image('b') }])).not.toBe(revision);
    expect(ledgerRevisionOf([])).toBe(ledgerRevisionOf([]));
  });
});

describe('owners', () => {
  it('round-trips an owner through its file name stem', () => {
    for (const owner of [OWNER, { kind: 'definitions' } as const]) {
      expect(ledgerOwnerOfKey(ledgerOwnerKey(owner))).toEqual(owner);
    }

    expect(ledgerOwnerOfKey('specification-nope')).toBeUndefined();
    expect(ledgerOwnerOfKey('../etc')).toBeUndefined();
  });
});

describe('ledger store', () => {
  it('writes, reads and lists records; an emptied record leaves no file', async () => {
    const context = await fixture();
    const record = applyLedgerUpsert(
      undefined,
      SUBJECT,
      upsert({ paths: [{ path: 'specs/active/x/a.md', postSha256: image('a') }] }),
    );
    await writeLedgerRecord(context, record);
    expect(await readLedgerRecord(context, WORKSPACE_ID, OWNER)).toEqual(record);
    const listing = await listLedgerRecords(context);
    expect(listing.records).toEqual([record]);
    expect(listing.unreadable).toBe(0);
    expect((await listLedgerRecords(context, { workspaceId: randomUUID() })).records).toEqual([]);

    await writeLedgerRecord(
      context,
      removeLedgerPaths(record, new Set(['specs/active/x/a.md']), 'x'),
    );
    expect(await readLedgerRecord(context, WORKSPACE_ID, OWNER)).toBeUndefined();
    expect((await listLedgerRecords(context)).records).toEqual([]);
  });

  it('lists nothing when the ledger does not exist', async () => {
    expect(await listLedgerRecords(await fixture())).toEqual({
      records: [],
      unreadable: 0,
      truncated: false,
    });
  });

  it('fails closed on a corrupt record, and the tolerant listing counts it', async () => {
    const context = await fixture();
    const record = applyLedgerUpsert(
      undefined,
      SUBJECT,
      upsert({ paths: [{ path: 'a.md', postSha256: null }] }),
    );
    await writeLedgerRecord(context, record);
    await writeFile(ledgerPath(context, WORKSPACE_ID, OWNER), '{"version":1}');
    await expect(readLedgerRecord(context, WORKSPACE_ID, OWNER)).rejects.toBeInstanceOf(
      LedgerCorruptError,
    );
    const definitions = ledgerPath(context, WORKSPACE_ID, { kind: 'definitions' });
    await mkdir(join(definitions, '..'), { recursive: true });
    await writeFile(definitions, 'not json');
    const listing = await listLedgerRecords(context);
    expect(listing.records).toEqual([]);
    expect(listing.unreadable).toBe(2);
  });

  it('rejects a workspace id that is not a UUID instead of building a path from it', async () => {
    const context = await fixture();
    await expect(readLedgerRecord(context, '../../x', OWNER)).rejects.toBeInstanceOf(
      LedgerCorruptError,
    );
  });
});

describe('parseLedgerRecord', () => {
  const valid = applyLedgerUpsert(
    undefined,
    SUBJECT,
    upsert({ paths: [{ path: 'a/b.md', postSha256: image('b') }] }),
  );
  const parse = (value: unknown, key = ledgerOwnerKey(OWNER)): LedgerRecord =>
    parseLedgerRecord({ project: { projectId: PROJECT_ID } }, value, WORKSPACE_ID, key);

  it('accepts what the Engine writes', () => {
    expect(parse(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it.each([
    ['another project', { projectId: randomUUID() }],
    ['another checkout', { workspaceId: randomUUID() }],
    ['an unknown key', { extra: 1 }],
    ['a traversing path', { entries: [{ ...valid.entries[0], path: '../x' }] }],
    ['a backslash path', { entries: [{ ...valid.entries[0], path: 'a\\b' }] }],
    ['a duplicate path', { entries: [valid.entries[0], valid.entries[0]] }],
    ['an entry without operations', { entries: [{ ...valid.entries[0], operationIds: [] }] }],
    ['an unknown reason', { entries: [{ ...valid.entries[0], reason: 'whim' }] }],
    ['a count below the ids', { entries: [{ ...valid.entries[0], operationCount: 0 }] }],
    ['a bad head', { head: 'xyz' }],
  ])('rejects %s', (_name, patch) => {
    expect(() => parse({ ...valid, ...patch })).toThrow(LedgerCorruptError);
  });

  it('rejects an owner that differs from the file name', () => {
    expect(() => parse(valid, 'definitions')).toThrow(LedgerCorruptError);
  });
});

describe('encodeLedgerRecord', () => {
  it('writes the widest record the limits admit well below the file bound', () => {
    const entries = Array.from({ length: LEDGER_MAX_PATHS }, (_, index) => ({
      path: 'é'.repeat(1000) + String(index).padStart(24, '0'),
      postSha256: image(String(index)),
      operationIds: Array.from({ length: LEDGER_MAX_OPERATION_IDS }, () => randomUUID()),
      operationCount: 1000,
      recordedAt: '2026-10-27T10:00:00.000Z',
      reason: 'auto-commit-off' as const,
    }));
    const widest: LedgerRecord = {
      version: 1,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      workspaceRoot: 'é'.repeat(1024),
      owner: OWNER,
      branch: 'b'.repeat(LEDGER_BRANCH_MAX_CHARACTERS),
      head: HEAD,
      createdAt: '2026-10-27T10:00:00.000Z',
      updatedAt: '2026-10-27T10:00:00.000Z',
      entries,
    };

    const text = encodeLedgerRecord({ project: { projectId: PROJECT_ID } }, widest);

    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(LEDGER_MAX_BYTES / 1.5);
  });
});
