import { Pencil } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import { kindIdOf, type DocumentKindId } from './kindId';
import type { DocumentEditorSession } from '../editor/DocumentEditorProvider';

/**
 * Content kinds of the Documents workspace. A kind declares the views its documents have and the
 * header actions of each view; the tab host knows none of it. The Demo Runtime stores markdown and
 * plain text, so those are the registered kinds; another kind (code, image, binary) is one more
 * descriptor in `documentContentKinds`, without touching the host.
 */
export type DocumentView = 'preview' | 'edit';

export interface DocumentActionContext {
  session: DocumentEditorSession;
  t: TFunction;
}

export interface DocumentContentKind {
  id: DocumentKindId;
  matches: (filename: string) => boolean;
  /** Only kinds whose views differ list more than one. */
  views: readonly DocumentView[];
  defaultView: DocumentView;
  /**
   * Actions of the content for one view. `direct` promotes an action to the header (it also stays
   * in the complete menu); everything else is menu-only.
   */
  actions: (view: DocumentView, context: DocumentActionContext) => WorkspaceHeaderAction[];
}

const noop = () => undefined;

function saveActions(view: DocumentView, { session, t }: DocumentActionContext) {
  // Save and Discard exist only while the draft differs; the header keeps its geometry because
  // the direct slots are decided by the host's budget, not by what is present.
  if (!session.dirty) return [];
  return [
    {
      id: 'document-save',
      label: t('documents.actions.save'),
      icon: 'save',
      primary: true,
      direct: 'always',
      group: 'actions',
      // The shortcut is a hint only where the key works: the source editor binds it.
      shortcut: view === 'edit' ? 'Ctrl+S' : undefined,
      disabled: session.saving,
      onPress: () => void session.save({ restoreFocus: true }),
    },
    {
      id: 'document-discard',
      label: t('documents.actions.discard'),
      icon: 'close',
      group: 'actions',
      disabled: session.saving,
      onPress: session.requestDiscard,
    },
  ] satisfies WorkspaceHeaderAction[];
}

/**
 * Markdown: Edit <-> Preview (pencil in preview, eye in edit; the icon names the action). While
 * editing with unsaved changes Save takes the only direct slot of a narrow header and the mode
 * action moves to the menu.
 */
const markdown: DocumentContentKind = {
  id: 'markdown',
  matches: () => true,
  views: ['preview', 'edit'],
  defaultView: 'preview',
  actions: (view, context) => {
    const { session, t } = context;
    const editing = view === 'edit';
    return [
      {
        id: editing ? 'document-preview' : 'document-edit',
        label: editing ? t('documents.actions.preview') : t('documents.actions.edit'),
        icon: editing ? 'eye' : Pencil,
        presentation: 'icon',
        group: 'actions',
        direct: editing && session.dirty ? 'wide' : 'always',
        // In the menu, closing must not return focus to its trigger: the mode change moves focus
        // into the document content itself.
        onMenuClosed: noop,
        onPress: session.toggleEditing,
      },
      ...saveActions(view, context),
    ];
  },
};

/** Plain text: one editable view, no preview and no properties. */
const text: DocumentContentKind = {
  id: 'text',
  matches: (filename) => kindIdOf(filename) === 'text',
  views: ['edit'],
  defaultView: 'edit',
  actions: (view, context) => saveActions(view, context),
};

/** Most specific first; markdown is the fallback of every document. */
export const documentContentKinds: readonly DocumentContentKind[] = [text, markdown];

export function documentKindOf(filename: string | undefined): DocumentContentKind {
  const name = filename ?? '';
  return documentContentKinds.find((kind) => kind.matches(name)) ?? markdown;
}

/** The view on screen: the draft's mode, limited to the views the kind has. */
export function documentViewOf(
  kind: DocumentContentKind,
  draft: { editing: boolean },
): DocumentView {
  const wanted: DocumentView = draft.editing ? 'edit' : kind.defaultView;
  return kind.views.includes(wanted) ? wanted : kind.defaultView;
}
