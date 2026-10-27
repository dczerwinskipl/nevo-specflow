// Linux-only integration (real Git project, real files, symlinks, many files): the documents reader: the revision memos.
import { utimes, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  ObservationMemoValue,
  SummaryMemoValue,
} from '../../src/specs/documents/read-options';
import { readRegisteredDocumentSummaries } from '../../src/specs/documents/summaries';
import { readSpecificationDocument } from '../../src/specs/documents/document-reader';
import { readSpecificationDocumentTree } from '../../src/specs/documents/tree-reader';
import { RevisionMemo } from '../../src/specs/documents/revision-memo';
import { nodeVerifiedFs, type VerifiedFs } from '../../src/specs/document-rules/verified-file';
import {
  documentsProject,
  handBuiltSpecification,
  removeTrackedRoots,
} from '../support/documents-fixture';

afterEach(removeTrackedRoots);

const project = documentsProject;
const handBuilt = handBuiltSpecification;

describe('revision memo', () => {
  function counting(): { fs: VerifiedFs; opens: string[] } {
    const opens: string[] = [];
    return {
      opens,
      fs: {
        ...nodeVerifiedFs,
        open: (path, flags) => {
          opens.push(path);
          return nodeVerifiedFs.open(path, flags);
        },
      },
    };
  }

  it('answers the workspace documents section from a memo for unchanged old files', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { files: { 'overview.md': '# o\n', 'old.md': 'old' } });
    const clock = Date.now();
    const now = () => clock;
    const old = new Date(clock - 60_000);
    await utimes(join(hand.dir, 'old.md'), old, old);
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const summaryMemo = new RevisionMemo<SummaryMemoValue>(100);
    const { fs, opens } = counting();
    const first = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
      now,
    });
    opens.length = 0;
    const second = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
      now,
    });
    expect(opens.map((path) => basename(path))).toEqual(['specification.yaml']);
    expect(second).toEqual(first);

    // A changed file is a new key and is read again.
    await writeFile(join(hand.dir, 'overview.md'), '# changed title\n');
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const third = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, {
      fs,
      summaryMemo,
      now,
    });
    expect(third.find((item) => item.id === 'overview')?.title).toBe('changed title');
  }, 240000);

  it('does not reopen an unchanged old file, and does not memoise a file written just now', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { files: { 'overview.md': '# o\n', 'old.md': 'old' } });
    const clock = Date.now();
    const now = () => clock;
    const old = new Date(clock - 60_000);
    await utimes(join(hand.dir, 'old.md'), old, old);
    await utimes(join(hand.dir, 'overview.md'), old, old);
    const memo = new RevisionMemo<ObservationMemoValue>(100);
    const { fs, opens } = counting();
    const first = await readSpecificationDocumentTree(fixture.engine, hand.specId, {
      fs,
      memo,
      now,
    });
    const opensFirst = opens.length;
    expect(opensFirst).toBeGreaterThanOrEqual(3); // manifest + two documents
    opens.length = 0;
    const second = await readSpecificationDocumentTree(fixture.engine, hand.specId, {
      fs,
      memo,
      now,
    });
    // Only the manifest is opened again.
    expect(opens.map((path) => basename(path))).toEqual(['specification.yaml']);
    expect(second).toEqual(first);

    // A file changed within the memo key is a new key: its size changed, so it is re-analysed.
    await writeFile(join(hand.dir, 'old.md'), 'longer content');
    await utimes(join(hand.dir, 'old.md'), old, old);
    opens.length = 0;
    const third = await readSpecificationDocumentTree(fixture.engine, hand.specId, {
      fs,
      memo,
      now,
    });
    expect(opens.some((path) => path.endsWith('old.md'))).toBe(true);
    expect(third.revision).not.toBe(second.revision);

    // Written just now: never memoised, so every read opens it.
    await writeFile(join(hand.dir, 'fresh.md'), 'fresh');
    await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo, now });
    opens.length = 0;
    await readSpecificationDocumentTree(fixture.engine, hand.specId, { fs, memo, now });
    expect(opens.some((path) => path.endsWith('fresh.md'))).toBe(true);
  }, 240000);

  it('does not serve a stale entry for a same-size rewrite whose mtime was restored', async () => {
    const fixture = await project();
    const hand = await handBuilt(fixture, { files: { 'overview.md': '# Aaa\n' } });
    const clock = Date.now();
    const now = () => clock;
    const old = new Date(clock - 60_000);
    const file = join(hand.dir, 'overview.md');
    await utimes(file, old, old);
    const memo = new RevisionMemo<ObservationMemoValue>(100);
    const summaryMemo = new RevisionMemo<SummaryMemoValue>(100);
    const read = { memo, summaryMemo, now };
    const before = await readSpecificationDocumentTree(fixture.engine, hand.specId, read);
    const titleBefore = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, read);
    expect(titleBefore[0]?.title).toBe('Aaa');

    // Same size, same inode (truncate in place), same restored mtime: only the ctime moved.
    await writeFile(file, '# Bbb\n');
    await utimes(file, old, old);

    const after = await readSpecificationDocumentTree(fixture.engine, hand.specId, read);
    expect(after.revision).not.toBe(before.revision);
    const titleAfter = await readRegisteredDocumentSummaries(fixture.engine, hand.specId, read);
    expect(titleAfter[0]?.title).toBe('Bbb');
    expect(titleAfter[0]?.revision).not.toBe(titleBefore[0]?.revision);
    const document = await readSpecificationDocument(fixture.engine, hand.specId, 'overview', read);
    expect(document.content).toBe('# Bbb\n');
  }, 240000);
});
