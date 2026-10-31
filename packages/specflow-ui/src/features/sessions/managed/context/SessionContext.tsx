import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  Button,
  EmptyState,
  StatusIndicator,
  Typography,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryStackDefinition,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { createSessionTasksInspector } from './SessionTasksInspector';
import type { SessionContextTaskRef, SessionContextViewModel } from './sessionContextTypes';

/** Same shape as `useSecondaryNavigation().open` and the stack-push overload of a flow's own
 * `navTo` — whichever is passed in, it starts the target stack somewhere in the Secondary. */
type OpenSecondaryStack = <
  TRoot extends object,
  TData,
  TPages extends { [K in keyof TPages]: object },
>(
  stack: SecondaryStackDefinition<TRoot, TData, TPages>,
  params: TRoot,
) => Promise<boolean>;

/**
 * Full Session Context Secondary (full-session-screen-structure.md §7).
 *
 * Structural order follows §7.2: Current execution, Attention/next actions, Related Tasks.
 * Every section is independently optional (owner decision 2 — a missing group must never crash
 * or show a broken UI); `Session details`/`Evidence` are deliberately out of this pass's scope
 * (owner decision 2) and are simply absent rather than stubbed.
 */
export function SessionContext({
  sessionId,
  value,
  openStack,
}: {
  sessionId: string;
  value: SessionContextViewModel;
  /**
   * How "Related Tasks" / a Task link opens from here. Defaults to `useSecondaryNavigation().open`,
   * which starts a brand-new Secondary flow — correct when Context is the default, always-mounted
   * Secondary (wide/split layouts; see `ManagedSession`), since there is no enclosing flow to push
   * onto there. The narrow runtime Context flow (`createSessionContextStack` below) instead passes
   * that flow's own `navTo`, which pushes Tasks/Task onto Context's OWN stack, so Back returns to
   * Context first instead of skipping it (the bug this prop exists to avoid).
   */
  openStack?: OpenSecondaryStack;
}) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();
  const openSecondary = openStack ?? navigation.open;
  const allTasks = useMemo(() => collectTasks(value), [value]);
  const inspectors = useMemo(() => createSessionTasksInspector(allTasks), [allTasks]);

  function openTasksList() {
    void openSecondary(inspectors.tasksStack, { sessionId });
  }

  function openTask(task: SessionContextTaskRef) {
    void openSecondary(inspectors.taskStack, { sessionId, taskId: task.id });
  }

  /**
   * Related Tasks' own open handler (W01-W04 adoption, scoped to this one entry point):
   * unchanged narrow/mobile fallback (`openStack` present — pushes onto Context's own runtime
   * flow, exactly like `openTask` above), but on the wide/pinned-tab desktop case (`openStack`
   * absent, Context is the default declarative Secondary) the Task opens as its own independent
   * root tab beside the pinned Context tab instead of replacing it.
   */
  function openRelatedTask(task: SessionContextTaskRef) {
    if (openStack) {
      void openStack(inspectors.taskStack, { sessionId, taskId: task.id });

      return;
    }

    void navigation.openTab(inspectors.taskStack, { sessionId, taskId: task.id });
  }

  if (value.status === 'unavailable') {
    return (
      <AppContent className="h-full w-full">
        {/* `contentClassName` gives the scrolled content a definite, full-height flex column so
            `EmptyState`'s own `variant="pane"` (`min-h-full flex-1 ... justify-center`) actually has
            something to fill and centre within, instead of collapsing to its own intrinsic height
            at the top of an otherwise-blank, full-viewport mobile panel (live-review finding). */}
        <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
          <EmptyState variant="pane" title={t('sessions.context.unavailable')} />
        </AppWorkspaceBody>
      </AppContent>
    );
  }

  const hasAnySection =
    !!value.executionScope || !!value.attention?.length || !!value.relatedTasks?.length;

  if (!hasAnySection) {
    return (
      <AppContent className="h-full w-full">
        <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
          <EmptyState variant="pane" title={t('sessions.context.empty')} />
        </AppWorkspaceBody>
      </AppContent>
    );
  }

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        {/* `m-auto`, inside the full-height flex column above, centres a short Context (one or two
            small sections) within the tall mobile panel instead of leaving it pinned to the top of
            a mostly-blank viewport; a Context long enough to overflow computes its auto margins to
            `0` and simply starts at the top as before, so this never fights normal scrolling. */}
        <div className="m-auto grid w-full gap-6">
          {value.executionScope && (
            <section className="grid gap-1">
              <Typography variant="section-label">
                {t('sessions.context.executionScope')}
              </Typography>
              <ExecutionScope scope={value.executionScope} onOpenTask={openTask} />
            </section>
          )}
          {!!value.attention?.length && (
            <section className="grid gap-2">
              <Typography variant="section-label">{t('sessions.context.attention')}</Typography>
              <ul className="grid gap-2">
                {value.attention.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <StatusIndicator
                      tone={item.tone}
                      decorative={false}
                      aria-label={t(`sessions.context.attentionTone.${item.tone}`)}
                      className="mt-1.5"
                    />
                    {item.task && !item.readOnly ? (
                      <Button
                        variant="ghost"
                        className="h-auto justify-start whitespace-normal text-left text-body-sm"
                        onClick={() => openTask(item.task!)}
                      >
                        {item.summary}
                      </Button>
                    ) : (
                      <p className="text-body-sm text-content-secondary">{item.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!value.relatedTasks?.length && (
            <section className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <Typography variant="section-label">
                  {t('sessions.context.relatedTasks')}
                </Typography>
                <Button size="sm" variant="ghost" onClick={openTasksList}>
                  {t('sessions.context.openTasks')}
                </Button>
              </div>
              <ul className="grid gap-1">
                {value.relatedTasks.map((task) => (
                  <li key={task.id}>
                    <TaskLink task={task} onOpen={openRelatedTask} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function ExecutionScope({
  scope,
  onOpenTask,
}: {
  scope: NonNullable<SessionContextViewModel['executionScope']>;
  onOpenTask: (task: SessionContextTaskRef) => void;
}) {
  const { t } = useTranslation();

  if (scope.kind === 'generic') {
    return <p className="text-body-sm text-content-secondary">{t('sessions.context.generic')}</p>;
  }

  if (scope.kind === 'single-task') {
    return (
      <div className="grid gap-1">
        {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
        <TaskLink task={scope.task} onOpen={onOpenTask} />
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
      <p className="text-body-sm text-content-secondary">
        {t('sessions.context.batch', { count: scope.tasks.length })}
      </p>
      <ul className="grid gap-1">
        {scope.tasks.map((task) => (
          <li key={task.id}>
            <TaskLink task={task} onOpen={onOpenTask} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskLink({
  task,
  onOpen,
}: {
  task: SessionContextTaskRef;
  onOpen: (task: SessionContextTaskRef) => void;
}) {
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start whitespace-normal text-left"
      onClick={() => onOpen(task)}
    >
      <span className="grid gap-0.5">
        <Typography variant="label-sm" className="text-content-muted">
          {task.key}
        </Typography>
        <span className="text-body-sm text-content-primary">{task.title}</span>
        {task.note && <span className="text-body-sm text-content-secondary">{task.note}</span>}
      </span>
    </Button>
  );
}

/**
 * Narrow fallback: on layouts that cannot show Primary + Secondary side by side, Context is not
 * auto-pushed (full-session-screen-structure.md §3.3); a header action opens it as a pushed local
 * detail instead, the same fallback the retired demo-era `SessionContextPanel` used to have.
 *
 * Context here is a *runtime* Secondary flow (there is no default/static Secondary on narrow), so
 * `ContextScreen` below passes this flow's own `navTo` as `openStack`: opening a Task from inside
 * Context pushes onto this SAME flow's Back stack instead of starting a second, parallel one, so
 * Back returns to Context first instead of skipping it straight to the Session.
 */
export function createSessionContextStack(sessionId: string, value: SessionContextViewModel) {
  return defineSecondaryStack<
    Record<string, never>,
    { sessionId: string; value: SessionContextViewModel },
    { context: Record<string, never> }
  >({
    id: 'managed-session-context',
    initial: 'context',
    useData: () => ({ status: 'ready', data: { sessionId, value } }),
    screens: {
      context: {
        get title() {
          return translateNow('sessions.context.title');
        },
        component: ({ data }) => <ContextScreen sessionId={data.sessionId} value={data.value} />,
      },
    },
  });
}

/** Wraps `SessionContext` with the Context flow's own `navTo`, so Related Tasks/Task push onto
 * this flow's stack rather than opening a second, parallel one (see `createSessionContextStack`). */
function ContextScreen({
  sessionId,
  value,
}: {
  sessionId: string;
  value: SessionContextViewModel;
}) {
  const stack = useSecondaryStack<{ context: Record<string, never> }>();
  const openStack: OpenSecondaryStack = (target, params) => stack.navTo(target, params);

  return <SessionContext sessionId={sessionId} value={value} openStack={openStack} />;
}

function collectTasks(value: SessionContextViewModel): SessionContextTaskRef[] {
  const tasks = new Map<string, SessionContextTaskRef>();
  const add = (task: SessionContextTaskRef) => tasks.set(task.id, task);
  if (value.executionScope?.kind === 'single-task') {
    add(value.executionScope.task);
  } else if (value.executionScope?.kind === 'batch') {
    value.executionScope.tasks.forEach(add);
  }

  value.attention?.forEach((item) => item.task && add(item.task));
  value.relatedTasks?.forEach(add);

  return [...tasks.values()];
}
