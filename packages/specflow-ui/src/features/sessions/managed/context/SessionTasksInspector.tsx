import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  Button,
  EmptyState,
  Typography,
  defineSecondaryStack,
  useSecondaryStack,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import type { SessionContextTaskRef } from './sessionContextTypes';

/**
 * Tasks root tab opened from Session Context (full-session-screen-structure.md §10.1).
 *
 * `AppWorkspace` does not yet support several independent root tabs open at once beside the
 * pinned Context tab (design-system-component-composition-gaps.md §5.4) — that shared split/tab
 * capability is a separate, parallel design-system track. Today this composition reuses the real
 * default-Secondary + runtime-stack mechanism already used by `WorkInspector`:
 * opening Tasks temporarily replaces Context in the one Secondary, and Back/Close returns to the
 * default Context. That already gives the required V1 semantics (an independently revisitable
 * Task list with its own local stack; Back walks Task -> list -> Context) and should switch to the
 * shared tab-bar primitive, unchanged in information architecture, once that capability lands.
 *
 * Task data is a product-owned mock (`SessionContextTaskRef`), not a Runtime read — the managed
 * Session contract has no Task association yet (see the Full Session UX report).
 */

interface Root {
  sessionId: string;
  /** Present only when opening directly onto Task detail (source-aware direct inspection). */
  taskId?: string;
}
interface Data extends Root {
  tasks: SessionContextTaskRef[];
}
interface Pages {
  tasks: Record<string, never>;
  task: { taskId?: string };
}

function TaskList({ data }: { data: Data }) {
  const { t } = useTranslation();
  const stack = useSecondaryStack<Pages>();

  if (!data.tasks.length) {
    return (
      <AppContent className="h-full w-full">
        <AppWorkspaceBody scroll="area">
          <EmptyState variant="pane" title={t('sessions.context.tasks.empty')} />
        </AppWorkspaceBody>
      </AppContent>
    );
  }

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <ul className="grid gap-1">
          {data.tasks.map((task) => (
            <li key={task.id}>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => void stack.navTo('task', { taskId: task.id })}
              >
                <span className="grid gap-0.5">
                  <Typography variant="label-sm" className="text-content-muted">
                    {task.key}
                  </Typography>
                  <span className="text-body-sm text-content-primary">{task.title}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
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
      <AppWorkspaceBody scroll="area">
        {!task ? (
          <EmptyState variant="pane" title={t('sessions.context.tasks.unavailable')} />
        ) : (
          <div className="grid gap-2">
            <Typography variant="label-sm" className="text-content-muted">
              {task.key}
            </Typography>
            <Typography as="h2" variant="title-sm">
              {task.title}
            </Typography>
            {task.note && <p className="text-body-sm text-content-secondary">{task.note}</p>}
            <p className="text-body-sm text-content-muted">
              {t('sessions.context.tasks.detailNote')}
            </p>
          </div>
        )}
      </AppWorkspaceBody>
    </AppContent>
  );
}

/**
 * Two root tabs over the same screens, following the pattern already used by
 * `SessionContextPanel` for its document/project/instructions variants: one opens the Task list
 * (from a "Related Tasks" summary), the other opens straight to Task detail (clicking a specific
 * Task reference, e.g. the current execution Task) without a detour through the list.
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
      component: TaskDetail,
    },
  };
  const tasksStack = defineSecondaryStack<Root, Data, Pages>({
    id: 'managed-session-tasks',
    initial: 'tasks',
    useData: (params) => ({ status: 'ready', data: { ...params, tasks } }),
    screens,
  });
  const taskStack = defineSecondaryStack<Root, Data, Pages>({
    ...tasksStack,
    id: 'managed-session-task-detail',
    initial: 'task',
    // Each distinct Task opens as its own independent tab (W01-W04's `openTab`), rather than every
    // Task sharing one tab slot; the Tasks list itself has no `taskId`, so it still shares a single
    // "list" instance.
    instanceId: (params) => params.taskId ?? 'list',
  });

  return { tasksStack, taskStack };
}
