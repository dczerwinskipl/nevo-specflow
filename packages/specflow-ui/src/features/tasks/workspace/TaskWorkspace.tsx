import {
  AppContent,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import { TaskWorkspaceState, useTaskWorkspace } from './TaskWorkspaceState';
import { TaskWorkspacePrimary } from './TaskWorkspacePrimary';
import { TaskWorkspaceHistory } from './TaskWorkspaceHistory';
import { taskWorkspaceHistoryStack, taskWorkspaceMaterialStack } from './taskWorkspaceStack';
import type { TaskWorkspaceData } from './taskWorkspaceModel';
import { productIcons } from '../../../shared/product-icons';

/** Presentation-only workspace. Data and real execution belong to the application boundary. */
export function TaskWorkspace({
  data,
  onBack,
}: {
  readonly data: TaskWorkspaceData;
  readonly onBack?: () => void;
}) {
  return (
    <AppWorkspaceProvider scopeKey={data.id}>
      <TaskWorkspaceState key={data.id} data={data}>
        <Workspace onBack={onBack} />
      </TaskWorkspaceState>
    </AppWorkspaceProvider>
  );
}

function Workspace({ onBack }: { readonly onBack?: () => void }) {
  const { t } = useTranslation();
  const { data, reading } = useTaskWorkspace();
  const workspaceLabels = useWorkspaceLabels(data.id);
  const navigation = useSecondaryNavigation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const openMaterial = (id: string) => {
    void navigation.open(taskWorkspaceMaterialStack, { taskId: data.id, id });
  };

  return (
    <AppWorkspace
      split={reading ? 'secondary' : 'primary'}
      secondaryCloseBehavior="page"
      labels={workspaceLabels}
    >
      <AppWorkspace.Primary
        back={
          onBack
            ? { label: t('navigation.backTo', { parent: t('specification.viewTasks') }), onBack }
            : undefined
        }
        header={
          <WorkspaceHeader
            title={`${data.specification} / ${data.id}`}
            icon={productIcons.task.item}
            as="span"
          />
        }
      >
        <AppContent className="w-full max-w-full">
          <AppWorkspaceBody padding="none" scroll="area">
            <TaskWorkspacePrimary
              onMaterial={openMaterial}
              onHistory={
                !supportsSplit
                  ? () => {
                      void navigation.open(taskWorkspaceHistoryStack, { taskId: data.id });
                    }
                  : undefined
              }
            />
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary
        header={
          <WorkspaceHeader
            title={t('taskWorkspace.history')}
            icon={productIcons.history}
            headingLevel={2}
          />
        }
      >
        <AppContent className="w-full max-w-full">
          <AppWorkspaceBody padding="none" scroll="area">
            <TaskWorkspaceHistory onMaterial={openMaterial} />
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}
