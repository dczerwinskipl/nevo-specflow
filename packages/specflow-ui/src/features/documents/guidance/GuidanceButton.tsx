import { useTranslation } from 'react-i18next';
import { IconButton, cn, hitAreaClassName } from '@nevo/ui';
import { useDocumentEditor } from '../editor/DocumentEditorProvider';

/**
 * Shows or hides the guidance of the open document, next to the contents icon. A toggle: pressed
 * while the column or the sheet is shown.
 */
export function GuidanceButton() {
  const { t } = useTranslation();
  const session = useDocumentEditor();
  if (!session?.guidance) return null;
  return (
    <IconButton
      aria-label={t('documents.guidance.label')}
      aria-pressed={session.guidanceShown !== undefined}
      data-guidance-toggle=""
      title={t('documents.guidance.label')}
      className={cn(
        'shrink-0 aria-pressed:bg-surface-selected aria-pressed:text-content-primary',
        hitAreaClassName,
      )}
      icon="info"
      size="sm"
      variant="ghost"
      onClick={session.toggleGuidance}
    />
  );
}
