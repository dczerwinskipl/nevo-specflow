import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  Button,
  EmptyState,
  Icon,
  InformationList,
  StatusIndicator,
  Typography,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryStackDefinition,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { OperationalRow } from '../../../../shared/operational-list';
import { placeholderRootTabs, type PlaceholderRootTab } from './SessionContextPlaceholderTabs';
import { createSessionTasksInspector } from './SessionTasksInspector';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import { isTelemetryVisible } from './sessionTelemetry';
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
 * Structural order follows §7.2: Current execution, Attention/next actions, Related Tasks, the
 * §7.4 navigation skeleton into Context's other root-tab subjects (`OtherAreasSection` — owner
 * greenlit this pass, see `SessionContextPlaceholderTabs.tsx`), and — now that PR #107 documents
 * the telemetry contract (§23) — a low-emphasis Session details section carrying token usage/cost/
 * context occupancy/rate limits (`SessionTelemetrySection`). `Evidence` and the rest of Session
 * details (mode/capabilities/provider/model) remain deliberately out of this pass's scope (owner
 * decision 2) and are simply absent rather than stubbed.
 *
 * Every DYNAMIC section (execution/attention/related Tasks/telemetry) is independently optional
 * (owner decision 2 — a missing group must never crash or show a broken UI). `OtherAreasSection`
 * is not one of those — it is a fixed navigation entry point, always present once Context is
 * `ready`, so "every dynamic section absent" no longer means a literally empty Context.
 */
export function SessionContext({
  sessionId,
  value,
  openStack,
}: {
  sessionId: string;
  value: SessionContextViewModel;
  /**
   * How Tasks opens from here. On the narrow runtime Context flow (`createSessionContextStack`
   * below) this is that flow's own `navTo`, which pushes the Tasks tab's initial screen onto
   * Context's OWN stack — narrow has no tabs at all (full-session-screen-structure.md §10.3), so
   * this is a plain, correct push/pop, unchanged by the correction below. Omitted on the
   * wide/split-capable default Secondary (see `ManagedSession`), where Tasks instead opens as its
   * own root tab via `navigation.openTab` (see `openTasksTab` below) — never the single shared
   * "legacy open" slot `useSecondaryNavigation().open` reserves for other features.
   */
  openStack?: OpenSecondaryStack;
}) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();
  const allTasks = useMemo(() => collectTasks(value), [value]);
  const inspectors = useMemo(() => createSessionTasksInspector(allTasks), [allTasks]);

  /**
   * Opens/reselects the ONE "Tasks" root tab (full-session-screen-structure.md §7.4/§10.1 — see
   * `SessionTasksInspector.tsx`'s module comment for the full contract and its
   * `tasksStack`/`taskDeepLinkStack` mechanism). `stack` is `inspectors.tasksStack` for the plain
   * list, or `inspectors.taskDeepLinkStack` (same tab id, different `initial` screen) to start a
   * FRESH tab straight on a specific Task instead of forcing the list first — still exactly one
   * tab either way, never one per Task (the confirmed bug this replaces: Related Tasks used to
   * call `navigation.openTab` with a per-Task `instanceId`, giving each related Task its own
   * independent tab and losing its Tasks-tab provenance).
   */
  function openTasksTab(stack: typeof inspectors.tasksStack, taskId?: string) {
    const params = { sessionId, taskId };
    if (openStack) {
      void openStack(stack, params);

      return;
    }

    void navigation.openTab(stack, params);
  }

  function openTasksList() {
    openTasksTab(inspectors.tasksStack);
  }

  /** Opens a specific Task directly (current-execution Task, Attention's task reference, or a
   * Related Tasks summary with exactly one entry) — still the single Tasks tab, deep-linked
   * straight to that Task's detail when the tab does not exist yet (see `openTasksTab`). */
  function openTask(task: SessionContextTaskRef) {
    openTasksTab(inspectors.taskDeepLinkStack, task.id);
  }

  /**
   * Related Tasks' single summary row (owner correction, live review): Context is a navigational
   * entry point, not a place that lists every related Task inline — it shows one row naming how
   * many related Tasks exist and leads further. With exactly one related Task the row goes
   * straight to it (`openTask`). With more than one, it reuses the existing Tasks list screen
   * (`inspectors.tasksStack`, previously reachable only via a separate "Open Tasks" button) as
   * that dedicated subject view — no new list screen invented for this fix.
   */
  function openRelatedTasksEntry() {
    const relatedTasks = value.relatedTasks;
    if (relatedTasks?.length === 1) {
      openTask(relatedTasks[0]!);

      return;
    }

    openTasksList();
  }

  /**
   * Navigation-skeleton rows for Context's other originally-planned root tabs
   * (full-session-screen-structure.md §7.4 — see `SessionContextPlaceholderTabs.tsx`'s module
   * comment). Same open mechanism as Tasks: `openStack` on the narrow runtime flow, `openTab` on
   * the wide/split-capable default Secondary.
   */
  function openPlaceholderTab(tab: PlaceholderRootTab) {
    const params = { sessionId };
    if (openStack) {
      void openStack(tab.stack, params);

      return;
    }

    void navigation.openTab(tab.stack, params);
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

  /**
   * No longer gates a full-pane `EmptyState` on its own (live-review Part 2 correction): Context
   * now always offers the `OtherAreasSection` navigation skeleton once it is `ready`, so a Session
   * with every DYNAMIC section (execution/attention/related Tasks/telemetry) absent is never
   * actually empty — there is still real, clickable content below. `hasAnySection` only decides
   * whether the inline "no additional context" note shows alongside that skeleton, not whether
   * anything renders at all.
   */
  const hasAnySection =
    !!value.executionScope ||
    !!value.attention?.length ||
    !!value.relatedTasks?.length ||
    isTelemetryVisible(value.telemetry);

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        {/* No vertical `m-auto` centering here (confirmed live-review bug — a short Context read
            as oddly centred in a tall panel instead of starting at the top like every other
            scrolled surface; this div previously centred itself, compounding `ManagedSession`'s
            own scroll-architecture contribution to the same complaint). Starts at the top and
            simply scrolls once content overflows, like an ordinary panel. */}
        <div className="grid w-full gap-6">
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
                        size="sm"
                        className="h-auto justify-start whitespace-normal text-left"
                        onClick={() => openTask(item.task!)}
                      >
                        {item.summary}
                      </Button>
                    ) : (
                      <Typography variant="body-sm" className="text-content-secondary">
                        {item.summary}
                      </Typography>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!value.relatedTasks?.length && (
            <section className="grid gap-1">
              <Typography variant="section-label">{t('sessions.context.relatedTasks')}</Typography>
              {/* One navigational summary row, not the individual Task list (live-review
                  correction): Context is an entry point into its subjects, it does not dump every
                  related Task inline. */}
              <InformationList>
                <OperationalRow
                  leading={<Icon name="list-checks" size="sm" className="text-content-muted" />}
                  primary={t('sessions.context.batch', { count: value.relatedTasks.length })}
                  onPrimaryClick={openRelatedTasksEntry}
                  trailing={
                    <Icon
                      name="chevron-right"
                      size="sm"
                      className="text-content-muted"
                      aria-hidden="true"
                    />
                  }
                />
              </InformationList>
            </section>
          )}
          {!hasAnySection && (
            <Typography variant="body-sm" className="text-content-secondary">
              {t('sessions.context.empty')}
            </Typography>
          )}
          <OtherAreasSection onOpen={openPlaceholderTab} />
          <SessionTelemetrySection telemetry={value.telemetry} />
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

