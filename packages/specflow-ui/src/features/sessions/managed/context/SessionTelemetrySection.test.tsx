// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import {
  fullTelemetrySnapshot,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
  unavailableTelemetrySnapshot,
  telemetryMeasuredTurnId,
  staleTelemetryMeasuredTurnId,
  limitsTelemetry,
} from './sessionTelemetry.stories-support';
import type { LimitsRefreshControl } from './sessionContextTypes';
import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';

afterEach(cleanup);

function renderSection(
  telemetry?: TelemetrySnapshot,
  runningTurnId?: string,
  limitsRefresh?: LimitsRefreshControl,
) {
  return render(
    <StoryLocalization locale="en">
      <SessionTelemetrySection
        telemetry={telemetry}
        runningTurnId={runningTurnId}
        limitsRefresh={limitsRefresh}
      />
    </StoryLocalization>,
  );
}

function control(overrides: Partial<LimitsRefreshControl> = {}): LimitsRefreshControl {
  return {
    sending: false,
    coolingDown: false,
    unconfirmed: false,
    rejected: false,
    refused: false,
    refusedNote: false,
    refresh: vi.fn().mockResolvedValue('sent'),
    ...overrides,
  };
}

const refreshButton = () => screen.queryByRole('button', { name: /Refresh/ });

