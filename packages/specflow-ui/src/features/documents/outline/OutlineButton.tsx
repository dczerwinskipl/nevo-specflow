import { useTranslation } from 'react-i18next';
import { IconButton, cn, hitAreaClassName } from '@nevo/ui';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';

/**
 * The contents of the previewed document. It is region navigation (like Back and the document
 * switcher), not a header action: it takes no direct slot of the action budget.
 * - Without a contents column (narrow panel) it opens the contents as a sheet.
 * - While the contents column and the guidance share one slot it is a toggle (pressed while the
 *   contents column is shown; pressing it there hides the guidance).
 * - With room for both columns it does not exist: the contents are always a column.
 */
export function OutlineButton() {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  const toggle = session?.contentsToggle;
  if (toggle) {
    return (
      <IconButton
        aria-label={t('documents.outline.label')}
        aria-pressed={toggle.pressed}
        title={t('documents.outline.label')}
        className={cn(
          'shrink-0 aria-pressed:bg-surface-selected aria-pressed:text-content-primary',
          hitAreaClassName,
        )}
        icon="list"
        size="sm"
        variant="ghost"
        onClick={toggle.toggle}
      />
    );
  }

  if (!session?.outlineAvailable) {
    return null;
  }

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
