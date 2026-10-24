import { useTranslation } from 'react-i18next';
import { IconButton, cn, hitAreaClassName } from '@nevo/ui';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';

/**
 * Opens the contents of the previewed document. It is region navigation (like Back and the document
 * switcher), not a header action: it takes no direct slot of the action budget. It exists only while
 * the contents are not already in a column beside the text.
 */
export function OutlineButton() {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  if (!session?.outlineAvailable) return null;
  return (
    <IconButton
      aria-label={t('documents.outline.open')}
      aria-haspopup="dialog"
      aria-expanded={session.outlineOpen}
      className={cn('shrink-0', hitAreaClassName)}
      icon="list"
      size="sm"
      variant="ghost"
      onClick={session.openOutline}
    />
  );
}
