import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import {
  Alert,
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { FullTaskWorkspace } from './FullTaskWorkspace';
import { mapFullTaskResponse } from '../model';
import type { useSpecificationTask } from '../useSpecificationTask';
import {
  ApplicationLocationIdentity,
  ApplicationContextLine,
  ViewPageTitle,
} from '../../../app/navigation/ApplicationLocation';

export interface SpecificationTaskPageProps {
  readonly specId: string;
  readonly taskId: string;
  readonly collection: 'current' | 'archive';
  readonly taskState: ReturnType<typeof useSpecificationTask>;
  readonly onBack: () => void;
}

/** A routable Task page. Neither the Task list nor Workspace read is a prerequisite. */
export function SpecificationTaskPage({
  specId,
  taskId,
  collection,
  taskState,
  onBack,
}: SpecificationTaskPageProps) {
  const { t } = useTranslation();
  const backHref = `/specs/${encodeURIComponent(specId)}?collection=${collection}`;
  if (
    taskState.data?.task.id === taskId &&
    !(taskState.isError && [401, 403, 404, 409].includes(taskState.errorStatus ?? 0))
  ) {
    return (
      <FullTaskWorkspace
        task={mapFullTaskResponse(taskState.data)}
        specId={specId}
        onBack={onBack}
        backHref={backHref}
        stale={taskState.isError}
        onRetry={() => void taskState.refetch()}
      />
    );
  }
  return (
    <AppWorkspace
      split="primary"
      labels={{
        backToPrimary: t('navigation.back'),
        closeSecondary: t('navigation.closeSecondary'),
        openNavigation: t('navigation.open'),
      }}
    >
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={t('specification.viewTasks')}
            as="span"
            identityContent={
              <ApplicationLocationIdentity
                title={t('specification.viewTasks')}
                specId={specId}
                view="task"
                detailLabel={taskId}
              />
            }
          />
        }
      >
        <AppContent className="w-content-xwide max-w-full">
          <AppWorkspaceBody scroll="area" contentClassName="py-6">
            <AppContentContainer align="start" size="full">
              <ApplicationContextLine specId={specId} view="task" />
              <ViewPageTitle>{t('specification.viewTasks')}</ViewPageTitle>
              {taskState.isPending ? (
                <LoadingPresentation
                  shape="task"
                  label={t('loading.task')}
                  fetching={taskState.fetchStatus === 'fetching'}
                />
              ) : taskState.isError ? (
                <div className="grid max-w-content-standard gap-3">
                  <Alert
                    role="alert"
                    tone="attention"
                    title={
                      taskState.errorStatus === 403
                        ? t('specification.resourceAccessDeniedTitle')
                        : taskState.isTaskNotFound
                          ? t('specification.taskNotFoundTitle')
                          : t('specification.unavailableTitle')
                    }
                  >
                    {taskState.errorStatus === 403
                      ? t('specification.resourceAccessDeniedDescription')
                      : taskState.isTaskNotFound
                        ? t('specification.taskNotFoundDescription', { taskId })
                        : t('specification.unavailableDescription', { id: taskId })}
                  </Alert>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void taskState.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                </div>
              ) : taskState.data?.task.id !== taskId ? (
                <Alert role="alert" tone="attention" title={t('specification.unavailableTitle')}>
                  {t('specification.unavailableDescription', { id: taskId })}
                </Alert>
              ) : (
                <Alert tone="attention" title={t('specification.unavailableTitle')} />
              )}
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
