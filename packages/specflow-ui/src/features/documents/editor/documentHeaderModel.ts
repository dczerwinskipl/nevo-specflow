import type { TFunction } from 'i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import { documentKindOf, documentViewOf } from '../content-kinds/documentContentKinds';
import type { DocumentEditorSession } from './DocumentEditorProvider';

/**
 * Header presentation for the open document: unsaved flag and workspace header actions. The
 * content kind declares its own actions (mode switch, Save, Discard); the host adds Show path and,
 * where the document is a tab, Close tab. Render the header with `menu="complete"`, so every
 * action, promoted ones included, is listed in the `...` menu.
 */
export function documentHeaderModel(
  session: DocumentEditorSession | null,
  t: TFunction,
  options: { onCloseTab?: () => void } = {},
): {
  actions: readonly WorkspaceHeaderAction[];
  dirty: boolean;
} {
  const close: WorkspaceHeaderAction[] = options.onCloseTab
    ? [
        {
          id: 'document-close-tab',
          label: t('documents.actions.closeTab'),
          icon: 'close',
          group: 'actions',
          onPress: options.onCloseTab,
        },
      ]
    : [];
  if (!session) return { actions: close, dirty: false };
  const kind = documentKindOf(session.document.filename ?? session.document.title);
  const view = documentViewOf(kind, session.draft);
  return {
    dirty: session.dirty,
    actions: [
      // Only while the contents are not a column beside the text: same condition as the header icon.
      ...(session.outlineAvailable
        ? [
            {
              id: 'document-outline',
              label: t('documents.outline.label'),
              icon: 'list',
              group: 'display',
              onPress: session.openOutline,
            } satisfies WorkspaceHeaderAction,
          ]
        : []),
      ...kind.actions(view, { session, t }),
      {
        id: 'document-path',
        label: t('documents.actions.showPath'),
        icon: 'info',
        group: 'actions',
        onPress: session.showPath,
      },
      ...close,
    ],
  };
}
