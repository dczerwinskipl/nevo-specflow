import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  EmptyState,
  InformationList,
  Typography,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryData,
  type SecondaryStackDefinition,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { ContextTaskRow } from './ContextTaskSections';
import { collectTasks } from './sessionContextTasks';
import { useSessionContextSource } from './sessionContextValue';
import type { SessionContextTaskRef } from './sessionContextTypes';

/**
 * Task root tabs opened from Session Context (full-session.md "Secondary tabs"): a root
 * tab is an independently revisitable working surface, and its identity is the OBJECT it shows.
 *
 * - `taskStack` is one root tab PER TASK (`instanceId` = the task id, label = the Task key, e.g.
 *   "TASK-03"). Opening a Task from anywhere (the current-execution row, an Attention reference, a
 *   Related Tasks row, or the Tasks list below) calls `openTab` with that Task: a tab already
 *   open for it is activated untouched, otherwise a new tab opens. A tab is never retargeted to
 *   another Task, so selecting Task B can no longer show Task A.
 * - `tasksStack` is the LIST tab ("Zadania", one per Session). Context lists Related Tasks one row
 *   each, so it does not open the list itself today. Selecting a Task in it opens that Task's own tab
 *   (rule above), so the same Task is never both a tab and a page inside the list.
 * - On the narrow runtime Context flow there are no tabs (Context passes its own `navTo` as
 *   `openStack`, and `Root.inFlow` is set): the list and a Task are plain pushes onto that flow, and
 *   Back follows the path the user took, duplicates included (Context -> Task A -> Back -> Context
 *   -> Task A pushes again).
 * - Planned, not built: deeper levels of a Task tab (attempt, review, feedback) would push onto that
 *   tab's local stack (`localNavigation` decides how depth shows), keeping their Task provenance
 *   (full-session-screen-structure.md "Task tabs in the Session"). Today the Task tab is a stand-in.
 *
 * Both stacks are defined ONCE, at module level, and read the LIVE Tasks from the Session's
 * `SessionContextSourceProvider` (`useData`), never from a value captured when a tab opened: a
 * renamed Task, or Tasks that arrive later, show in an already-open tab. A tab's strip label and a
 * list-to-Task breadcrumb segment are synchronous by the Secondary contract (`tabLabel`,
 * `breadcrumbLabel` see root/page params only), so they carry the Task's stable KEY (and the
 * title the row showed when it was pushed); everything inside the screens is live.
 *
 * The Tasks are the Session's associated Tasks from the association read
 * (`GET /api/sessions/:sessionId/association`, mapped to `SessionContextTaskRef`: id, key, title).
 * That read carries no Task detail, so `TaskDetail` below is a deliberate, explicitly-flagged
 * stand-in (see its own comment), not an adaptation of the real `TaskDetails`/`TaskInspection`
 * presentation.
 */

export interface TaskStackRoot {
  sessionId: string;
  /** The Task a Task tab is about; absent for the list. */
  taskId?: string;
  /** That Task's key: the tab's strip label (synchronous, so it cannot be read from live data). */
  taskKey?: string;
  /** Opened as a push onto another flow (the narrow Context flow): no tabs, Back follows the path. */
  inFlow?: boolean;
}
type Root = TaskStackRoot;
interface Data extends Root {
  /** The Session's Tasks as they are now. */
  tasks: SessionContextTaskRef[];
}
interface Pages {
  tasks: Record<string, never>;
  task: { taskId?: string; taskTitle?: string };
}