/**
 * Navigation skeleton (full-session-screen-structure.md §7.4, owner-greenlit): one clickable row
 * per remaining root-tab subject besides Tasks, built from the same real `OperationalRow` list
 * pattern. Every row opens a real Secondary tab (see `SessionContextPlaceholderTabs.tsx`) — a
 * minimal shared "not yet implemented" placeholder screen where no real one exists yet — so the
 * navigation mechanics (Context -> tab -> tab strip -> close/reopen) are genuinely exercised, not
 * faked. Always present once Context itself is `ready` (independent of `hasAnySection`'s dynamic
 * sections above): it is a fixed entry point into the other subjects, not session-derived content
 * that can legitimately be absent.
 */
function OtherAreasSection({ onOpen }: { onOpen: (tab: PlaceholderRootTab) => void }) {
  const { t } = useTranslation();

  return (
    <section className="grid gap-1">
      <Typography variant="section-label">
        {t('sessions.context.placeholders.sectionTitle')}
      </Typography>
      <InformationList>
        {placeholderRootTabs.map((tab) => (
          <OperationalRow
            key={tab.id}
            leading={<Icon name={tab.icon} size="sm" className="text-content-muted" />}
            primary={t(tab.titleKey)}
            onPrimaryClick={() => onOpen(tab)}
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
    </section>
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
    return (
      <Typography variant="body-sm" className="text-content-secondary">
        {t('sessions.context.generic')}
      </Typography>
    );
  }

  if (scope.kind === 'single-task') {
    return (
      <div className="grid gap-1">
        {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
        <InformationList>
          <TaskLink task={scope.task} onOpen={onOpenTask} />
        </InformationList>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      {scope.role && <Typography variant="title-sm">{scope.role}</Typography>}
      <Typography variant="body-sm" className="text-content-secondary">
        {t('sessions.context.batch', { count: scope.tasks.length })}
      </Typography>
      <InformationList>
        {scope.tasks.map((task) => (
          <TaskLink key={task.id} task={task} onOpen={onOpenTask} />
        ))}
      </InformationList>
    </div>
  );
}

/** A Task reference row (current-execution Task, or the single related-Tasks summary's direct
 * target): the real `OperationalRow` list-row pattern (icon, title, trailing chevron) already
 * used across Tasks/Sessions, not bespoke stacked text in a `Button` — so it visibly affords
 * "this leads further" like every other operational list row in the product (live-review
 * finding). */
function TaskLink({
  task,
  onOpen,
}: {
  task: SessionContextTaskRef;
  onOpen: (task: SessionContextTaskRef) => void;
}) {
  return (
    <OperationalRow
      leading={<Icon name="list-checks" size="sm" className="text-content-muted" />}
      primary={task.title}
      compactFacts={[{ text: task.key, mono: true }]}
      supporting={task.note}
      onPrimaryClick={() => onOpen(task)}
      trailing={
        <Icon name="chevron-right" size="sm" className="text-content-muted" aria-hidden="true" />
      }
    />
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
