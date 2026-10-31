// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionTelemetrySection } from './SessionTelemetrySection';
import {
  fullTelemetrySnapshot,
  partialAntigravityTelemetrySnapshot,
  staleTelemetrySnapshot,
  unavailableTelemetrySnapshot,
  type TelemetrySnapshot,
} from './sessionTelemetry';

afterEach(cleanup);

function renderSection(telemetry?: TelemetrySnapshot) {
  return render(
    <StoryLocalization locale="en">
      <SessionTelemetrySection telemetry={telemetry} />
    </StoryLocalization>,
  );
}

describe('SessionTelemetrySection', () => {
  it('renders cost/tokens as big-number stat cells, scoped to the whole session', () => {
    renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Session usage')).toBeTruthy();
    expect(screen.getByText('for the whole session')).toBeTruthy();
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

  it('lays the two rate-limit windows out as two columns, not stacked full-width rows', () => {
    const { container } = renderSection(fullTelemetrySnapshot);

    const limitsHeading = screen.getByText('Provider limits');
    const limitsGrid = limitsHeading.parentElement?.querySelector('.grid-cols-2');
    expect(limitsGrid).toBeTruthy();
    expect(limitsGrid?.children.length).toBe(2);
    expect(container).toBeTruthy();
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
});
