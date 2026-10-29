import { describe, expect, it } from 'vitest';
import { documentKindOf, documentViewOf } from './documentContentKinds';

const text = { kind: 'text' as const, content: '# Title' };

describe('document content kinds', () => {
  it('opens markdown of an archived specification (not editable) as a preview, never as raw source', () => {
    // The archived-shell seed: overview.md is text the Runtime reports as not editable.
    const kind = documentKindOf({ path: 'overview.md', ...text, editable: false });
    expect(kind.id).toBe('markdown');
    expect(documentViewOf(kind, { editing: true }, true)).toBe('preview');
  });

  it('opens non-markdown text that cannot be edited as read-only source (whitespace kept)', () => {
    const kind = documentKindOf({ path: 'traces/replay.json', ...text, editable: false });
    expect(kind.id).toBe('text');
    expect(documentViewOf(kind, { editing: false }, true)).toBe('source');
  });

  it('keeps editable markdown with Preview and Edit, and plain text with its editor', () => {
    expect(documentKindOf({ path: 'ux.md', ...text, editable: true }).views).toEqual([
      'preview',
      'edit',
    ]);
    expect(documentKindOf({ path: 'notes.txt', ...text, editable: true }).id).toBe('text');
  });

  it('opens images, binary files and text above the read limit with their own views', () => {
    expect(documentKindOf({ path: 'a.png', kind: 'image' }).id).toBe('image');
    expect(documentKindOf({ path: 'a.bin', kind: 'binary' }).id).toBe('file');
    expect(documentKindOf({ path: 'huge.md', kind: 'text' }).id).toBe('file');
  });
});
