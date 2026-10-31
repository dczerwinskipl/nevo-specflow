import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspaceBody,
  EmptyState,
  defineSecondaryStack,
  type IconName,
} from '@nevo/ui';
import type { MessageKey } from '../../../../i18n/message';
import { translateNow } from '../../../../i18n/message';

/**
 * Navigation-skeleton placeholder root tabs for Context's other subjects
 * (full-session-screen-structure.md §7.4: "Its concise, clickable content summaries open/reselect
 * root tabs such as Tasks, Files/Changes, History, Handovers, Artifacts, Instructions or
 * Environment when useful"). Tasks already has a real tab (`SessionTasksInspector.tsx`); none of
 * the other six has a real screen anywhere in the product yet (confirmed by search — there is no
 * Files/Changes, History, Handovers, Artifacts, Instructions or Environment view today), so each
 * opens the SAME shared "not yet implemented" placeholder screen instead of faking real content.
 *
 * The point of this pass is only to prove the navigation mechanics end to end — Context's row ->
 * `useSecondaryNavigation().openTab` -> a real Secondary tab -> the tab strip -> close/reopen —
 * for every one of Context's originally-planned root tabs, not to build their real content (that
 * is explicitly out of this task's scope; see this task's handoff for the open follow-up).
 */
export interface PlaceholderRootTab {
  id: string;
  icon: IconName;
  titleKey: MessageKey;
  stack: ReturnType<typeof definePlaceholderStack>;
}

interface Root {
  sessionId: string;
}

function PlaceholderScreen({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useTranslation();

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        <EmptyState
          variant="pane"
          title={t(titleKey)}
          description={t('sessions.context.placeholders.notYetImplemented')}
        />
      </AppWorkspaceBody>
    </AppContent>
  );
}

/** One single-screen root tab per placeholder subject — the same `defineSecondaryStack` mechanism
 * `createSessionTasksInspector` uses for the real Tasks tab, minus a local stack (there is nothing
 * to drill into yet). */
function definePlaceholderStack(id: string, titleKey: MessageKey) {
  return defineSecondaryStack<Root, Root, { placeholder: Record<string, never> }>({
    id: `managed-session-context-placeholder-${id}`,
    initial: 'placeholder',
    tabLabel: () => translateNow(titleKey),
    useData: (params) => ({ status: 'ready', data: params }),
    screens: {
      placeholder: {
        get title() {
          return translateNow(titleKey);
        },
        component: () => <PlaceholderScreen titleKey={titleKey} />,
      },
    },
  });
}

/**
 * Exactly the six remaining subjects §7.4 names besides Tasks, in the order the doc lists them.
 * `icon` names are confirmed members of the real `iconRegistry` (`Icon.tsx`), not guesses.
 */
export const placeholderRootTabs: PlaceholderRootTab[] = [
  {
    id: 'files',
    icon: 'branch',
    titleKey: 'sessions.context.placeholders.files',
    stack: definePlaceholderStack('files', 'sessions.context.placeholders.files'),
  },
  {
    id: 'history',
    icon: 'clock',
    titleKey: 'sessions.context.placeholders.history',
    stack: definePlaceholderStack('history', 'sessions.context.placeholders.history'),
  },
  {
    id: 'handovers',
    icon: 'arrow-right',
    titleKey: 'sessions.context.placeholders.handovers',
    stack: definePlaceholderStack('handovers', 'sessions.context.placeholders.handovers'),
  },
  {
    id: 'artifacts',
    icon: 'archive',
    titleKey: 'sessions.context.placeholders.artifacts',
    stack: definePlaceholderStack('artifacts', 'sessions.context.placeholders.artifacts'),
  },
  {
    id: 'instructions',
    icon: 'book-open',
    titleKey: 'sessions.context.placeholders.instructions',
    stack: definePlaceholderStack('instructions', 'sessions.context.placeholders.instructions'),
  },
  {
    id: 'environment',
    icon: 'server',
    titleKey: 'sessions.context.placeholders.environment',
    stack: definePlaceholderStack('environment', 'sessions.context.placeholders.environment'),
  },
];
