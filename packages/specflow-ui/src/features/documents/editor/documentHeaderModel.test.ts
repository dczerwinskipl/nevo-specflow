import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import type { DocumentEditorSession } from './DocumentEditorProvider';
import { documentHeaderModel } from './documentHeaderModel';

const t = ((key: string) => key) as unknown as TFunction;
const noop = () => undefined;

/** A session with every optional action of the `...` menu present. */
function session(editing: boolean): DocumentEditorSession {
  return {
    document: documentContentFixture({
      id: 'u-notes',
      path: 'notes.md',
      classification: 'unclassified',
      type: undefined,
    }),
    draft: { content: 'x', baseline: 'y', revision: '1', editing },
    dirty: true,
    saving: false,
    saveBlocked: false,
    readOnlyReason: undefined,
    outlineAvailable: !editing,
    openOutline: noop,
    guidance: { title: 'Notes', instructions: 'How' },
    guidanceShown: undefined,
    toggleGuidance: noop,
    wrapLines: editing ? { checked: true, toggle: noop } : undefined,
    toggleEditing: noop,
    save: () => Promise.resolve(),
    requestDiscard: noop,
    showPath: noop,
    download: noop,
    actualSize: false,
    toggleActualSize: noop,
  } as unknown as DocumentEditorSession;
}

describe('the document `...` menu', () => {
  it.each([false, true])('gives every item its own glyph (editing: %s)', (editing) => {
    const { actions } = documentHeaderModel(session(editing), t, {
      onCloseTab: noop,
      onAssignType: noop,
    });
    const icons = actions.map((action) => action.icon);
    expect(icons.every((icon) => icon !== undefined)).toBe(true);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