describe('SessionTelemetrySection', () => {
  it('renders cost/tokens as big-number stat cells, scoped to the whole session', () => {
    renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Session usage')).toBeTruthy();
    // The title already says "session"; no repeated "for the whole session" caption.
    expect(screen.queryByText('for the whole session')).toBeNull();
    // Cost stat cell: big number + "Cost" caption, no estimate/unconfirmed caveat for a
    // provider-reported + billed reading.
    expect(screen.getByText('$0.47')).toBeTruthy();
    expect(screen.getByText('Cost')).toBeTruthy();
    // Tokens stat cell: compact input/output figures, not the full joined sentence.
    expect(screen.getByText('12.4K / 3.2K')).toBeTruthy();
    expect(screen.getByText('Input / output tokens')).toBeTruthy();
  });

  it('keeps the cache/reasoning token breakdown behind a collapsed-by-default disclosure', () => {
    const { container } = renderSection(fullTelemetrySnapshot);

    const trigger = screen.getByText('Additional token stats');
    expect(trigger).toBeTruthy();
    // The panel starts collapsed (`hidden`), carrying the cache-read/reasoning breakdown that
    // used to always be shown inline next to the token stat cell.
    expect(container.querySelector('[hidden]')).toBeTruthy();
    expect(screen.getByText('8,100 cache read · 640 reasoning')).toBeTruthy();

    const button = trigger.closest('button');
    if (!button) {
      throw new Error('Expected the token-breakdown trigger to be a button.');
    }

    fireEvent.click(button);

    expect(container.querySelector('[hidden]')).toBeNull();
  });

  it('separates context-window occupancy from provider rate limits into two sections, both unambiguous "used" percentages', () => {
    const { container } = renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Model context window')).toBeTruthy();
    expect(screen.getByText('43% occupied')).toBeTruthy();

    expect(screen.getByText('Provider limits')).toBeTruthy();
    // Fixture windows are exactly 5h/7d — rendered as full words, not abbreviated.
    expect(screen.getByText('5 hours')).toBeTruthy();
    expect(screen.getByText('42% used')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('13% used')).toBeTruthy();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();

    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars.length).toBeGreaterThanOrEqual(3);
  });

  it('attributes context-window occupancy to the actual Turn/model it measures, not the section\'s ambient "whole session" caption (live owner review, second pass)', () => {
    // `fullTelemetrySnapshot.context.value` carries both `turnId` and
    // `modelId: 'claude-sonnet-5'` — real, already-observed data (unlike `usage.turn`/`cost.turn`,
    // which no fixture populates), so the row can name its actual scope instead of silently
    // reading as part of "Session usage" / "for the whole session" above it.
    // The technical Turn id itself stays out of the primary view (owner visual-refinement brief).
    // Here the measured Turn is the one still running.
    renderSection(fullTelemetrySnapshot, telemetryMeasuredTurnId);

    expect(screen.getByText('Current Turn · claude-sonnet-5')).toBeTruthy();
    expect(document.body.textContent).not.toContain(telemetryMeasuredTurnId);
  });

  it('labels the measurement as the last Turn when no Turn is running', () => {
    // An active Session that is ready for the next message has no running Turn: the measurement
    // belongs to the settled last Turn, whatever the Session's own status is.
    renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Last Turn · claude-sonnet-5')).toBeTruthy();
    expect(screen.queryByText(/Current Turn/)).toBeNull();
  });

  it('labels the measurement as the last Turn while a newer, not yet measured Turn runs', () => {
    renderSection(fullTelemetrySnapshot, '00000000-0000-4000-8000-0000000007b9');

    expect(screen.getByText('Last Turn · claude-sonnet-5')).toBeTruthy();
  });

  it('falls back to naming just the Turn when the reading has no model id', () => {
    // `staleTelemetrySnapshot.context.value` carries a `turnId` but no `modelId`.
    renderSection(staleTelemetrySnapshot);

    expect(screen.getByText('Last Turn')).toBeTruthy();
    expect(document.body.textContent).not.toContain(staleTelemetryMeasuredTurnId);
  });

  it('shows no context-window value or Turn caption when there is no measurement', () => {
    renderSection(partialAntigravityTelemetrySnapshot, 'turn-1');

    expect(screen.queryByText('Model context window')).toBeNull();
    expect(screen.queryByText(/Current Turn|Last Turn/)).toBeNull();
  });

  it('stacks the rate-limit windows as full-width rows, each with its value in the bar header', () => {
    renderSection(fullTelemetrySnapshot);

    const limitsSection = screen.getByText('Provider limits').closest('section')!;
    expect(limitsSection.querySelector('.grid-cols-2')).toBeNull();
    const bars = limitsSection.querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    // Value text sits in the header row above its bar, not after the bar.
    const fiveHours = screen.getByText('42% used');
    expect(fiveHours.parentElement?.nextElementSibling?.getAttribute('role')).toBe('progressbar');
  });

  it('shows only the available dimensions for partial telemetry, never a placeholder for cost', () => {
    renderSection(partialAntigravityTelemetrySnapshot);

    // Tokens stat cell still renders from the partial reading.
    expect(screen.getByText('5.6K / 1.2K')).toBeTruthy();
    // Cost is unavailable (Antigravity: no proven currency) — never shown as $0 or any amount,
    // and the "Cost" label itself is absent along with it.
    expect(screen.queryByText('Cost')).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    // Limits observed as a direct percent-unit window, rendered as its own Progress bar, alone
    // (single column, not forced into a 2-up grid for one item).
    expect(screen.getByText('42% used')).toBeTruthy();
    // Context is unavailable on this fixture, so no occupancy section at all.
    expect(screen.queryByText('Model context window')).toBeNull();
    // No token breakdown disclosure either: this fixture has no cache/reasoning figures.
    expect(screen.queryByText('Additional token stats')).toBeNull();
  });

  it('colors a limit bar by usage threshold: default below 70%, attention 70-90%, danger above 90%', () => {
    // Stale fixture: context 178,000/200,000 = 89% (attention tier), rate-limit window
    // 390,000/400,000 = 97.5% -> rounds to 98% (danger tier). No server-provided threshold exists
    // on `Reading`/`LimitWindow` today, so this exercises the hardcoded client-side cutoff.
    const { container } = renderSection(staleTelemetrySnapshot);

    const bars = Array.from(container.querySelectorAll<HTMLElement>('[role="progressbar"]'));
    expect(bars.length).toBe(2);
    const [contextBar, limitBar] = bars;
    expect(contextBar?.style.getPropertyValue('--color-progress-fill')).toBe(
      'var(--color-status-attention)',
    );
    expect(limitBar?.style.getPropertyValue('--color-progress-fill')).toBe(
      'var(--color-status-danger)',
    );

    // The full-snapshot fixture's dimensions (43%/42%/13%) are all below 70% — no override, the
    // bar keeps the DS default fill colour.
    cleanup();
    const { container: defaultContainer } = renderSection(fullTelemetrySnapshot);
    for (const bar of defaultContainer.querySelectorAll<HTMLElement>('[role="progressbar"]')) {
      expect(bar.style.getPropertyValue('--color-progress-fill')).toBe('');
    }
  });

  it('renders nothing at all when every telemetry dimension is unavailable', () => {
    const { container } = renderSection(unavailableTelemetrySnapshot);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no telemetry is given', () => {
    const { container } = renderSection(undefined);

    expect(container.firstChild).toBeNull();
  });

  it('marks stale readings with a muted "Stale" cue instead of presenting them as live', () => {
    renderSection(staleTelemetrySnapshot);

    // Every one of cost/context/limits is stale on this fixture (usage's own stat cell has no
    // separate stale mark distinct from the one already covering cost/tokens together).
    const staleMarks = screen.getAllByText('Stale');
    expect(staleMarks.length).toBeGreaterThanOrEqual(3);
    // Cost is `estimated`/`api-equivalent` on this fixture — must say so, not read as billed.
    expect(screen.getByText('$1.08')).toBeTruthy();
    expect(screen.getByText('estimated, API-equivalent')).toBeTruthy();
  });
  describe('provider-limits refresh', () => {
    it('offers a ghost Refresh in the limits heading row to a manager of refreshable limits', () => {
      const limitsRefresh = control();
      renderSection(fullTelemetrySnapshot, undefined, limitsRefresh);
      const button = screen.getByRole('button', { name: 'Refresh provider limits' });
      expect(button.textContent).toBe('Refresh');
      expect(button.closest('section')?.textContent).toContain('Provider limits');
      fireEvent.click(button);
      expect(limitsRefresh.refresh).toHaveBeenCalledOnce();
      // No other refresh, and no "Refreshing…" status next to the usage title.
      expect(screen.getAllByRole('button', { name: /Refresh/ })).toHaveLength(1);
      expect(screen.queryByText('Refreshing…')).toBeNull();
    });

    it('omits the control without Manage and for limits that cannot be refreshed', () => {
      renderSection(fullTelemetrySnapshot);
      expect(refreshButton()).toBeNull();
      cleanup();
      renderSection(limitsTelemetry.notRefreshable, undefined, control());
      expect(refreshButton()).toBeNull();
      expect(screen.getByText('Provider limits')).toBeTruthy();
    });

    it('renders no limits section at all for NOT_AUTHORIZED limits', () => {
      renderSection(limitsTelemetry.notAuthorized, undefined, control());
      expect(screen.queryByText('Provider limits')).toBeNull();
      expect(refreshButton()).toBeNull();
      expect(screen.getByText('Session usage')).toBeTruthy();
    });

    it.each([
      ['not read yet', limitsTelemetry.notRead],
      ['zero windows', limitsTelemetry.zeroWindows],
    ])('keeps the section with its control and a note when %s', (_name, telemetry) => {
      renderSection(telemetry, undefined, control());
      expect(screen.getByText('Provider limits')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Refresh provider limits' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('Limits have not been read yet.');
    });

    it('stays visible for unread limits even when nothing else is observed', () => {
      const unread = { ...unavailableTelemetrySnapshot, limits: limitsTelemetry.notRead.limits };
      renderSection(unread, undefined, control());
      expect(screen.getByText('Provider limits')).toBeTruthy();
      cleanup();
      const { container } = renderSection(unread);
      expect(container.firstChild).toBeNull();
    });

    it.each([
      ['sending', fullTelemetrySnapshot, { sending: true }],
      ['running in the Runtime', limitsTelemetry.running, {}],
    ] as const)(
      'marks the control aria-disabled and ignores presses while %s',
      (_name, telemetry, state) => {
        const limitsRefresh = control(state);
        renderSection(telemetry, undefined, limitsRefresh);
        const button = screen.getByRole('button', { name: 'Refreshing…' });
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.hasAttribute('disabled')).toBe(false);
        fireEvent.click(button);
        expect(limitsRefresh.refresh).not.toHaveBeenCalled();
      },
    );

    it('cools down after a rate limit with a polite note and no countdown', () => {
      const limitsRefresh = control({ coolingDown: true });
      renderSection(fullTelemetrySnapshot, undefined, limitsRefresh);
      const button = screen.getByRole('button', { name: 'Refresh provider limits' });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
      expect(limitsRefresh.refresh).not.toHaveBeenCalled();
      expect(screen.getByRole('status').textContent).toBe(
        'Limits were just refreshed. You can refresh again shortly.',
      );
    });

    it('says a failed refresh keeps the last reading, or that nothing could be read', () => {
      renderSection(limitsTelemetry.failedWithValues, undefined, control());
      expect(screen.getByRole('status').textContent).toBe(
        'Could not refresh limits. Showing the last reading.',
      );
      expect(screen.getByText('42% used')).toBeTruthy();
      cleanup();
      renderSection(limitsTelemetry.failedWithoutValues, undefined, control());
      expect(screen.getByRole('status').textContent).toBe('Could not read limits.');
    });

    it('announces an unconfirmed refresh as an alert and keeps the control enabled', () => {
      renderSection(fullTelemetrySnapshot, undefined, control({ unconfirmed: true }));
      expect(screen.getByRole('alert').textContent).toBe(
        'The refresh was not confirmed. Try again.',
      );
      const button = screen.getByRole('button', { name: 'Refresh provider limits' });
      expect(button.getAttribute('aria-disabled')).toBeNull();
    });

    it('after a definite refusal removes the control, focuses the heading and says why', async () => {
      const refused = control({ refused: true, refusedNote: true });
      const limitsRefresh = control({ refresh: vi.fn().mockResolvedValue('refused') });
      const view = renderSection(fullTelemetrySnapshot, undefined, limitsRefresh);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh provider limits' }));
      // The store reports the refusal before the press settles.
      view.rerender(
        <StoryLocalization locale="en">
          <SessionTelemetrySection telemetry={fullTelemetrySnapshot} limitsRefresh={refused} />
        </StoryLocalization>,
      );
      const heading = screen.getByRole('heading', { name: 'Provider limits' });
      await vi.waitFor(() => expect(document.activeElement).toBe(heading));
      expect(refreshButton()).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('Refreshing limits is unavailable.');
    });

    it('renders nothing for a refusal note once the snapshot is gone', () => {
      const { container } = renderSection(
        undefined,
        undefined,
        control({ refused: true, refusedNote: true }),
      );
      expect(container.firstChild).toBeNull();
    });

    it('says a definitely rejected refresh politely, never as unconfirmed', () => {
      renderSection(fullTelemetrySnapshot, undefined, control({ rejected: true }));
      expect(screen.getByRole('status').textContent).toBe('The limits refresh was rejected.');
      expect(screen.getByRole('alert').textContent).toBe('');
    });

    it('keeps one status and one alert region mounted, changing only their text', () => {
      const view = renderSection(fullTelemetrySnapshot, undefined, control());
      const status = screen.getByRole('status');
      const alert = screen.getByRole('alert');
      expect(status.textContent).toBe('');
      view.rerender(
        <StoryLocalization locale="en">
          <SessionTelemetrySection
            telemetry={fullTelemetrySnapshot}
            limitsRefresh={control({ unconfirmed: true, coolingDown: true })}
          />
        </StoryLocalization>,
      );
      expect(screen.getByRole('status')).toBe(status);
      expect(screen.getByRole('alert')).toBe(alert);
      expect(alert.textContent).toBe('The refresh was not confirmed. Try again.');
    });

    it('moves focus to the Context region when the focused limits heading goes away', () => {
      const tree = (limitsRefresh: LimitsRefreshControl, telemetry: TelemetrySnapshot) => (
        <StoryLocalization locale="en">
          <div tabIndex={-1} data-context-focus-fallback data-testid="context">
            <SessionTelemetrySection telemetry={telemetry} limitsRefresh={limitsRefresh} />
          </div>
        </StoryLocalization>
      );
      const refused = control({ refused: true, refusedNote: true });
      const view = render(tree(refused, limitsTelemetry.notRead));
      screen.getByRole('heading', { name: 'Provider limits' }).focus();
      // The next snapshot clears the note; without the control the empty section disappears.
      view.rerender(tree(control({ refused: true }), limitsTelemetry.notRead));
      expect(screen.queryByRole('heading', { name: 'Provider limits' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('context'));
    });
  });
});
