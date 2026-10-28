import { describe, expect, it } from 'vitest';

import { folderRevisionOf } from './folder-revision';

const manifest = {
  documents: [
    { id: 'a-1', path: 'docs/a.md', type: 'notes' },
    { id: 'other', path: 'misc/o.md', type: 'notes' },
  ],
  folders: ['docs/empty'],
};
const files = [
  { path: 'docs/a.md', revision: 'r1' },
  { path: 'docs/b.md', revision: 'r2' },
  { path: 'misc/o.md', revision: 'r3' },
];

describe('folderRevisionOf', () => {
  it('is stable and independent of the order of its inputs', () => {
    const first = folderRevisionOf('docs', files, manifest);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(folderRevisionOf('docs', [...files].reverse(), manifest)).toBe(first);
  });

  it('changes with a file revision, a registry entry or an explicit folder under it, not with others', () => {
    const base = folderRevisionOf('docs', files, manifest);
    const edited = [{ ...files[0]!, revision: 'x' }, ...files.slice(1)];
    expect(folderRevisionOf('docs', edited, manifest)).not.toBe(base);
    const retyped = {
      ...manifest,
      documents: [{ id: 'a-1', path: 'docs/a.md', type: 'plan' }, manifest.documents[1]!],
    };
    expect(folderRevisionOf('docs', files, retyped)).not.toBe(base);
    expect(folderRevisionOf('docs', files, { ...manifest, folders: [] })).not.toBe(base);
    const elsewhere = [files[0]!, files[1]!, { path: 'misc/o.md', revision: 'zzz' }];
    expect(folderRevisionOf('docs', elsewhere, manifest)).toBe(base);
  });

  it('does not treat a sibling with the same prefix as part of the folder', () => {
    const lookalike = [...files, { path: 'docs-old/c.md', revision: 'r9' }];
    expect(folderRevisionOf('docs', lookalike, manifest)).toBe(
      folderRevisionOf('docs', files, manifest),
    );
  });
});