function TaskList({ data }: { data: Data }) {
  const { t } = useTranslation();
  const stack = useSecondaryStack<Pages>();
  const navigation = useSecondaryNavigation();
  // A Task opens as its own root tab, except inside another flow (narrow Context), where it is a
  // push so Back returns along the path.
  const openTask = (task: SessionContextTaskRef) =>
    data.inFlow
      ? void stack.navTo('task', { taskId: task.id, taskTitle: task.title })
      : void navigation.openTab(taskStack, {
          sessionId: data.sessionId,
          taskId: task.id,
          taskKey: task.key,
        });

  if (!data.tasks.length) {
    return (
      <AppContent className="h-full w-full">
        {/* `contentClassName` gives the scrolled content a definite, full-height flex column so
            `EmptyState`'s own `variant="pane"` (`min-h-full flex-1 ... justify-center`) actually has
            something to fill and centre within, instead of collapsing to its own intrinsic height
            at the top of an otherwise-blank, full-viewport mobile panel. */}
        <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
          <EmptyState variant="pane" title={t('sessions.context.tasks.empty')} />
        </AppWorkspaceBody>
      </AppContent>
    );
  }

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        {/* The rows Context lists the same Tasks with: no inset of their own, the body's padding is
            the only content edge, so the tab and Context line up. */}
        <div className="w-full">
          <InformationList>
            {data.tasks.map((task) => (
              <ContextTaskRow key={task.id} task={task} onOpen={openTask} />
            ))}
          </InformationList>
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function TaskDetail({ data, params }: { data: Data; params: { taskId?: string } }) {
  const { t } = useTranslation();
  const taskId = params.taskId ?? data.taskId;
  const task = data.tasks.find((candidate) => candidate.id === taskId);

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        {!task ? (
          <EmptyState variant="pane" title={t('sessions.context.tasks.unavailable')} />
        ) : (
          // Deliberate stand-in, not an adaptation of the real `TaskDetails`/`TaskInspection`
          // presentation: those components require a `FullTaskData`/`TaskSnapshot` from the
          // Specification/Task read model, while the association read gives only the Task's id,
          // key and title (`SessionContextTaskRef`). `detailNote` below says so honestly to the
          // user rather than faking a full Task page.
          <div className="grid w-full gap-2">
            <Typography variant="label-sm" className="text-content-muted">
              {task.key}
            </Typography>
            <Typography as="h2" variant="title-sm">
              {task.title}
            </Typography>
            {task.note && (
              <Typography variant="body-sm" className="text-content-secondary">
                {task.note}
              </Typography>
            )}
            <Typography variant="body-sm" className="text-content-muted">
              {t('sessions.context.tasks.detailNote')}
            </Typography>
          </div>
        )}
      </AppWorkspaceBody>
    </AppContent>
  );
}

function useTasksData(params: Root): SecondaryData<Data> {
  const source = useSessionContextSource();

  return source
    ? { status: 'ready', data: { ...params, tasks: collectTasks(source.value) } }
    : { status: 'unavailable' };
}

const screens = {
  tasks: {
    get title() {
      return translateNow('sessions.context.tasksTitle');
    },
    component: TaskList,
  },
  task: {
    get title() {
      return translateNow('sessions.context.taskTitle');
    },
    // The breadcrumb segment names the opened Task (`Zadania › Document the admission guard`) from
    // the title the pushing row showed; the tab keeps its root's name.
    breadcrumbLabel: (params: { taskId?: string; taskTitle?: string }) =>
      params.taskTitle ?? translateNow('sessions.context.taskTitle'),
    component: TaskDetail,
  },
};

/**
 * The two Task stacks over the same two screens (see the module comment): `tasksStack` is the list
 * tab, `taskStack` is one tab per Task. The Task tab is named after its Task KEY at any depth (a
 * tab never renames itself to the detail open inside it, §10.1's "Work -> ToolAction stays inside
 * the Work tab"), which also tells two open Task tabs apart; the list tab keeps "Zadania".
 */
export const tasksStack: SecondaryStackDefinition<Root, Data, Pages> = defineSecondaryStack<
  Root,
  Data,
  Pages
>({
  id: 'managed-session-tasks',
  initial: 'tasks',
  tabLabel: () => translateNow('sessions.context.tasksTitle'),
  useData: useTasksData,
  screens,
});

export const taskStack: SecondaryStackDefinition<Root, Data, Pages> = defineSecondaryStack<
  Root,
  Data,
  Pages
>({
  ...tasksStack,
  id: 'managed-session-task',
  initial: 'task',
  instanceId: (params) => params.taskId ?? '',
  tabLabel: (params) => params.taskKey ?? translateNow('sessions.context.taskTitle'),
});
