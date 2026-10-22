import { Pencil } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import type { DocumentEditorSession } from './DocumentEditorProvider';

/**
 * Header presentation for the open document: title, unsaved marker and workspace header actions.
 * Exactly one mode action exists at a time. View: the pencil icon (direct on every width). Edit:
 * the preview eye is direct beside Save on wide headers and moves to the overflow on narrow ones;
 * Discard and "Show path" (full path dialog) always live in the overflow. The DS resolves wide/narrow, so there is no duplicate.
 */
export function documentHeaderModel(
  session: DocumentEditorSession | null,
  t: TFunction,
): {
  actions: readonly WorkspaceHeaderAction[];
  dirty: boolean;
} {
  if (!session) return { actions: [], dirty: false };
  const { draft, dirty, saving } = session;
  const showPath: WorkspaceHeaderAction = {
    id: 'document-path',
    label: t('documents.actions.showPath'),
    icon: 'info',
    onPress: session.showPath,
  };
  if (!draft.editing)
    return {
      dirty,
      actions: [
        {
          id: 'document-edit',
          label: t('documents.actions.edit'),
          icon: Pencil,
          presentation: 'icon',
          direct: 'always',
          onPress: session.toggleEditing,
        },
        showPath,
      ],
    };
  return {
    dirty,
    actions: [
      {
        id: 'document-preview',
        label: t('documents.actions.preview'),
        icon: 'eye',
        presentation: 'icon',
        direct: 'wide',
        // In the overflow, the menu must not return focus to its trigger (which now persists in view
        // mode for the path action): `toggleEditing` moves focus into the document content itself.
        onMenuClosed: () => undefined,
        onPress: session.toggleEditing,
      },
      {
        id: 'document-save',
        label: t('documents.actions.save'),
        icon: 'save',
        primary: true,
        direct: 'always',
        disabled: !dirty || saving,
        onPress: () => void session.save({ restoreFocus: true }),
      },
      {
        id: 'document-discard',
        label: t('documents.actions.discard'),
        icon: 'close',
        disabled: !dirty || saving,
        onPress: session.requestDiscard,
      },
      showPath,
    ],
  };
}
