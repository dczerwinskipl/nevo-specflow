import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ManagedSession } from './ManagedSession';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';
import {
  genericSpecLevelSnapshot,
  singleTaskSnapshot,
  terminalFailureSnapshot,
  unavailableSnapshot,
  waitingWithoutAttentionSnapshot,
} from './managedSession.fullSession.stories-support';
import {
  genericSpecLevelContext,
  pendingInteractionContext,
  singleTaskContext,
  terminalOutcomeContext,
  unavailableContext,
  waitingWithoutAttentionContext,
} from './context/sessionContextFixtures';

/**
 * Full Session states required by this pass (owner decision 2):
 * generic/spec-level (§12), single-Task (§13), pending interaction (§15),
 * waiting-without-attention (§18), terminal failure/cancel/interrupt (§19), unavailable (§20).
 * Each story composes the real `ManagedSession` screen (Primary conversation + Context Secondary)
 * from a representative canonical `SessionSnapshot` plus a product-owned Context mock view model
 * (`sessionContextFixtures.ts`) — Context has no real backend projection yet, see the Full Session
 * UX report for that flagged dependency.
 */
function Environment({ children }: { children: React.ReactNode }) {
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

/** Full Session §3.4 / acceptance check §24.2: on a split-capable (wide) layout, closing the
 * Context Secondary via its own close control must leave behind a visible, clickable way to
 * reopen it — not only on narrow layouts. Verifies the regression is fixed in every Full Session
 * state story below, at a wide (1440px) viewport.
 */
async function verifyContextReopens(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const doc = canvasElement.ownerDocument;
  const closeLabel = 'Zamknij panel dodatkowy';
  const reopenLabel = 'Kontekst';
  await expect(await canvas.findByRole('button', { name: closeLabel })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: closeLabel }));
  await waitFor(() =>
    expect(canvas.queryByRole('button', { name: closeLabel })).not.toBeInTheDocument(),
  );
  // The reopen control sits in the Primary header's "More actions" menu budget (not a direct
  // action), the same established pattern as the pre-existing narrow-mode Context action.
  await userEvent.click(await canvas.findByRole('button', { name: 'More actions' }));
  const reopen = await within(doc.body).findByRole('menuitem', { name: reopenLabel });
  await userEvent.click(reopen);
  await waitFor(() => expect(canvas.getByRole('button', { name: closeLabel })).toBeVisible());
}

const WIDE_VIEWPORT = { viewport: { value: 'desktop1440', isRotated: false } };

const meta = {
  title: 'SpecFlow/Screens/Managed Session/Full Session states',
  component: ManagedSession,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
  args: {
    sessionId: fixtureSessionId,
    owner: 'full-session-story',
    api: fixtureApi(sessionFixture()),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GenericSpecLevel: Story = {
  args: {
    api: fixtureApi(genericSpecLevelSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const SingleTaskExecution: Story = {
  args: {
    api: fixtureApi(singleTaskSnapshot()),
    sessionContext: singleTaskContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const PendingInteraction: Story = {
  args: {
    api: fixtureApi(sessionFixture(true)),
    sessionContext: pendingInteractionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const WaitingWithoutAttention: Story = {
  args: {
    api: fixtureApi(waitingWithoutAttentionSnapshot()),
    sessionContext: waitingWithoutAttentionContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const TerminalFailure: Story = {
  args: {
    api: fixtureApi(terminalFailureSnapshot()),
    sessionContext: terminalOutcomeContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};

export const Unavailable: Story = {
  args: {
    api: fixtureApi(unavailableSnapshot()),
    sessionContext: unavailableContext(),
  },
  globals: WIDE_VIEWPORT,
  play: ({ canvasElement }) => verifyContextReopens(canvasElement),
};
