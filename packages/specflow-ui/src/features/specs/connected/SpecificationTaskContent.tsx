import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useSpecFlowServices } from '../../../services';
import { specificationKeys } from '../queries';
import type { TaskItem } from '../workspace/model';
import { FullTaskView } from '../workspace/FullTaskView';

export function SpecificationTaskContent({
  specId,
  task,
  onBack,
}: {
  readonly specId: string;
  readonly task: TaskItem;
  readonly onBack: () => void;
}) {
  const { t } = useTranslation();
  const { specificationApi } = useSpecFlowServices();
  const query = useQuery({
    queryKey: specificationKeys.task(specId, task.id),
    queryFn: ({ signal }) => specificationApi.getTask(specId, task.id, signal),
  });

  if (query.isPending)
    return (
      <Typography variant="body-sm">
        {t('specification.loadingWorkspace', { id: task.id })}
      </Typography>
    );
  if (query.isError || query.data.task.id !== task.id) {
    return (
      <div className="grid gap-3">
        <Alert tone="attention" role="alert" title={t('specification.unavailableTitle')}>
          {t('specification.unavailableDescription', { id: task.id })}
        </Alert>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  return (
    <FullTaskView
      specKey={specId}
      task={{
        ...task,
        title: query.data.task.title,
        status: query.data.task.status.lifecycle,
        statusCode: query.data.task.status.lifecycle,
        lifecycle: query.data.task.status.lifecycle,
        purpose: query.data.purpose,
        workflow: query.data.workflow,
        acceptanceCriteria: query.data.acceptanceCriteria,
      }}
      onBack={onBack}
    />
  );
}
