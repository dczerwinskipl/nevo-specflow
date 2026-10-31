import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  EmptyState,
  Icon,
  InformationList,
  Typography,
  defineSecondaryStack,
  useSecondaryStack,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { OperationalRow } from '../../../../shared/operational-list';
import type { SessionContextTaskRef } from './sessionContextTypes';

/**
 * Tasks root tab opened from Session Context (full-session-screen-structure.md §7.4/§10.1):
 * "Context... open/reselect root tabs such as Tasks... A Task selection from a Tasks tab pushes
 * Task detail onto that tab's local stack... Do not spawn an independent tab for a task-bound
 * event and lose provenance."
 *
 * `tasksStack` and `taskDeepLinkStack` below share one `id` (`managed-session-tasks`) and neither
 * sets `instanceId`, so `useSecondaryNavigation().openTab` always resolves them to the SAME
 * Secondary tab regardless of which Task opened it — there is exactly one "Tasks" root tab, never
 * one per Task (the bug a prior pass of this file had: a per-Task `instanceId` gave each related
 * Task its own independent tab, confirmed by `ManagedSession.interactions.stories.tsx`'s
 * `RelatedTaskOpensAsIndependentTab`, which needs rewriting to match this correction).
 * `taskDeepLinkStack` only changes `initial`/`tabLabel`, so opening it when the tab does not exist
 * yet starts that one tab straight on Task detail; `stack.navTo('task', ...)` from inside the
 * already-open list (below) pushes detail onto that SAME tab's own local stack, matching §7.4
 * exactly. If the tab is already open on a different Task, `openTab` documents that it activates
 * the existing tab untouched rather than retargeting it — an honest limitation of the shared
 * primitive, not a new one introduced here (see `SessionContext.tsx`'s `openTask`).
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
 * Session contract has no Task association yet (see the Full Session UX report). `TaskDetail`
 * below is a deliberate, explicitly-flagged stand-in for that reason (see its own comment) — not
 * an adaptation of the real `TaskDetails`/`TaskInspection` presentation.
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
        <div className="w-full">
          <InformationList>
            {data.tasks.map((task) => (
              <OperationalRow
                key={task.id}
                leading={<Icon name="list-checks" size="sm" className="text-content-muted" />}
                primary={task.title}
                compactFacts={[{ text: task.key, mono: true }]}
                onPrimaryClick={() => void stack.navTo('task', { taskId: task.id })}
                trailing={
                  <Icon
                    name="chevron-right"
                    size="sm"
                    className="text-content-muted"
                    aria-hidden="true"
                  />
                }
              />
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
 * One Tasks root tab (full-session-screen-structure.md §7.4/§10.1 — see the module comment
 * above) over the same two screens: `tasksStack` opens/reselects it on the list, and
 * `taskDeepLinkStack` opens/reselects the SAME tab (identical `id`, no `instanceId` on either)
 * starting straight on a specific Task's detail — used when Context already knows which single
 * Task is relevant (the current-execution Task, or a Related Tasks summary with exactly one
 * entry) so the user is not forced through the list first. Both are the same tab, never two.
 *
 * Both share one stable `tabLabel` ("Tasks"), not a per-Task name: §10.1's own "Work -> ToolAction
 * stays inside the Work tab" example keeps the WORK tab labelled "Work" throughout its drill-down,
 * never renamed to the open ToolAction, and the Tasks tab follows the same rule — its identity is
 * the tab (Tasks), the open Task is the tab's CONTENT (`TaskDetail`'s own heading already names
 * it). A per-Task `tabLabel` would only be correct for the instant this tab is first created; once
 * the user navigates inside it (`stack.navTo('task', ...)` from the list, or Back to the list),
 * the active screen's own static per-page title would show through instead (`screens.task.title`,
 * the generic "Task") and the tab name would flip depending on navigation depth rather than naming
 * the tab itself — the exact inconsistency a per-Task label was originally meant to avoid.
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
    tabLabel: () => translateNow('sessions.context.tasksTitle'),
    useData: (params) => ({ status: 'ready', data: { ...params, tasks } }),
    screens,
  });
  const taskDeepLinkStack = defineSecondaryStack<Root, Data, Pages>({
    ...tasksStack,
    initial: 'task',
  });

  return { tasksStack, taskDeepLinkStack };
}
