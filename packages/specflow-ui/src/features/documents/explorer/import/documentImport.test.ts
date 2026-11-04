import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import { importLimits, planImport } from './documentImport';

const available = { available: true };
const tree = {
  documents: [{ id: 'd1', path: 'docs/exists.md' }],
  folders: [{ path: 'docs/folder' }],
  capabilities: {
    createFile: available,
    createFolder: available,
    import: available,
    formats: ['md', 'txt'],
  },
} as unknown as Pick<DocumentTree, 'documents' | 'folders' | 'capabilities'>;

const file = (name: string, content = 'text') => new File([content], name);
const reasons = (plan: Awaited<ReturnType<typeof planImport>>) =>
  plan.skipped.map((entry) => [entry.name, entry.reason.key]);

describe('planImport', () => {
  it('accepts supported text files', async () => {
    const plan = await planImport([file('Notes.md', '# A'), file('b.txt')], 'docs', tree);
    expect(plan.accepted).toEqual([
      { path: 'docs/Notes.md', content: '# A' },
      { path: 'docs/b.txt', content: 'text' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('keeps accepted files when others are rejected, one reason per file', async () => {
    const plan = await planImport(
      [
        file('ok.md'),
        file('.hidden.md'),
        file('image.png'),
        file('exists.md'),
        file('folder'),
        file('ok.md'),
      ],
      'docs',
      tree,
    );
    expect(plan.accepted.map((doc) => doc.path)).toEqual(['docs/ok.md']);
    expect(reasons(plan)).toEqual([
      ['.hidden.md', 'documents.tree.nameReason.dot'],
      ['image.png', 'documents.tree.skip.format'],
      ['exists.md', 'documents.tree.skip.exists'],
      ['folder', 'documents.tree.skip.format'],
      ['ok.md', 'documents.tree.skip.exists'],
    ]);
  });

  it('compares paths case-insensitively against the tree and the batch', async () => {
    const plan = await planImport(
      [file('EXISTS.md'), file('Same.md'), file('same.MD')],
      'docs',
      tree,
    );
    expect(reasons(plan)).toEqual([
      ['EXISTS.md', 'documents.tree.skip.exists'],
      ['same.MD', 'documents.tree.skip.exists'],
    ]);
  });

  it('limits a batch to ten files, counting rejected ones', async () => {
    const files = Array.from({ length: importLimits.files + 2 }, (_, index) =>
      file(`f${index}.md`),
    );
    const plan = await planImport(files, '', tree);
    expect(plan.accepted).toHaveLength(importLimits.files);
    expect(reasons(plan)).toEqual([
      ['f10.md', 'documents.tree.skip.limit'],
      ['f11.md', 'documents.tree.skip.limit'],
    ]);
  });

  it('rejects oversize files, long content and non-UTF-8 content', async () => {
    const big = file('big.md');
    Object.defineProperty(big, 'size', { value: importLimits.fileBytes + 1 });
    const plan = await planImport(
      [
        big,
        file('long.md', 'a'.repeat(importLimits.contentCharacters + 1)),
        new File([new Uint8Array([0xff, 0xfe, 0xfd])], 'binary.md'),
      ],
      '',
      tree,
    );
    expect(plan.accepted).toEqual([]);
    expect(reasons(plan).map(([, key]) => key)).toEqual([
      'documents.tree.skip.size',
      'documents.tree.skip.content',
      'documents.tree.skip.utf8',
    ]);
  });

  it('rejects a path longer than the limit', async () => {
    const plan = await planImport([file('deep.md')], 'f'.repeat(importLimits.pathCharacters), tree);
    expect(reasons(plan)).toEqual([['deep.md', 'documents.tree.skip.path']]);
  });
});
