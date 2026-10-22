import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { FeatureUnavailable } from '../../../app/errors/FeatureUnavailable';
import { runtimeKeys, useRuntimeMode } from '../../../app/useRuntimeMode';
import { CreateOperationPage } from './CreateOperationPage';
import { CreateShell } from './CreateShell';

/**
 * The progress page of a Create exists only on a project Runtime (the demo flow has no operation
 * to follow); the Runtime mode decides, as it does for the form.
 */
export function CreateOperationScreen(props: {
  operationId: string;
  onOpen: (created: CreatedSpec) => void;
  onBackToForm: (restoreDraftOf?: string) => void;
  onBackToSpecifications: () => void;
}) {
  const { t } = useTranslation();
  const mode = useRuntimeMode();
  const queryClient = useQueryClient();
  if (mode === 'project')
    // A different operation is a different page: nothing of the previous one carries over.
    return <CreateOperationPage key={props.operationId} {...props} />;
  return (
    <CreateShell containerClassName="grid gap-6">
      {mode === 'loading' ? (
        <p role="status">{t('create.loading')}</p>
      ) : mode === 'unavailable' ? (
        <Alert tone="attention" title={t('create.loadError')}>
          <Button
            onClick={() => void queryClient.invalidateQueries({ queryKey: runtimeKeys.info })}
          >
            {t('common.retry')}
          </Button>
        </Alert>
      ) : (
        <FeatureUnavailable />
      )}
    </CreateShell>
  );
}
