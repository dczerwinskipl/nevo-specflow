import { translateNow } from '../../../i18n/message';
import { createContext, useContext } from 'react';
import {
  AppContent,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryData,
  type AppWorkspaceBack,
  type SecondaryScreenProps,
} from '@nevo/ui';
import { WorkspaceRouteLeaveGuard } from '../../../app/navigation/WorkspaceRouteLeaveGuard';
import type { FullTaskData } from '../read-model/model';
import {
  TaskHistoryResourceInspection,
  type TaskHistoryResourceParams,
} from '../detail/history/TaskHistoryResourceInspection';
import { TaskHistory } from '../detail/history/TaskHistory';
import { TaskHistoryHeader, TaskResourceHeader } from '../detail/history/TaskReferenceInspection';
import { taskDocumentStack } from '../../documents';
import { ProjectTaskWorkspace } from './ProjectTaskWorkspace';
import { TaskViewStateProvider } from '../detail/TaskViewState';

interface TaskContextData {
  task: FullTaskData;
  specId: string;
  historyResource?: TaskHistoryResourceParams;
}
interface RootParams {
  taskId: string;
  historyResource?: TaskHistoryResourceParams;
}
const Context = createContext<TaskContextData | null>(null);
interface Pages {
  history: Record<never, never>;
  historyResource: TaskHistoryResourceParams;
}
function useTaskContext(params: RootParams): SecondaryData<TaskContextData> {
  const data = useContext(Context);

  return data
    ? { status: 'ready', data: { ...data, historyResource: params.historyResource } }
    : { status: 'loading' };
}

function HistoryResourceScreen({
  data,
  params,
}: SecondaryScreenProps<TaskContextData, TaskHistoryResourceParams>) {
  return (
    <AppContent className="w-content-standard max-w-full">
      <AppWorkspaceBody padding="none" scroll="area">
        <div className="p-4">
          <TaskHistoryResourceInspection
            specId={data.specId}
            taskId={data.task.id}
            snapshot={data.task.snapshot}
            params={data.historyResource ?? params}
          />
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function HistoryScreen({ data }: SecondaryScreenProps<TaskContextData, Record<never, never>>) {
  const nav = useSecondaryStack<Pages>();
  const navigation = useSecondaryNavigation();
  // The agent's paths are checkout-relative; the Task's documents are its folder's.
  const openDocument = (path: string) => {
    const document = data.task.resource.documents.find((item) => path.endsWith(`/${item.path}`));
    if (document) {
      void navigation.openTab(taskDocumentStack, {
        documentId: document.id,
        name: document.path.split('/').at(-1) ?? document.id,
      });
    }

    return document !== undefined;
  };

  return (
    <AppContent className="w-content-standard max-w-full">
      <AppWorkspaceBody padding="none" scroll="area">
        <TaskHistory
          specId={data.specId}
          taskId={data.task.id}
          snapshot={data.task.snapshot}
          onOpenDocument={openDocument}
          onOpenResource={(params) => {
            void nav.navTo('historyResource', params);
          }}
        />
      </AppWorkspaceBody>
    </AppContent>
  );
}

/** The Task history as a pushed page (Narrow), and a material of one of its entries. */
const historyStack = defineSecondaryStack<RootParams, TaskContextData, Pages>({
  id: 'task-history',
  initial: 'history',
  useData: useTaskContext,
  screens: {
    historyResource: {
      get title() {
        return translateNow('taskDetails.resource');
      },
      header: TaskResourceHeader,
      component: HistoryResourceScreen,
    },
    history: {
      get title() {
        return translateNow('taskDetails.historyTitle');
      },
      header: TaskHistoryHeader,
      component: HistoryScreen,
    },
  },
});

/** The Full Task: the Task resource its Specification lists, in any Runtime. */
export function FullTaskWorkspace(props: {
  readonly task: FullTaskData;
  readonly specId: string;
  /** The header Back of the stacked page (Narrow): "Back to Tasks". */
  readonly back: AppWorkspaceBack;
  readonly stale?: boolean;
  readonly onRetry?: () => void;
  /** Reads the Task again; resolves with the latest Task (revision conflicts). */
  readonly reload: () => Promise<FullTaskData | undefined>;
}) {
  return (
    <AppWorkspaceProvider scopeKey={`${props.specId}:${props.task.id}`}>
      <WorkspaceRouteLeaveGuard />
      <TaskViewStateProvider key={`${props.specId}:${props.task.id}`}>
        <Context.Provider value={{ task: props.task, specId: props.specId }}>
          <FullTaskWithHistory {...props} />
        </Context.Provider>
      </TaskViewStateProvider>
    </AppWorkspaceProvider>
  );
}

function FullTaskWithHistory(props: Parameters<typeof FullTaskWorkspace>[0]) {
  const navigation = useSecondaryNavigation();

  return (
    <ProjectTaskWorkspace
      {...props}
      resource={props.task.resource}
      onOpenHistory={() => void navigation.open(historyStack, { taskId: props.task.id })}
    />
  );
}
