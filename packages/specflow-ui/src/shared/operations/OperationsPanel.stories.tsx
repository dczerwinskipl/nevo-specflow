import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';

import { StoryLocalization } from '../../i18n/StoryLocalization';
import type { AppLocale } from '../../i18n';
import {
  isoAgo,
  operationItem,
  operationList,
  operationsStub,
  runningItem,
  stubCreateKind,
} from '../../../test-support/operations/fixtures';
import type { OperationListItem, OperationList, OperationListResult } from './operationList';
import { OperationsPanelHost } from './OperationsPanelHost';
import { resetOperationsSession } from './operationsSession';

type Answer = OperationList | OperationListResult | Error;

/**
 * The connected panel over an in-memory operations port: each read takes the next answer (the last
 * one repeats), exactly what the Runtime list route would answer. A fresh query cache and a fresh
 * session (hidden rows) per story.
 */
function PanelFixture({
  answers,
  locale = 'en',
}: {
  answers: readonly Answer[];
  locale?: AppLocale;
}) {
  const { client, api } = useMemo(() => {
    resetOperationsSession();
    return {
      client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      api: operationsStub(...answers),
    };
  }, [answers]);
  return (
    <QueryClientProvider client={client}>
      <StoryLocalization locale={locale}>
        <div className="w-full max-w-3xl">
          <OperationsPanelHost api={api} listUrl="/api/specs/operations" kinds={[stubCreateKind]} />
        </div>
      </StoryLocalization>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Shared/Operations Panel',
  component: PanelFixture,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PanelFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const one = (items: OperationListItem[], extras: Partial<Omit<OperationList, 'items'>> = {}) => [
  operationList(items, extras),
];

/** Nothing to show: no panel, no heading, no placeholder. */
export const EmptyHidden: Story = {
  args: { answers: one([]) },
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(canvasElement.querySelector('[data-operations-panel]')).toBeNull();
  },
};

/** The runtime has no list yet (404): calmly nothing, no error. */
export const NotServedHidden: Story = {
  args: { answers: [{ kind: 'unavailable' } as const] },
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(canvasElement.querySelector('[data-operations-panel]')).toBeNull();
    await expect(canvasElement.querySelector('[role="alert"]')).toBeNull();
  },
};

/** One running Create: step "2 of 4", the branch and when it started; the row links to its page. */
export const OneRunning: Story = {
  args: { answers: one([runningItem(1, { title: 'Limity płatności' })]) },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region).toHaveTextContent('1 running');
    const link = within(region).getByRole('link', { name: /^Limity płatności/ });
    await expect(link).toHaveTextContent('Step 2 of 4: Preparing the workspace');
    // One meta line, "step · time": no kind, no branch, no trailing arrow, no collapse control.
    await expect(link).not.toHaveTextContent('spec/payment-limits');
    await expect(within(region).queryByRole('button', { name: /operations/i })).toBeNull();
    await expect(link.getAttribute('href')).toContain('/specs/new/creating/');
    await expect(within(region).queryByRole('button', { name: /^Hide Limity/ })).toBeNull();
  },
};

/** An existing workspace has no "prepare" step, so the checklist counts three. */
export const ExistingWorkspaceSteps: Story = {
  args: {
    answers: one([
      operationItem({
        title: 'Archiwum zdarzeń',
        target: { workspaceKind: 'existing', workspaceId: 'main' },
        currentStep: 'writing-specification',
        steps: [
          { id: 'reserving', status: 'done' },
          { id: 'preparing-workspace', status: 'skipped' },
          { id: 'writing-specification', status: 'running' },
          { id: 'registering', status: 'pending' },
        ],
      }),
    ]),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Step 2 of 3/)).toBeVisible();
  },
};

/** Running, needing a check, failed and completed together, in the order the server sends them. */
export const Mixed: Story = {
  args: {
    answers: one([
      operationItem({
        status: 'recovery-required',
        title: 'Faktury korygujące',
        code: 'OPERATION_INTERRUPTED',
        updatedAt: isoAgo(9),
      }),
      operationItem({ status: 'failed', title: 'Płatności cykliczne', code: 'COMMIT_FAILED' }),
      runningItem(2, { title: 'Limity płatności' }),
      runningItem(0, { title: 'Powiadomienia', startedAt: isoAgo(0) }),
      operationItem({ status: 'completed', title: 'Rejestr umów', updatedAt: isoAgo(3) }),
    ]),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region).toHaveTextContent('2 running, 1 needs attention');
    await expect(within(region).getAllByRole('listitem')).toHaveLength(5);
  },
};

/** The result of a run that stalled is checked on its page; there is no retry and no hide. */
export const RecoveryRequired: Story = {
  args: {
    answers: one([
      operationItem({
        status: 'recovery-required',
        title: 'Faktury korygujące',
        code: 'OPERATION_INTERRUPTED',
        updatedAt: isoAgo(9),
      }),
    ]),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    const link = within(region).getByRole('link', { name: /^Faktury korygujące/ });
    await expect(link).toHaveTextContent('No activity for 9 min. Check the result');
    await expect(link).toHaveTextContent('Check result');
    await expect(within(region).queryByRole('button', { name: /^Hide Faktury/ })).toBeNull();
  },
};

