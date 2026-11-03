import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryStackDefinition,
} from '@nevo/ui';
import { translateNow } from '../../../../i18n/message';
import { ContextExecutorSection } from './ContextExecutorSection';
import { ContextPlannedAreasSection } from './ContextPlannedAreasSection';
import { ContextNote } from './ContextSectionFrame';
import { ContextSpecificationSection } from './ContextSpecificationSection';
import {
  ContextAttentionSection,
  ContextExecutionSection,
  ContextRelatedTasksSection,
} from './ContextTaskSections';
import { ContextWorkSection } from './ContextWorkSection';
import type { PlaceholderRootTab } from './SessionContextPlaceholderTabs';
import { createSessionTasksInspector } from './SessionTasksInspector';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import type {
  ContextSpecification,
  SessionContextTaskRef,
  SessionContextViewModel,
} from './sessionContextTypes';

/**
 * `SessionContext` only ever passes a Work stack through to `openStack`/`navigation.openTab` —
 * it never reads its `Data`/`Pages` shape itself, so this stays deliberately generic over those
 * (unlike `OpenSecondaryStack` below, a concrete `ReturnType<typeof createWorkInspector>` would
 * force every caller, including tests, to construct `WorkInspector.tsx`'s own `{api, feed,
 * owner}` data shape just to satisfy the type — real coupling this component does not have).
 */
type WorkHistoryStack = SecondaryStackDefinition<
  { sessionId: string; turnId: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  any
>;

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
 * Fixed section order, top to bottom: Executor (+ the scope note), Specification (identity row +
 * Documents row), Current execution, Attention, Related Tasks, Work, Planned areas, then Session
 * details (telemetry) always last. Each fact-backed section resolves its `ContextFact` through
 * `resolveSection` (`sessionContextAvailability.ts`, §7.6): no association is omitted, loading is
 * label + skeleton rows, data that exists but cannot be read is a warning note, a missing required
 * reference an error note. Planned areas are a flat preview of subjects without a real screen yet.
 * The sections live in their own files next to this one.
 */
export function SessionContext({
  sessionId,
  value,
  openStack,
  onOpenSpecification,
  onOpenDocuments,
  workStack,
}: {
  sessionId: string;
  value: SessionContextViewModel;
  /**
   * How Tasks opens from here. On the narrow runtime Context flow (`createSessionContextStack`
   * below) this is that flow's own `navTo`, which pushes the Tasks tab's initial screen onto
   * Context's OWN stack — narrow has no tabs at all (full-session-screen-structure.md §10.3), so
   * this is a plain, correct push/pop. Omitted on the wide/split-capable default Secondary (see
   * `ManagedSession`), where each Task (and the Tasks list) opens as its own root tab via
   * `navigation.openTab`.
   */
  openStack?: OpenSecondaryStack;
  /**
   * Opens the Specification this session belongs to: a real, cross-feature route navigation
   * (`/specs/$specId`), not a Secondary tab. `SessionContext` stays router-agnostic (it is mounted,
   * unrouted, by its stories and tests) and hands the `{id, key, title}` to this callback; the route
   * composition wires it. Omitted: the Specification row does not render.
   */
  onOpenSpecification?: (specification: ContextSpecification) => void;
  /**
   * Opens that Specification's Documents (`/specs/$specId/documents`), remembering this Session as
   * the way back. Same router-agnostic contract as `onOpenSpecification`. Omitted: no Documents row.
   */
  onOpenDocuments?: (specification: ContextSpecification) => void;
  /**
   * The Work history stack `ManagedSession` also uses for its Conversation Work blocks
   * (`createWorkInspector`), passed in so both entry points share its per-Turn tab identity
   * (full-session-screen-structure.md §8.3): the "Work history" row and the chat block of the same
   * Turn call `openTab` with the same `{ sessionId, turnId }`, so they land on one tab. Omitted: no
   * Work section.
   */
  workStack?: WorkHistoryStack;
}) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();
  const allTasks = useMemo(() => collectTasks(value), [value]);
  const inspectors = useMemo(() => createSessionTasksInspector(allTasks), [allTasks]);

  /**
   * Opens a Tasks surface (full-session-screen-structure.md §7.4/§10.1 — see
   * `SessionTasksInspector.tsx`'s module comment). With `openStack` (the narrow Context flow) it is
   * a push onto that flow, flagged `inFlow` so the list also pushes Tasks instead of opening tabs.
   * Otherwise it is `openTab`: `inspectors.tasksStack` is the one list tab, `inspectors.taskStack`
   * is one tab per Task (instance = the task id), so a Task already open is activated, never
   * retargeted or duplicated.
   */
  function openTasksTab(stack: typeof inspectors.tasksStack, taskId?: string) {
    if (openStack) {
      void openStack(stack, { sessionId, taskId, inFlow: true });

      return;
    }

    void navigation.openTab(stack, { sessionId, taskId });
  }

  /** Opens a specific Task (current-execution Task, Attention's task reference, or a Related Tasks
   * summary with exactly one entry): its own root tab, activated if already open. */
  function openTask(task: SessionContextTaskRef) {
    openTasksTab(inspectors.taskStack, task.id);
  }

  /** Related Tasks' summary row: exactly one Task goes straight to it, several to the shared
   * Tasks list (selecting a Task there opens that Task's own tab). */
  function openRelatedTasksEntry(tasks: SessionContextTaskRef[]) {
    if (tasks.length === 1) {
      openTask(tasks[0]!);

      return;
    }

    openTasksTab(inspectors.tasksStack);
  }

  /** Planned-area rows open their placeholder tab the same way as Tasks (`openStack`/`openTab`). */
  function openPlaceholderTab(tab: PlaceholderRootTab) {
    const params = { sessionId };
    if (openStack) {
      void openStack(tab.stack, params);

      return;
    }

    void navigation.openTab(tab.stack, params);
  }

  /** Opens/reselects the Work history tab of one Turn: one tab per Turn (`workStack`'s
   * `instanceId`), shared with that Turn's chat Work block; another Turn has its own. */
  function openWorkHistory(turnId: string) {
    if (!workStack) {
      return;
    }

    const params = { sessionId, turnId };
    if (openStack) {
      void openStack(workStack, params);

      return;
    }

    void navigation.openTab(workStack, params);
  }

  const scope = value.scope;

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        {/* Starts at the top and scrolls once content overflows (no vertical centring). */}
        <div className="grid w-full gap-6">
          <ContextExecutorSection executor={value.executor} scope={scope}>
            {scope.kind === 'unknown' && (
              <ContextNote kind={scope.reason === 'unreadable' ? 'warning' : 'info'}>
                {t(
                  scope.reason === 'unreadable'
                    ? 'sessions.context.availability.scopeUnreadable'
                    : 'sessions.context.availability.scopeNotProvided',
                )}
              </ContextNote>
            )}
          </ContextExecutorSection>
          <ContextSpecificationSection
            value={value}
            onOpenSpecification={onOpenSpecification}
            onOpenDocuments={onOpenDocuments}
          />
          <ContextExecutionSection value={value} onOpenTask={openTask} />
          <ContextAttentionSection value={value} onOpenTask={openTask} />
          <ContextRelatedTasksSection value={value} onOpen={openRelatedTasksEntry} />
          <ContextWorkSection
            workHistory={value.workHistory}
            runningTurnId={value.runningTurnId}
            onOpen={workStack ? openWorkHistory : undefined}
          />
          <ContextPlannedAreasSection onOpen={openPlaceholderTab} />
          <SessionTelemetrySection
            telemetry={value.telemetry}
            runningTurnId={value.runningTurnId}
          />
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

/**
 * Narrow fallback: on layouts that cannot show Primary + Secondary side by side, Context is not
 * auto-pushed (full-session-screen-structure.md §3.3); a header action opens it as a pushed local
 * detail instead.
 *
 * Context here is a *runtime* Secondary flow (there is no default/static Secondary on narrow), so
 * `ContextScreen` below passes this flow's own `navTo` as `openStack`: opening a Task from inside
 * Context pushes onto this SAME flow's Back stack instead of starting a second, parallel one, so
 * Back returns to Context first instead of skipping it straight to the Session.
 */
export function createSessionContextStack(
  sessionId: string,
  value: SessionContextViewModel,
  onOpenSpecification?: (specification: ContextSpecification) => void,
  workStack?: WorkHistoryStack,
  onOpenDocuments?: (specification: ContextSpecification) => void,
) {
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
        component: ({ data }) => (
          <ContextScreen
            sessionId={data.sessionId}
            value={data.value}
            onOpenSpecification={onOpenSpecification}
            onOpenDocuments={onOpenDocuments}
            workStack={workStack}
          />
        ),
      },
    },
  });
}

