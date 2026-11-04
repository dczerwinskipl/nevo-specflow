import { describe, expect, it } from 'vitest';
import { entryOriginKey, entryResultKey, resolveEntry, type InlineEntry } from './inlineEntry';

const entry = (overrides: Partial<InlineEntry>): InlineEntry => ({
  key: 'k',
  kind: 'document',
  parent: '',
  name: '',
  ...overrides,
});

describe('resolveEntry', () => {
  it('cancels an empty or blank name', () => {
    expect(resolveEntry(entry({ name: '' }))).toEqual({ type: 'cancel' });
    expect(resolveEntry(entry({ name: '   ' }))).toEqual({ type: 'cancel' });
  });

  it('reports an invalid name with its message', () => {
    expect(resolveEntry(entry({ name: 'a/b' }))).toEqual({
      type: 'invalid',
      message: { key: 'documents.tree.nameError.characters' },
    });
  });

  it('submits a new document with the default extension', () => {
    expect(resolveEntry(entry({ name: ' notes ' }))).toEqual({
      type: 'submit',
      finalName: 'notes.md',
    });
  });

  it('keeps a folder name as typed', () => {
    expect(resolveEntry(entry({ kind: 'folder', name: 'docs' }))).toEqual({
      type: 'submit',
      finalName: 'docs',
    });
  });

  it('treats an unchanged rename as a cancel', () => {
    const rename = { id: 'd1', path: 'docs/a.txt' };
    expect(resolveEntry(entry({ rename, name: 'a.txt' }))).toEqual({ type: 'cancel' });
    // The extension is kept when omitted, so this is unchanged too.
    expect(resolveEntry(entry({ rename, name: 'a' }))).toEqual({ type: 'cancel' });
    expect(resolveEntry(entry({ rename, name: 'c' }))).toEqual({
      type: 'submit',
      finalName: 'c.txt',
    });
    expect(resolveEntry(entry({ rename, name: 'b.txt' }))).toEqual({
      type: 'submit',
      finalName: 'b.txt',
    });
  });
});

describe('focus keys', () => {
  it('returns to the row the entry started from', () => {
    expect(entryOriginKey(entry({ parent: 'docs' }))).toBe('folder:docs');
    expect(entryOriginKey(entry({ rename: { id: 'd1', path: 'docs/a.md' } }))).toBe('doc:d1');
    expect(entryOriginKey(entry({ kind: 'folder', rename: { path: 'docs/sub' } }))).toBe(
      'folder:docs/sub',
    );
  });

  it('moves to the applied entry', () => {
    expect(entryResultKey(entry({ kind: 'folder', parent: 'docs' }), 'new')).toBe(
      'folder:docs/new',
    );
    expect(entryResultKey(entry({ rename: { id: 'd1', path: 'a.md' } }), 'b.md')).toBe('doc:d1');
    expect(entryResultKey(entry({ parent: 'docs' }), 'b.md')).toBe('folder:docs');
  });
});
