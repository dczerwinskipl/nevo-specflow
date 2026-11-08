import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { ApiError } from '../../../../api';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from '../api';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import { createSessionTelemetryStore } from './sessionTelemetryStore';
import {
  fullTelemetrySnapshot,
  limitsTelemetry,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
} from './sessionTelemetry.stories-support';

type RefreshAnswer = ManagedSessionsApi['refreshTelemetry'];

/**
 * "Session details" in Context with the real telemetry store behind it: the snapshot comes from a
 * fake `GET .../telemetry`, and the provider-limits refresh (session-actions-ux §1) calls the
 * story's `refresh` answer. `manage: false` is a user without Session Manage (no control).
 */
function TelemetryHarness({
  telemetry,
  refresh,
  manage,
}: {
  telemetry: TelemetrySnapshot;
  refresh: RefreshAnswer;
  manage: boolean;
}) {
  const store = useMemo(
    () =>
      createSessionTelemetryStore(
        {
          telemetry: () => Promise.resolve({ kind: 'snapshot', snapshot: telemetry }),
          refreshTelemetry: refresh,
        },
        telemetry.sessionId,
      ),
    [telemetry, refresh],
  );
  useEffect(
    () =>
      store.connect((listener) => {
        listener({ kind: 'resync' });

        return () => undefined;
      }),
    [store],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return (
    <StoryLocalization locale="pl">
      {/* The ~330 px Secondary column Context renders in. */}
      <div className="w-[330px] p-4 text-content-primary">
        <SessionTelemetrySection
          telemetry={state.snapshot}
          limitsRefresh={manage ? { ...state.refresh, refresh: store.refreshLimits } : undefined}
        />
      </div>
    </StoryLocalization>
  );
}

const accepted: RefreshAnswer = (_id, input) =>
  Promise.resolve({
    requestId: input.requestId,
    acceptedGroups: ['limits'],
    state: 'queued',
    telemetryRevision: 43,
  });
const never: RefreshAnswer = () => new Promise(() => undefined);
const refusal =
  (init: ConstructorParameters<typeof ApiError>[0]): RefreshAnswer =>
  () =>
    Promise.reject(new ApiError(init));

const meta = {
  title: 'SpecFlow/Sessions/Session Telemetry',
  component: TelemetryHarness,
  tags: ['contract'],
  args: { telemetry: fullTelemetrySnapshot, refresh: accepted, manage: true },
} satisfies Meta<typeof TelemetryHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

const refreshName = 'Odśwież limity dostawcy';

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: refreshName });
    await expect(button).toHaveTextContent('Odśwież');
    // The control shares the heading row of "Limity dostawcy".
    const heading = canvas.getByRole('heading', { name: 'Limity dostawcy' });
    await expect(
      Math.abs(button.getBoundingClientRect().top - heading.getBoundingClientRect().top),
    ).toBeLessThan(16);
  },
};

export const PartialAntigravity: Story = {
  args: { telemetry: partialAntigravityTelemetrySnapshot },
};

export const Stale: Story = { args: { telemetry: staleTelemetrySnapshot } };

/** Claude: limits are read with Turns only; no control. */
export const NotRefreshable: Story = {
  args: { telemetry: limitsTelemetry.notRefreshable },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Limity dostawcy' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: refreshName })).toBeNull();
  },
};

export const WithoutManage: Story = {
  args: { manage: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Limity dostawcy' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: refreshName })).toBeNull();
  },
};

/** No permission to see account limits: no limits section at all. */
export const LimitsNotAuthorized: Story = {
  args: { telemetry: limitsTelemetry.notAuthorized },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Zużycie sesji' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Limity dostawcy' })).toBeNull();
  },
};

/** Codex before its first account read. */
export const NotReadYet: Story = {
  args: { telemetry: limitsTelemetry.notRead },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Limity nie zostały jeszcze odczytane.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: refreshName })).toBeVisible();
  },
};

export const ZeroWindows: Story = {
  args: { telemetry: limitsTelemetry.zeroWindows },
  play: NotReadYet.play,
};

/** Keyboard press: the label switches to "Odświeżanie…", focus stays, further presses are ignored. */
export const Refreshing: Story = {
  args: { refresh: never },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: refreshName });
    button.focus();
    await userEvent.keyboard('{Enter}');
    const pending = await canvas.findByRole('button', { name: 'Odświeżanie…' });
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    await expect(pending).toHaveFocus();
  },
};

export const RunningInRuntime: Story = {
  args: { telemetry: limitsTelemetry.running },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Odświeżanie…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // The control's label is the single indicator (no status text beside "Zużycie sesji").
    await expect(canvas.getAllByText('Odświeżanie…')).toHaveLength(1);
  },
};

export const RateLimited: Story = {
  args: {
    refresh: refusal({
      kind: 'rate-limited',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: true,
      status: 429,
      retryAfterMs: 60_000,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: refreshName }));
    await expect(
      await canvas.findByText(
        'Limity odświeżono przed chwilą. Odświeżenie będzie znów możliwe za moment.',
      ),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: refreshName })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

export const FailedWithValues: Story = {
  args: { telemetry: limitsTelemetry.failedWithValues },
};

export const FailedWithoutValues: Story = {
  args: { telemetry: limitsTelemetry.failedWithoutValues },
};

export const Unconfirmed: Story = {
  args: {
    refresh: refusal({
      kind: 'network',
      operation: 'sessions',
      outcome: 'unknown',
      retryable: true,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: refreshName }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Nie potwierdzono odświeżenia. Spróbuj ponownie.',
    );
  },
};

/** 403: the control is removed for this mount and focus moves to the section heading. */
export const Refused: Story = {
  args: {
    refresh: refusal({
      kind: 'forbidden',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: false,
      status: 403,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: refreshName });
    button.focus();
    await userEvent.keyboard('{Enter}');
    const heading = canvas.getByRole('heading', { name: 'Limity dostawcy' });
    await waitFor(() => expect(heading).toHaveFocus());
    await expect(canvas.queryByRole('button', { name: refreshName })).toBeNull();
    await expect(canvas.getByText('Odświeżanie limitów jest niedostępne.')).toBeVisible();
  },
};
