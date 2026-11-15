import { describe, expect, it } from 'vitest';
import { backParentTarget, documentBackParent, flowBackParent } from './backParent';

describe('Back parent resolution', () => {
  it('leads a document opened from a deep link (no visit state) to the Documents list', () => {
    expect(documentBackParent({ returnTo: undefined, sessionReturn: false })).toBe('documents');
    expect(backParentTarget('documents', 'spec-1', 'archive')).toEqual({
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

  it('leads a Task page to the Specification Tasks, keeping the collection, from any entry', () => {
    expect(backParentTarget('tasks', 'spec-1', 'current')).toEqual({
      to: '/specs/$specId',
      params: { specId: 'spec-1' },
      search: { collection: 'current' },
      hash: 'tasks-heading',
    });
  });

  it('leads a flow back to the list it was started from', () => {
    expect(flowBackParent('new-specification')).toBe('specifications');
    expect(flowBackParent('new-session')).toBe('sessions');
    expect(backParentTarget('specifications', undefined, 'archive')).toEqual({
      to: '/',
      search: { collection: 'archive' },
    });
  });
});
