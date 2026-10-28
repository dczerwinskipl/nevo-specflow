import { describe, expect, it } from 'vitest';

import { DocumentError } from '../../../document-rules';
import { sha256Hex } from '../../../../hash';
import { DOCUMENT_BATCH_MAX_OPERATIONS, DOCUMENT_BATCH_MAX_PATHS } from '../limits';
import type { DocumentChangePlan, FileState } from '../plan/model';
import {
  TEST_BATCH_ID,
  TEST_CONTEXT,
  TEST_EXECUTOR,
  TEST_HEAD,
  TEST_NOW,
  TEST_PROJECT_ID,
  TEST_SLUG,
  TEST_SPEC_ID,
  TEST_WORKSPACE_ID,
} from '../test-support';
import {
  decodeBatchPaths,
  encodeBatchPaths,
  encodeDocumentBatchRecord,
  mergeBatchPaths,
  parseDocumentBatchRecord,
  type DocumentBatchRecord,
} from './batch';
import {
  encodeDocumentQueueLease,
  parseDocumentQueueLease,
  type DocumentQueueLease,
} from './lease';
import type { DocumentBatchState } from './stages';

const state = (content: string): FileState => ({
  sha256: sha256Hex(content),
  bytes: Buffer.byteLength(content, 'utf8'),
});
const DIR = `specs/active/${TEST_SLUG}/`;

function plan(paths: [string, FileState, FileState][]): DocumentChangePlan {
  return {
    version: 1,
    action: 'save',
    specId: TEST_SPEC_ID,
    slug: TEST_SLUG,
    directory: DIR.slice(0, -1),
    paths: paths.map(([path, pre, post]) => ({
      path: DIR + path,
      role: 'document',
      pre,
      post,
      source: post === null ? { kind: 'none' } : { kind: 'payload' },
    })),
    documents: [],
    removedDocumentIds: [],
    folders: [],
    allocatedIds: [],
    templates: [],
  };
}

function record(
  batchState: DocumentBatchState,
  overrides: Record<string, unknown> = {},
): DocumentBatchRecord {
  const claimed = batchState !== 'formed';
  return {
    version: 1,
    projectId: TEST_PROJECT_ID,
    operationId: TEST_BATCH_ID,
    workspaceId: TEST_WORKSPACE_ID,
    workspaceRoot: '/work/checkout',
    specId: TEST_SPEC_ID,
    slug: TEST_SLUG,
    state: batchState,
    memberIds: [TEST_BATCH_ID, '4f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c35'],
    paths: { sha256: 'e'.repeat(64), bytes: 300, pathCount: 2 },
    branch: 'main',
    ...(claimed ? { parentHead: TEST_HEAD } : {}),
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    attempts: 0,
    ...(batchState === 'committing' ? { executor: TEST_EXECUTOR } : {}),
    ...(batchState === 'committed' ? { sha: 'b'.repeat(40) } : {}),
    ...(batchState === 'failed' || batchState === 'recovery-required'
      ? { reason: 'content-changed' }
      : {}),
    ...overrides,
  } as unknown as DocumentBatchRecord;
}

