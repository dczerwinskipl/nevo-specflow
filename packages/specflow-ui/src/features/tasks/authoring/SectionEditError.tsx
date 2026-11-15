import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { RefusalAlert } from './RefusalAlert';
import { isRevisionConflict } from './refusal';

/**
 * The refusal of a section edit (context, dependencies). A newer Task revision reads like the
 * Edit details conflict; the change is made again on the latest version (a section edit is one
 * click, so nothing needs copying).
 */
export function SectionEditError({
  taskId,
  error,
  onLoadLatest,
  entryName,
}: {
  readonly taskId: string;
  readonly error: unknown;
  readonly onLoadLatest: () => void;
  readonly entryName?: (index: number) => string;
}) {
  const { t } = useTranslation();
  if (!isRevisionConflict(error)) {
    return <RefusalAlert error={error} entryName={entryName} />;
  }

  return (
    <Alert
      role="alert"
      tone="danger"
      title={t('taskAuthoring.edit.conflictTitle', { id: taskId })}
      actions={
        <Button size="sm" variant="secondary" onClick={onLoadLatest}>
          {t('taskAuthoring.edit.loadLatest')}
        </Button>
      }
    >
      {t('taskAuthoring.edit.sectionConflictBody')}
    </Alert>
  );
}
