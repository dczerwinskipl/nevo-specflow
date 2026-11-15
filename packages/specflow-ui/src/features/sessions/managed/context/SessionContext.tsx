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
import { isSectionPresent } from './sessionContextAvailability';
import {
  ContextAttentionSection,
  ContextExecutionSection,
  ContextRelatedTasksSection,
} from './ContextTaskSections';
import { ContextWorkSection } from './ContextWorkSection';
import type { PlaceholderRootTab } from './SessionContextPlaceholderTabs';
import { taskStack, tasksStack } from './SessionTasksInspector';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import {
  useSessionContextSource,
  type SessionContextSource,
  type WorkHistoryStack,
} from './sessionContextValue';
import type {
  ContextSpecification,
  SessionContextTaskRef,
  SessionContextViewModel,
} from './sessionContextTypes';

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
 * Full Session Context Secondary (full-session.md "Context").
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
  onOpenDocumentation,
  workStack,
}: {
  sessionId: string;
  value: SessionContextViewModel;
  /**
   * How Tasks opens from here. On the narrow runtime Context flow (`createSessionContextStack`
   * below) this is that flow's own `navTo`, which pushes the Tasks tab's initial screen onto
   * Context's OWN stack — narrow has no tabs at all (full-session.md "Secondary tabs"), so
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
   * Opens the project documentation of this Session's workspace, with this Session as the way
   * back. Same router-agnostic contract as `onOpenSpecification`. Omitted: no Documentation row.
   */
  onOpenDocumentation?: () => void;
  /**
   * The Work history stack `ManagedSession` also uses for its Conversation Work blocks
   * (`createWorkInspector`), passed in so both entry points share its per-Turn tab identity
   * (full-session.md "Work history (L2)"): the "Work history" row and the chat block of the same
   * Turn call `openTab` with the same `{ sessionId, turnId }`, so they land on one tab. Omitted: no
   * Work section.
   */
  workStack?: WorkHistoryStack;
}) {
  const { t } = useTranslation();
  const navigation = useSecondaryNavigation();

  /**
   * Opens a Tasks surface (full-session.md "Secondary tabs" — see
   * `SessionTasksInspector.tsx`'s module comment). With `openStack` (the narrow Context flow) it is
   * a push onto that flow, flagged `inFlow` so the list also pushes Tasks instead of opening tabs.
   * Otherwise it is `openTab`: `tasksStack` is the one list tab, `taskStack` is one tab per Task
   * (instance = the task id), so a Task already open is activated, never retargeted or duplicated.
   * Both read the live Tasks (`SessionContextSourceProvider`), not this render's.
   */
  function openTasksTab(stack: typeof tasksStack, task?: SessionContextTaskRef) {
    const root = { sessionId, taskId: task?.id, taskKey: task?.key };
    if (openStack) {
      void openStack(stack, { ...root, inFlow: true });

      return;
    }

    void navigation.openTab(stack, root);
  }

  /** Opens a specific Task (current-execution Task, Attention's task reference, or a Related Tasks
   * row): its own root tab, activated if already open. */
  function openTask(task: SessionContextTaskRef) {
    openTasksTab(taskStack, task);
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
        {/* Takes focus when a focused control inside Context goes away (never the document). */}
        <div className="grid w-full gap-6 outline-none" tabIndex={-1} data-context-focus-fallback>
          <ContextExecutorSection executor={value.executor} scope={scope}>
            {scope.kind === 'unknown' && scope.reason === 'unreadable' && (
              <ContextNote kind="warning">
                {t('sessions.context.availability.scopeUnreadable')}
              </ContextNote>
            )}
          </ContextExecutorSection>
          <ContextSpecificationSection
            value={value}
            onOpenSpecification={onOpenSpecification}
            onOpenDocuments={onOpenDocuments}
            onOpenDocumentation={onOpenDocumentation}
          />
          <ContextExecutionSection value={value} onOpenTask={openTask} />
          <ContextAttentionSection value={value} onOpenTask={openTask} />
          <ContextRelatedTasksSection value={value} onOpen={openTask} />
          <ContextWorkSection
            workHistory={value.workHistory}
            runningTurnId={value.runningTurnId}
            onOpen={workStack ? openWorkHistory : undefined}
            // Without a Specification section, the documentation is the first row of Work.
            onOpenDocumentation={
              isSectionPresent('specification', scope) ? undefined : onOpenDocumentation
            }
          />
          <ContextPlannedAreasSection onOpen={openPlaceholderTab} />
          <SessionTelemetrySection
            telemetry={value.telemetry}
            runningTurnId={value.runningTurnId}
            limitsRefresh={value.limitsRefresh}
          />
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

/**
 * Narrow fallback: on layouts that cannot show Primary + Secondary side by side, Context is not
 * auto-pushed (full-session.md "Secondary tabs"); a header action opens it as a pushed local
 * detail instead.
 *
 * Context here is a *runtime* Secondary flow (there is no default/static Secondary on narrow), so
 * `ContextScreen` below passes this flow's own `navTo` as `openStack`: opening a Task from inside
 * Context pushes onto this SAME flow's Back stack instead of starting a second, parallel one, so
 * Back returns to Context first instead of skipping it straight to the Session.
 *
 * Defined once: its data is the host's LIVE `SessionContextSource`, never the value that was
 * current when the flow opened (a Context opened while still loading fills in when it arrives).
 */
export const sessionContextStack = defineSecondaryStack<
  Record<string, never>,
  SessionContextSource,
  { context: Record<string, never> }
>({
  id: 'managed-session-context',
  initial: 'context',
  useData: () => {
    const source = useSessionContextSource();

    return source ? { status: 'ready', data: source } : { status: 'unavailable' };
  },
  screens: {
    context: {
      get title() {
        return translateNow('sessions.context.title');
      },
      component: ({ data }) => <ContextScreen source={data} />,
    },
  },
});

/** Wraps `SessionContext` with the Context flow's own `navTo`, so Related Tasks/Task push onto
 * this flow's stack rather than opening a second, parallel one (see `sessionContextStack`). */
function ContextScreen({ source }: { source: SessionContextSource }) {
  const stack = useSecondaryStack<{ context: Record<string, never> }>();
  const openStack: OpenSecondaryStack = (target, params) => stack.navTo(target, params);

  return (
    <SessionContext
      sessionId={source.sessionId}
      value={source.value}
      openStack={openStack}
      onOpenSpecification={source.onOpenSpecification}
      onOpenDocuments={source.onOpenDocuments}
      onOpenDocumentation={source.onOpenDocumentation}
      workStack={source.workStack}
    />
  );
}
