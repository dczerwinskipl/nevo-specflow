import { describe, expect, it } from 'vitest';
import {
  backByHistory,
  documentBackParent,
  flowBackParent,
  specificationParentTarget,
  specificationsTarget,
} from './backParent';

describe('Back parent resolution', () => {
  it('leads a document opened from a deep link (no visit state) to the Documents list', () => {
    expect(documentBackParent({ returnTo: undefined, sessionReturn: false })).toBe('documents');
    expect(specificationParentTarget('documents', 'spec-1', 'archive')).toEqual({
      to: '/specs/$specId/documents',
      params: { specId: 'spec-1' },
      search: { collection: 'archive' },
    });
  });

  it('returns a document promoted from the Overview to the Overview', () => {
    expect(documentBackParent({ returnTo: 'overview', sessionReturn: false })).toBe('overview');
  });

  it('keeps the way back to a Session ahead of the Overview return', () => {
    expect(documentBackParent({ returnTo: 'overview', sessionReturn: true })).toBe('documents');
  });

  it('steps back in history only when the previous entry is the parent visit', () => {
    // Opened from the Overview at index 4, now at 5: Back is a history step (scroll kept).
    expect(backByHistory({ parentIndex: 4, currentIndex: 5 })).toBe(true);
    // A document tab pushed since, or a deep link (no index): navigate to the parent instead.
    expect(backByHistory({ parentIndex: 4, currentIndex: 6 })).toBe(false);
    expect(backByHistory({ parentIndex: undefined, currentIndex: 5 })).toBe(false);
    expect(backByHistory({ parentIndex: 4, currentIndex: undefined })).toBe(false);
  });

  it('leads a Task page to the Tasks page, keeping the collection, from any entry', () => {
    // The navigation's Tasks destination, not the Overview's Tasks section; no filter is carried.
    expect(specificationParentTarget('tasks', 'spec-1', 'archive')).toEqual({
      to: '/specs/$specId/tasks',
      params: { specId: 'spec-1' },
      search: { collection: 'archive' },
    });
  });

  it('leads a flow back to the list it was started from', () => {
    expect(flowBackParent('new-specification')).toBe('specifications');
    expect(flowBackParent('new-session')).toBe('sessions');
    expect(specificationsTarget('archive')).toEqual({
      to: '/',
      search: { collection: 'archive' },
    });
  });

  it('leads a refused start with Sessions turned off to the Overview, not the disabled area', () => {
    expect(flowBackParent('new-session', true)).toBe('overview');
  });
});
