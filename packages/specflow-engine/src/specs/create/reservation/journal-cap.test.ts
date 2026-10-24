import { describe, expect, it } from 'vitest';

import { assertJournalFitsItsCap } from './journal-cap';
import type { CreateJournal } from '../journal';

function record(parts: {
  goal?: string;
  paths?: readonly string[];
  folders?: readonly string[];
  documents?: number;
}): CreateJournal {
  const paths = parts.paths ?? [];
  return {
    goal: parts.goal,
    requestIntent: {
      goal: parts.goal,
      addedDocuments: paths.map((path) => ({ path, sha256: '0'.repeat(64), bytes: 1 })),
      folders: parts.folders ?? [],
    },
    files: paths.map((path) => ({ relativePath: path, sha256: '0'.repeat(64), bytes: 1 })),
    documentIds: Array.from({ length: parts.documents ?? 0 }, (_, i) => `u-${i}`),
  } as unknown as CreateJournal;
}

function messageOf(journal: CreateJournal): string {
  try {
    assertJournalFitsItsCap(journal);
  } catch (error) {
    expect(error).toMatchObject({ code: 'DOCUMENT_OPERATION_INVALID' });
    return (error as Error).message;
  }
  throw new Error('Expected the journal to be refused.');
}

describe('assertJournalFitsItsCap', () => {
  it('accepts a small journal', () => {
    expect(() => assertJournalFitsItsCap(record({ paths: ['a.md'] }))).not.toThrow();
  });

  it('names the goal, not the paths, when the goal is the cause', () => {
    const message = messageOf(record({ goal: 'g'.repeat(70_000), paths: ['a.md'] }));
    expect(message).toMatch(/too large to be recorded durably/u);
    expect(message).toMatch(/goal/u);
    expect(message).not.toMatch(/paths/u);
  });

  it('names the paths when long paths are the cause', () => {
    const paths = Array.from({ length: 300 }, (_, i) => 'p'.repeat(190) + i + '.md');
    expect(messageOf(record({ paths }))).toMatch(/paths/u);
  });

  it('names the documents when their number is the cause', () => {
    const paths = Array.from({ length: 2000 }, (_, i) => `d${i}.md`);
    expect(messageOf(record({ paths }))).toMatch(/documents/u);
  });
});
