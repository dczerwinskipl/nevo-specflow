import { describe, expect, it } from 'vitest';
import { reconcileSavedDraft } from './documentDraftStore';
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
