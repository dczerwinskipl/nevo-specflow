import { useMemo, useState, type ReactNode } from 'react';
import { userEvent, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
} from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from './api';
import { createSessionFeed } from './feed';
import { createWorkInspector } from './WorkInspector';
import { fixtureSessionId } from './managedSession.stories-support';
import { workInspectorTurnId } from './managedSession.workInspector.stories-support';

/**
 * The Work Inspector stories' shared harness: `createWorkInspector` mounted directly through the
 * real `AppWorkspace`/Secondary-stack runtime (the same mechanism `ManagedSession.tsx` uses via
 * `navigation.open(workStack, ...)`), deliberately not through `ManagedSession` itself.
 */
export function WorkInspectorEnvironment({ children }: { children: ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  return (
    <StoryLocalization locale="pl">
      <QueryClientProvider client={query}>
        <div className="h-dvh">
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspaceProvider>{children}</AppWorkspaceProvider>
          </AppShell>
        </div>
      </QueryClientProvider>
    </StoryLocalization>
  );
}

export function WorkInspectorHost({ api }: { api: ManagedSessionsApi }) {
  const feed = useMemo(
    () => createSessionFeed(api, fixtureSessionId, 'work-inspector-story'),
    [api],
  );
  const workStack = useMemo(
    () => createWorkInspector(api, feed, 'work-inspector-story'),
    [api, feed],
  );
  const navigation = useSecondaryNavigation();

  // `fit="available"` + `split="dynamic"` mirror `ManagedSession.tsx`'s real `<AppWorkspace>`
  // usage. Without them this harness defaulted to `fit="content"` + the fixed `split="primary"`
  // 75/25 preset, which — unlike `dynamic`'s `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` (330px) floor
  // — gives the Secondary drill-in panel only ~25% of the content width (≈293px at 1440px),
  // collapsing the toolbar row and clipping the search field well below what the real app ever
  // renders (`WorkFilterBar`'s own filter-Menu-not-SegmentedControl choice is explicitly sized
  // against that same 330px floor).
  return (
    <AppWorkspace fit="available" split="dynamic">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Sesja" />}>
        <button
          type="button"
          onClick={() =>
            void navigation.open(workStack, {
              sessionId: fixtureSessionId,
              turnId: workInspectorTurnId,
            })
          }
        >
          Zobacz pracę
        </button>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

export async function openWork(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('Zobacz pracę'));
}
