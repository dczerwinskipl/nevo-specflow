import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { workflowRefusalKey, workflowRefusalOf } from './refusal';

/**
 * A refused workflow command, explained by its code (`role="alert"`). With `retrySafe` a lost answer
 * says the same request may be sent again (a repeated finish returns the recorded result).
 */
export function WorkflowRefusalAlert({
  error,
  title,
  retrySafe = false,
}: {
  readonly error: unknown;
  readonly title?: string;
  readonly retrySafe?: boolean;
}) {
  const { t } = useTranslation();
  const refusal = workflowRefusalOf(error);

  return (
    <Alert role="alert" tone="danger" title={title}>
      {refusal.outcomeUnknown && retrySafe
        ? t('workflowExecution.refusal.outcomeUnknownRetrySafe')
        : t(workflowRefusalKey(refusal))}
    </Alert>
  );
}
