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
  type SecondaryStackDefinition,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { ContextTaskRow } from './ContextTaskSections';
import type { SessionContextTaskRef } from './sessionContextTypes';

/**
 * Task root tabs opened from Session Context (full-session-screen-structure.md §7.4/§10.1): a root
 * tab is an independently revisitable working surface, and its identity is the OBJECT it shows.
 *
 * - `taskStack` is one root tab PER TASK (`instanceId` = the task id, label = the Task key, e.g.
 *   "TASK-03"). Opening a Task from anywhere (the current-execution row, an Attention reference, a
 *   single Related Task, or the Tasks list below) calls `openTab` with that Task: a tab already
 *   open for it is activated untouched, otherwise a new tab opens. A tab is never retargeted to
 *   another Task, so selecting Task B can no longer show Task A.
 * - `tasksStack` is the LIST tab ("Zadania", one per Session, reached from a Related Tasks summary
 *   with more than one entry). Selecting a Task in it opens that Task's own tab (rule above), so the
 *   same Task is never both a tab and a page inside the list.
 * - On the narrow runtime Context flow there are no tabs (Context passes its own `navTo` as
 *   `openStack`, and `Root.inFlow` is set): the list and a Task are plain pushes onto that flow, and
 *   Back follows the path the user took, duplicates included (Context -> Task A -> Back -> Context
 *   -> Task A pushes again).
 * - Within a Task tab, deeper levels (attempt, review, feedback) push onto that tab's local stack
 *   (`localNavigation` decides how depth shows), keeping their Task provenance.
 *
 * Task data is a product-owned mock (`SessionContextTaskRef`), not a Runtime read — the managed
 * Session contract has no Task association yet (see the Full Session UX report). `TaskDetail`
 * below is a deliberate, explicitly-flagged stand-in for that reason (see its own comment) — not
 * an adaptation of the real `TaskDetails`/`TaskInspection` presentation.
 */

interface Root {
  sessionId: string;
  /** The Task a Task tab is about; absent for the list. */
  taskId?: string;
  /** Opened as a push onto another flow (the narrow Context flow): no tabs, Back follows the path. */
  inFlow?: boolean;
}
interface Data extends Root {
  tasks: SessionContextTaskRef[];
  /** The per-Task tab definition, so the list can open a Task's own tab. */
  taskStack: SecondaryStackDefinition<Root, Data, Pages>;
}
interface Pages {
  tasks: Record<string, never>;
  task: { taskId?: string };
}

function TaskList({ data }: { data: Data }) {
  const { t } = useTranslation();
  const stack = useSecondaryStack<Pages>();
  const navigation = useSecondaryNavigation();
  // A Task opens as its own root tab, except inside another flow (narrow Context), where it is a
  // push so Back returns along the path.
  const openTask = (task: SessionContextTaskRef) =>
    data.inFlow
      ? void stack.navTo('task', { taskId: task.id })
      : void navigation.openTab(data.taskStack, { sessionId: data.sessionId, taskId: task.id });

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
          // Specification/Task read model, and the managed Session contract has no Task
          // association backend yet (`SessionContextTaskRef` is a 4-field product-owned stub).
          // `detailNote` below says so honestly to the user rather than faking a full Task page.
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

/**
 * The two Task stacks over the same two screens (see the module comment): `tasksStack` is the list
 * tab, `taskStack` is one tab per Task. The Task tab is named after its Task KEY at any depth (a
 * tab never renames itself to the detail open inside it, §10.1's "Work -> ToolAction stays inside
 * the Work tab"), which also tells two open Task tabs apart; the list tab keeps "Zadania".
 */
export function createSessionTasksInspector(tasks: SessionContextTaskRef[]) {
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
      // The breadcrumb segment names the opened Task (`Zadania › Document the admission guard`);
      // the tab keeps its root's name.
      breadcrumbLabel: (params: { taskId?: string }) =>
        tasks.find((task) => task.id === params.taskId)?.title ??
        translateNow('sessions.context.taskTitle'),
      component: TaskDetail,
    },
  };
  const tasksStack: SecondaryStackDefinition<Root, Data, Pages> = defineSecondaryStack<
    Root,
    Data,
    Pages
  >({
    id: 'managed-session-tasks',
    initial: 'tasks',
    tabLabel: () => translateNow('sessions.context.tasksTitle'),
    useData: (params) => ({ status: 'ready', data: { ...params, tasks, taskStack } }),
    screens,
  });
  const taskStack: SecondaryStackDefinition<Root, Data, Pages> = defineSecondaryStack<
    Root,
    Data,
    Pages
  >({
    ...tasksStack,
    id: 'managed-session-task',
    initial: 'task',
    instanceId: (params) => params.taskId ?? '',
    tabLabel: (params) =>
      tasks.find((task) => task.id === params.taskId)?.key ??
      translateNow('sessions.context.taskTitle'),
  });

  return { tasksStack, taskStack };
}
