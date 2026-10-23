import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentDraftStore,
  documentDraftKey,
  parseDocumentDraftKey,
  reconcileSavedDraft,
  type DocumentDraft,
} from './documentDraftStore';

const draft = (content: string, baseline = 'base'): DocumentDraft => ({
  content,
  baseline,
  revision: '1',
  editing: false,
});

describe('document draft keys', () => {
  it('round-trips ids containing separators', () => {
    const key = documentDraftKey('spec:1/x', 'a:b/c.md');
    expect(parseDocumentDraftKey(key)).toEqual({ specId: 'spec:1/x', documentId: 'a:b/c.md' });
  });
});

describe('dirty documents', () => {
  it('advances a draft incarnation on removal but not on edits', () => {
    const store = createDocumentDraftStore();
    expect(store.incarnation('s', 'a')).toBe(0);
    store.set('s', 'a', draft('one'));
    store.patch('s', 'a', { content: 'two' }, () => draft('one'));
    expect(store.incarnation('s', 'a')).toBe(0);
    store.remove('s', 'a');
    store.set('s', 'a', draft('three'));
    expect(store.incarnation('s', 'a')).toBe(1);
  });
  it('lists drafts of one spec whose content differs from the baseline', () => {
    const store = createDocumentDraftStore();
    store.set('s', 'a', draft('base'));
    store.set('s', 'b', draft('changed'));
    store.set('other', 'c', draft('changed'));
    expect(store.dirtyIds('s')).toEqual(['b']);
    store.patch('s', 'a', { content: 'x' }, () => draft('base'));
    expect(store.dirtyIds('s')).toEqual(['a', 'b']);
    store.patch('s', 'a', { content: 'base' }, () => draft('base'));
    expect(store.dirtyIds('s')).toEqual(['b']);
    store.remove('s', 'b');
    expect(store.dirtyIds('s')).toEqual([]);
  });

  it('notifies spec subscribers about changes, additions and removals of that spec only', () => {
    const store = createDocumentDraftStore();
    const listener = vi.fn();
    store.subscribeSpec('s', listener);
    store.set('s', 'a', draft('x'));
    store.set('other', 'a', draft('x'));
    store.patch('s', 'a', { editing: true }, () => draft('x'));
    store.remove('s', 'a');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('document save acknowledgement', () => {
  it('acknowledges the submitted snapshot and retains newer edits made during IO', () => {
    expect(
      reconcileSavedDraft(
        { content: 'newer unsent text', baseline: 'old', revision: '1', editing: true },
        'sent text',
        '2',
      ),
    ).toEqual({
      content: 'newer unsent text',
      baseline: 'sent text',
      revision: '2',
      editing: true,
    });
  });
  it('keeps the editor open after the submitted snapshot is acknowledged', () => {
    expect(
      reconcileSavedDraft(
        { content: 'sent text', baseline: 'old', revision: '1', editing: true },
        'sent text',
        '2',
      ),
    ).toEqual({ content: 'sent text', baseline: 'sent text', revision: '2', editing: true });
  });
});