/** Wraps `SessionContext` with the Context flow's own `navTo`, so Related Tasks/Task push onto
 * this flow's stack rather than opening a second, parallel one (see `createSessionContextStack`). */
function ContextScreen({
  sessionId,
  value,
  onOpenSpecification,
  onOpenDocuments,
  workStack,
}: {
  sessionId: string;
  value: SessionContextViewModel;
  onOpenSpecification?: (specification: ContextSpecification) => void;
  onOpenDocuments?: (specification: ContextSpecification) => void;
  workStack?: WorkHistoryStack;
}) {
  const stack = useSecondaryStack<{ context: Record<string, never> }>();
  const openStack: OpenSecondaryStack = (target, params) => stack.navTo(target, params);

  return (
    <SessionContext
      sessionId={sessionId}
      value={value}
      openStack={openStack}
      onOpenSpecification={onOpenSpecification}
      onOpenDocuments={onOpenDocuments}
      workStack={workStack}
    />
  );
}

function collectTasks(value: SessionContextViewModel): SessionContextTaskRef[] {
  const tasks = new Map<string, SessionContextTaskRef>();
  const add = (task: SessionContextTaskRef) => tasks.set(task.id, task);
  const execution =
    value.executionScope?.status === 'ready' ? value.executionScope.value : undefined;
  if (execution?.kind === 'single-task') {
    add(execution.task);
  } else if (execution?.kind === 'batch') {
    execution.tasks.forEach(add);
  }

  if (value.attention?.status === 'ready') {
    value.attention.value.forEach((item) => item.task && add(item.task));
  }

  if (value.relatedTasks?.status === 'ready') {
    value.relatedTasks.value.forEach(add);
  }

  return [...tasks.values()];
}
