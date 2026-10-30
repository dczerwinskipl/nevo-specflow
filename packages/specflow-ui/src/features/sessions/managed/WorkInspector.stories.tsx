import { useMemo, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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
import {
  actionsWorkId,
  createWorkInspectorFixtureApi,
  largeWorkTimelineItems,
  mixedWorkTimelineActions,
  mixedWorkTimelineItems,
  workInspectorTurnId,
} from './managedSession.workInspector.stories-support';

/**
 * The MUST-FIX Work (L2) timeline rebuild: Commentary-grouped chapters, a distinct collapsible
 * "Thinking" (Reasoning) row, type filters and search that preserve Commentary context, and
 * progressive ("Load older") paging instead of the old flat list's manual Starsze/Nowsze buttons.
 *
 * This mounts `createWorkInspector` directly through the real `AppWorkspace`/Secondary-stack
 * runtime (the same mechanism `ManagedSession.tsx` uses via `navigation.open(workStack, ...)`),
 * deliberately not through `ManagedSession` itself, which is under unrelated, parallel edit.
 */
function Environment({ children }: { children: ReactNode }) {
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

function WorkInspectorHost({ api }: { api: ManagedSessionsApi }) {
  const feed = useMemo(
    () => createSessionFeed(api, fixtureSessionId, 'work-inspector-story'),
    [api],
  );
  const workStack = useMemo(
    () => createWorkInspector(api, feed, 'work-inspector-story'),
    [api, feed],
  );
  const navigation = useSecondaryNavigation();

  return (
    <AppWorkspace split="primary">
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

const meta = {
  title: 'SpecFlow/Screens/Managed Session/Work inspector',
  component: WorkInspectorHost,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
} satisfies Meta<typeof WorkInspectorHost>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openWork(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('Zobacz pracę'));
}

export const CommentaryGroupingAndThinking: Story = {
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // Leading tool operations before any Commentary default to "Start of Turn".
    await expect(await canvas.findByText('Początek tury')).toBeVisible();
    await expect(canvas.getByText('Read file session.ts')).toBeVisible();

    // The Commentary itself is a readable Markdown heading for the phase that follows it.
    await expect(
      canvas.getByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();

    // Reasoning is a distinct, separately labeled, collapsible "Thinking" summary — collapsed by
    // default, never styled like a tool row or presented as Commentary.
    const thinkingTrigger = canvas.getByText('Myślenie').closest('button');
    if (!thinkingTrigger) {
      throw new Error('Expected "Myślenie" to be a disclosure trigger.');
    }

    await expect(thinkingTrigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(thinkingTrigger);
    await expect(
      await canvas.findByText(
        'Two approaches could fix this; the narrower one risks missing a related case.',
      ),
    ).toBeVisible();

    // A failed command stays its own isolated row — it never disappears into a successful group.
    await expect(canvas.getByText('Run command pnpm test')).toBeVisible();

    // Selecting a tool Work item with child ToolActions opens that exact Work's detail.
    await userEvent.click(canvas.getByText('Działania narzędzia'));
    await expect(await canvas.findByText('Edit · admission.mjs')).toBeVisible();
    await expect(canvas.getByText('Execute · pnpm test')).toBeVisible();
  },
};

export const TypeFilterPreservesCommentaryContext: Story = {
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Checking the implementation and locating the admission path…');
    await expect(canvas.getByText('Myślenie')).toBeVisible();

    await userEvent.click(canvas.getByText('Narzędzie'));
    await waitFor(() => expect(canvas.queryByText('Myślenie')).not.toBeInTheDocument());
    // The Commentary heading that groups the remaining tool rows is never stripped away.
    await expect(
      canvas.getByText('Checking the implementation and locating the admission path…'),
    ).toBeVisible();

    // The three happy-path tool reads/searches left after filtering compact into one collapsible
    // burst row; expanding it reaches the exact tool rows, still under their Commentary.
    const burstTrigger = canvas.getByText(/działania narzędzia/).closest('button');
    if (!burstTrigger) {
      throw new Error('Expected the tool burst to be a disclosure trigger.');
    }

    await userEvent.click(burstTrigger);
    await expect(await canvas.findByText('Read file admission.mjs')).toBeVisible();
  },
};

export const SearchPreservesCommentaryContext: Story = {
  args: {
    api: createWorkInspectorFixtureApi(mixedWorkTimelineItems(), {
      [actionsWorkId]: mixedWorkTimelineActions(),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);
    await canvas.findByText('Początek tury');

    const search = canvas.getByPlaceholderText('Szukaj w historii pracy');
    await userEvent.type(search, 'pnpm');

    // The unrelated Start of Turn chapter (no matching child) disappears entirely...
    await waitFor(() => expect(canvas.queryByText('Początek tury')).not.toBeInTheDocument());
    // ...while the matching command still shows which Commentary phase it belongs to.
    await expect(
      canvas.getByText('One test failed; checking the assertion before retrying…'),
    ).toBeVisible();
    await expect(canvas.getByText('Run command pnpm test')).toBeVisible();
  },
};

export const ProgressiveLoadingAtScale: Story = {
  args: {
    // The design doc's own "144 synthetic Work items" scalability scenario.
    api: createWorkInspectorFixtureApi(largeWorkTimelineItems(144)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await openWork(canvasElement);

    // Only the newest bounded page is mounted up front — the earliest phase is nowhere in the DOM.
    await canvas.findAllByText(/narrowing the admission failure…/);
    const initialCount = canvas.getAllByText(/narrowing the admission failure…/).length;
    await expect(canvas.queryByText(/Phase 0: narrowing/)).not.toBeInTheDocument();

    // Loading older content progressively adds more chapters without discarding the ones
    // already rendered (never an eager walk of the whole 144-item history).
    await userEvent.click(canvas.getByText('Wczytaj starszą historię pracy'));
    await waitFor(async () => {
      const nextCount = canvas.getAllByText(/narrowing the admission failure…/).length;
      await expect(nextCount).toBeGreaterThan(initialCount);
    });
  },
};
