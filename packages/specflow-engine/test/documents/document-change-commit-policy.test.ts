import { describe, expect, it } from 'vitest';

import {
  classifyDocumentPath,
  cutIdsAtBoundaries,
  decideReplay,
  idsOfTrailerValue,
  isNonBlobState,
  splitEffectivePaths,
  TRAILER_VALUE_LIMIT,
} from '../../src/version-control/commits/document-change';
import {
  chunkPaths,
  READ_CHUNK_CHARS,
  READ_CHUNK_PATHS,
  readPathFacts,
  type GitReader,
} from '../../src/version-control/commits/path-facts';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

describe('cutIdsAtBoundaries', () => {
  const ids = Array.from(
    { length: 30 },
    (_, i) => `doc-${String(i).padStart(3, '0')}-${'x'.repeat(12)}`,
  );

  it('keeps everything that fits', () => {
    expect(cutIdsAtBoundaries(ids.slice(0, 3))).toBe(ids.slice(0, 3).join(','));
    expect(cutIdsAtBoundaries([])).toBe('');
  });

  it('cuts at an id boundary, never mid-id, and counts what was left out', () => {
    const value = cutIdsAtBoundaries(ids);
    expect(value.length).toBeLessThanOrEqual(TRAILER_VALUE_LIMIT);
    const parts = value.split(',');
    const count = Number(parts.pop()!.slice(1));
    expect(parts.every((part) => ids.includes(part))).toBe(true);
    expect(parts.length + count).toBe(ids.length);
    // maximal: one more id would not fit
    const next = [...parts, ids[parts.length]!, `+${count - 1}`].join(',');
    expect(next.length).toBeGreaterThan(TRAILER_VALUE_LIMIT);
  });

  it('drops an id that alone exceeds the limit', () => {
    expect(cutIdsAtBoundaries(['y'.repeat(300), 'z'], 20)).toBe('+2');
    expect(cutIdsAtBoundaries(['short', 'y'.repeat(300)], 20)).toBe('short,+1');
  });

  it('reads the ids back without the count', () => {
    expect(idsOfTrailerValue('one,two,+5')).toEqual(['one', 'two']);
    expect(idsOfTrailerValue('one two')).toEqual(['one', 'two']);
  });
});

describe('classifyDocumentPath and replay', () => {
  const expectation = { path: 'p', pre: A, post: B };

  it('classifies each state', () => {
    expect(classifyDocumentPath({ path: 'p', working: B, head: B }, expectation)).toBe('committed');
    expect(classifyDocumentPath({ path: 'p', working: B, head: A }, expectation)).toBe('at-post');
    expect(classifyDocumentPath({ path: 'p', working: A, head: A }, expectation)).toBe('at-pre');
    expect(classifyDocumentPath({ path: 'p', working: C, head: A }, expectation)).toBe('foreign');
  });

  it('treats absence as a state: create, delete', () => {
    const created = { path: 'n', pre: null, post: A };
    expect(classifyDocumentPath({ path: 'n', working: null, head: null }, created)).toBe('at-pre');
    expect(classifyDocumentPath({ path: 'n', working: A, head: null }, created)).toBe('at-post');
    const deleted = { path: 'd', pre: A, post: null };
    expect(classifyDocumentPath({ path: 'd', working: null, head: A }, deleted)).toBe('at-post');
    expect(classifyDocumentPath({ path: 'd', working: null, head: null }, deleted)).toBe(
      'committed',
    );
    expect(classifyDocumentPath({ path: 'd', working: C, head: A }, deleted)).toBe('foreign');
  });

  it('decides the replay per batch', () => {
    expect(decideReplay(['committed', 'committed'])).toBe('done');
    expect(decideReplay(['at-pre', 'at-post'])).toBe('pending');
    expect(decideReplay(['committed', 'at-post'])).toBe('recovery-required');
    expect(decideReplay(['at-pre', 'foreign'])).toBe('recovery-required');
  });
});

