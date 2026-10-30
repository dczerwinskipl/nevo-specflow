import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  Button,
  StatusIndicator,
  Typography,
  defineSecondaryStack,
  useSecondaryNavigation,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { createSessionTasksInspector } from './SessionTasksInspector';
import type { SessionContextTaskRef, SessionContextViewModel } from './sessionContextTypes';

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
}: {
  sessionId: string;
  value: SessionContextViewModel;
}) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();
  const allTasks = useMemo(() => collectTasks(value), [value]);
  const inspectors = useMemo(() => createSessionTasksInspector(allTasks), [allTasks]);

  function openTasksList() {
    void navigation.open(inspectors.tasksStack, { sessionId });
  }

  function openTask(task: SessionContextTaskRef) {
    void navigation.open(inspectors.taskStack, { sessionId, taskId: task.id });
  }

  if (value.status === 'unavailable') {
    return (
      <AppContent className="h-full w-full">
        <AppWorkspaceBody scroll="area">
          <p className="text-body-sm text-content-muted">{t('sessions.context.unavailable')}</p>
        </AppWorkspaceBody>
      </AppContent>
    );
  }

  const hasAnySection =
    !!value.executionScope || !!value.attention?.length || !!value.relatedTasks?.length;

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <div className="grid gap-6">
          {!hasAnySection && (
            <p className="text-body-sm text-content-muted">{t('sessions.context.empty')}</p>
          )}
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
                    <TaskLink task={task} onOpen={openTask} />
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
 * detail instead, exactly like `SessionContextPanel`'s own `!supportsSplit` fallback.
 *
 * Known V1 simplification: because this renders Context as a *runtime* Secondary flow (there is
 * no default/static Secondary on narrow), opening a Task from inside it starts a new flow rather
 * than pushing onto this one, so Back returns directly to the Session rather than to Context first.
 * The split/Wide path (the primary validation target for this pass) does not have this limitation.
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
        component: ({ data }) => <SessionContext sessionId={data.sessionId} value={data.value} />,
      },
    },
  });
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