describe('batch record', () => {
  it.each([
    'formed',
    'committing',
    'committed',
    'failed',
    'recovery-required',
    'dissolved',
  ] as const)('round-trips a %s batch', (batchState) => {
    const value = record(batchState);
    const text = encodeDocumentBatchRecord(TEST_CONTEXT, value);
    expect(parseDocumentBatchRecord(TEST_CONTEXT, JSON.parse(text), TEST_BATCH_ID)).toEqual(value);
  });

  it('records when the commit was started, once the batch is claimed', () => {
    for (const batchState of ['committing', 'committed', 'failed', 'recovery-required'] as const) {
      const value = record(batchState, { commitStartedAt: TEST_NOW });
      const text = encodeDocumentBatchRecord(TEST_CONTEXT, value);
      expect(parseDocumentBatchRecord(TEST_CONTEXT, JSON.parse(text), TEST_BATCH_ID)).toEqual(
        value,
      );
    }
  });

  it('rejects what does not fit the state or the caps', () => {
    const bad: unknown[] = [
      { ...record('committing'), extra: 1 },
      { ...record('committing'), version: 2 },
      { ...record('formed'), parentHead: TEST_HEAD },
      { ...record('committing'), parentHead: undefined },
      { ...record('committing'), executor: undefined },
      { ...record('failed'), executor: TEST_EXECUTOR },
      { ...record('committed'), sha: undefined },
      { ...record('formed'), commitStartedAt: TEST_NOW },
      { ...record('committing'), commitStartedAt: 'yesterday-ish' },
      { ...record('failed'), reason: undefined },
      { ...record('committing'), memberIds: [] },
      { ...record('committing'), memberIds: ['4f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c35'] },
      { ...record('committing'), memberIds: [TEST_BATCH_ID, TEST_BATCH_ID] },
      {
        ...record('committing'),
        memberIds: Array.from({ length: DOCUMENT_BATCH_MAX_OPERATIONS + 1 }, (_, i) =>
          i === 0 ? TEST_BATCH_ID : `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      },
      { ...record('committing'), paths: { sha256: 'e'.repeat(64), bytes: 1, pathCount: 0 } },
      {
        ...record('committing'),
        paths: { sha256: 'e'.repeat(64), bytes: 1, pathCount: DOCUMENT_BATCH_MAX_PATHS + 1 },
      },
    ];
    for (const value of bad) {
      expect(() => parseDocumentBatchRecord(TEST_CONTEXT, value, TEST_BATCH_ID)).toThrow(
        DocumentError,
      );
    }
  });

  it('keeps a full batch far below the 64 KiB cap because paths live in a plan file', () => {
    const members = Array.from({ length: DOCUMENT_BATCH_MAX_OPERATIONS }, (_, i) =>
      i === 0 ? TEST_BATCH_ID : `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const text = encodeDocumentBatchRecord(
      TEST_CONTEXT,
      record('committing', { memberIds: members, workspaceRoot: 'w'.repeat(1024) }),
    );
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(8 * 1024);
  });
});

describe('batch paths', () => {
  it('merges member plans in order: first pre, last post, first appearance order', () => {
    const merged = mergeBatchPaths([
      plan([
        ['a.md', state('0'), state('1')],
        ['b.md', null, state('b')],
      ]),
      plan([['a.md', state('1'), state('2')]]),
      plan([
        ['b.md', state('b'), null],
        ['c.md', state('c'), state('d')],
      ]),
    ]);
    expect(merged).toEqual([
      { path: DIR + 'a.md', pre: state('0'), post: state('2') },
      { path: DIR + 'b.md', pre: null, post: null },
      { path: DIR + 'c.md', pre: state('c'), post: state('d') },
    ]);
  });

  it('refuses a merge over the path cap', () => {
    const many = (count: number) =>
      plan(
        Array.from({ length: count }, (_, i): [string, FileState, FileState] => [
          `f${i}.md`,
          null,
          state('x'),
        ]),
      );
    expect(mergeBatchPaths([many(DOCUMENT_BATCH_MAX_PATHS)])).toHaveLength(
      DOCUMENT_BATCH_MAX_PATHS,
    );
    expect(() =>
      mergeBatchPaths([many(DOCUMENT_BATCH_MAX_PATHS), plan([['extra.md', null, state('x')]])]),
    ).toThrow(DocumentError);
  });

  it('encodes hash-addressed and decodes strictly', () => {
    const paths = mergeBatchPaths([plan([['a.md', state('0'), state('1')]])]);
    const encoded = encodeBatchPaths(paths);
    expect(encoded.sha256).toBe(sha256Hex(encoded.text));
    expect(encoded.pathCount).toBe(1);
    expect(decodeBatchPaths(encoded.text)).toEqual(paths);
    for (const text of [
      'nope',
      JSON.stringify({ version: 2, paths: [] }),
      JSON.stringify({ version: 1, paths: [] }),
      encoded.text.replace('a.md', '../a.md'),
      encoded.text.replace('"bytes":1', '"bytes":1,"x":1'),
    ]) {
      expect(() => decodeBatchPaths(text)).toThrow(DocumentError);
    }
  });
});

describe('queue lease', () => {
  const lease: DocumentQueueLease = {
    version: 1,
    projectId: TEST_PROJECT_ID,
    workspaceId: TEST_WORKSPACE_ID,
    executor: TEST_EXECUTOR,
    batchId: TEST_BATCH_ID,
    acquiredAt: TEST_NOW,
  };

  it('round-trips and is keyed by its checkout', () => {
    const text = encodeDocumentQueueLease(TEST_CONTEXT, lease);
    expect(parseDocumentQueueLease(TEST_CONTEXT, JSON.parse(text), TEST_WORKSPACE_ID)).toEqual(
      lease,
    );
    expect(() =>
      parseDocumentQueueLease(
        TEST_CONTEXT,
        JSON.parse(text),
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toThrow(DocumentError);
  });

  it('accepts an executor that cannot be proven dead (no /proc facts) and rejects a malformed one', () => {
    const threaded = { ...lease, executor: { pid: 1, hostId: 'h', threadId: 4 } };
    expect(
      parseDocumentQueueLease(TEST_CONTEXT, threaded, TEST_WORKSPACE_ID).executor.threadId,
    ).toBe(4);
    const bare = { ...lease, executor: { pid: 1, hostId: 'h' } };
    expect(parseDocumentQueueLease(TEST_CONTEXT, bare, TEST_WORKSPACE_ID).executor.pid).toBe(1);
    for (const executor of [
      { pid: 0, hostId: 'h' },
      { pid: 1 },
      { pid: 1, hostId: 'h', extra: 1 },
      { pid: 1, hostId: 'h', threadId: -1 },
      { pid: 1, hostId: 'h', threadId: 1.5 },
    ]) {
      expect(() =>
        parseDocumentQueueLease(TEST_CONTEXT, { ...lease, executor }, TEST_WORKSPACE_ID),
      ).toThrow(DocumentError);
    }
  });
});