/** A failed run can be hidden for the session; the panel disappears with its last row. */
export const FailedHideable: Story = {
  args: { answers: one([operationItem({ status: 'failed', title: 'Płatności cykliczne' })]) },
  play: async ({ canvas, canvasElement }) => {
    const hide = await canvas.findByRole('button', { name: 'Hide Płatności cykliczne' });
    await userEvent.click(hide);
    await expect(canvasElement.querySelector('[data-operations-panel]')).toBeNull();
  },
};

/** A Create that finished moments ago stays for a while (the server drops it after 10 minutes). */
export const CompletedRecently: Story = {
  args: {
    answers: one([
      operationItem({ status: 'completed', title: 'Rejestr umów', updatedAt: isoAgo(3) }),
    ]),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region).toHaveTextContent('1 finished');
    await expect(within(region).getByRole('button', { name: 'Hide Rejestr umów' })).toBeVisible();
  },
};

/** More than five rows: five are shown, "Show all" opens the rest inline. */
export const ShowAllOverflow: Story = {
  args: {
    answers: one(
      Array.from({ length: 8 }, (_, index) =>
        runningItem(index % 3, { title: `Specyfikacja ${index + 1}` }),
      ),
    ),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(within(region).getAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(within(region).getByRole('button', { name: 'Show all (8)' }));
    await expect(within(region).getAllByRole('listitem')).toHaveLength(8);
  },
};

/** The list is cut by the server limit: the caption says how many of how many are shown. */
export const TruncatedList: Story = {
  args: {
    answers: [
      {
        ...operationList(
          Array.from({ length: 6 }, (_, index) =>
            runningItem(1, { title: `Specyfikacja ${index + 1}` }),
          ),
        ),
        truncated: true,
        counts: { inProgress: 60, recoveryRequired: 0, failed: 0, completed: 0 },
      },
    ],
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Show all (6)' }));
    await expect(await canvas.findByText('Showing 6 of 60')).toBeVisible();
  },
};

/** The panel is information, not a control: always open, nothing to collapse. */
export const AlwaysOpen: Story = {
  args: { answers: one([runningItem(1, { title: 'Limity płatności' })]) },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region.querySelector('[aria-expanded]')).toBeNull();
    await expect(within(region).getByRole('link')).toBeVisible();
  },
};

/** No answer and nothing to show yet: a compact notice with a retry, not an empty panel. */
export const ErrorNoData: Story = {
  args: { answers: [new Error('down')] },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Background operations can't be loaded")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** A refresh failed: the rows stay, a caption says it is retrying (3 to 60 s backoff). */
export const ErrorWithData: Story = {
  args: {
    answers: [operationList([runningItem(1, { title: 'Limity płatności' })]), new Error('down')],
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('Cannot refresh. Retrying', {}, { timeout: 6000 }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: /^Limity płatności/ })).toBeVisible();
  },
};

/** A kind or status this build does not know still renders, as a plain row without a link. */
export const UnknownKindAndStatus: Story = {
  args: {
    answers: one([operationItem({ kind: 'future-kind', status: 'paused', title: undefined })]),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region).toHaveTextContent('Operation');
    await expect(region).toHaveTextContent('Status unknown');
    await expect(within(region).queryByRole('link')).toBeNull();
  },
};

/** The same panel in Polish. */
export const Polish: Story = {
  args: {
    locale: 'pl',
    answers: one([
      runningItem(2, { title: 'Limity płatności' }),
      operationItem({
        status: 'recovery-required',
        title: 'Faktury',
        code: 'OPERATION_INTERRUPTED',
        updatedAt: isoAgo(6),
      }),
    ]),
  },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Operacje w tle' });
    await expect(region).toHaveTextContent('1 w toku, 1 wymaga uwagi');
    await expect(region).toHaveTextContent('Krok 3 z 4');
    await expect(region).toHaveTextContent('Brak aktywności od 6 min. Sprawdź wynik');
  },
};

/** 320 px: long titles wrap onto lines, targets stay at least 44 px, nothing scrolls sideways. */
export const Mobile320: Story = {
  args: {
    answers: one([
      runningItem(2, {
        title:
          'Ograniczenia płatności cyklicznych dla klientów korporacyjnych w kanałach zdalnych oraz integracji z dostawcami',
      }),
      operationItem({
        status: 'recovery-required',
        title: 'Faktury',
        code: 'OPERATION_INTERRUPTED',
      }),
      operationItem({ status: 'completed', title: 'Rejestr umów' }),
    ]),
  },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    const region = await canvas.findByRole('region', { name: 'Background operations' });
    await expect(region.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    for (const link of within(region).getAllByRole('link')) {
      await expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};