describe('effective path set over a fake Git reader', () => {
  function fakeRun(
    blobs: Record<string, string>,
    headBlobs: Record<string, string>,
    headTrees: readonly string[] = [],
  ) {
    const calls: string[][] = [];
    const run: GitReader = (_root, args) => {
      calls.push([...args]);
      if (args.includes('hash-object')) {
        const paths = args.slice(args.indexOf('--') + 1);
        const stdout = paths.map((p) => blobs[p]).join('\n') + '\n';
        return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
      }
      if (args[0] === 'ls-tree') {
        const asked = args
          .slice(args.indexOf('--') + 1)
          .map((spec) => spec.replace(':(literal)', ''));
        const records = asked.flatMap((p) =>
          headBlobs[p] !== undefined
            ? [`100644 blob ${headBlobs[p]}\t${p}`]
            : headTrees.includes(p)
              ? [`040000 tree ${A}\t${p}`]
              : [],
        );
        const stdout = records.map((record) => record + '\0').join('');
        return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
      }
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
    };
    return { run, calls };
  }

  it('drops paths equal to HEAD, keeps changed, new and deleted ones', async () => {
    const { run, calls } = fakeRun(
      { 'same.md': A, 'changed.md': B, 'new.md': C },
      { 'same.md': A, 'changed.md': A, 'gone.md': A },
    );
    const facts = await readPathFacts(
      {
        run,
        exists: (p) => Promise.resolve(!p.endsWith('gone.md') && !p.endsWith('never.md')),
        exactBytes: [],
      },
      '/repo',
      ['same.md', 'changed.md', 'new.md', 'gone.md', 'never.md'],
    );
    expect(splitEffectivePaths(facts)).toEqual({
      effective: ['changed.md', 'new.md', 'gone.md'],
      dropped: ['same.md', 'never.md'],
    });
    // hash-object never sees an absent path (it fails with exit 128 there)
    const hashCall = calls.find((c) => c.includes('hash-object'))!;
    expect(hashCall.slice(hashCall.indexOf('--') + 1)).toEqual(['same.md', 'changed.md', 'new.md']);
    // a deletion is a path the listing of the commit does not name, all paths in one process
    expect(calls.filter((c) => c[0] === 'ls-tree')).toHaveLength(1);
  });

  it('reads another commit when asked', async () => {
    const { run, calls } = fakeRun({}, {});
    await readPathFacts(
      { run, exists: () => Promise.resolve(false), exactBytes: [] },
      '/r',
      ['x.md'],
      'f'.repeat(40),
    );
    expect(calls.find((c) => c[0] === 'ls-tree')).toContain('f'.repeat(40));
  });

  it('reads a directory where a document is expected as a state that is neither absent nor a blob', async () => {
    const { run } = fakeRun({ 'docs/was-a-dir': B }, {}, ['docs/was-a-dir']);
    const facts = await readPathFacts(
      {
        run,
        entry: (p) => Promise.resolve(p.endsWith('now-a-dir') ? 'other' : 'file'),
        exactBytes: [],
      },
      '/r',
      ['docs/was-a-dir', 'docs/now-a-dir'],
    );
    expect(isNonBlobState(facts[0]!.head)).toBe(true);
    expect(isNonBlobState(facts[1]!.working)).toBe(true);
    // never equal to a blob id, so it classifies as foreign
    expect(classifyDocumentPath(facts[0]!, { path: 'docs/was-a-dir', pre: A, post: C })).toBe(
      'foreign',
    );
  });

  it('never names more than the chunk bound of paths in one Git process', async () => {
    const paths = Array.from({ length: 450 }, (_, i) => `docs/${'d'.repeat(150)}-${i}.md`);
    const blobs = Object.fromEntries(paths.map((p) => [p, B]));
    const { run, calls } = fakeRun(blobs, {});
    await readPathFacts({ run, exists: () => Promise.resolve(true), exactBytes: [] }, '/r', paths);
    const hashCalls = calls.filter((c) => c.includes('hash-object'));
    expect(hashCalls.length).toBeGreaterThan(4);
    for (const call of calls) {
      expect(call.length).toBeLessThanOrEqual(READ_CHUNK_PATHS + 8);
      expect(call.join(' ').length).toBeLessThanOrEqual(
        READ_CHUNK_CHARS + READ_CHUNK_PATHS * 10 + 200,
      );
    }
    expect(chunkPaths(paths).flat()).toEqual(paths);
  });

  it('fails on an answer it cannot interpret', async () => {
    const run: GitReader = () => Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal' });
    await expect(
      readPathFacts({ run, exists: () => Promise.resolve(false), exactBytes: [] }, '/r', ['x.md']),
    ).rejects.toThrow();
  });
});
