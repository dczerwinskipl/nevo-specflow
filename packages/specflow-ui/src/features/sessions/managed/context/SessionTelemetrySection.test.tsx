// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
  it('renders every available dimension for a full telemetry snapshot, as labelled bars/values', () => {
    const { container } = renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Session details')).toBeTruthy();
    // Token usage: a label distinct from its value, only the dimensions actually present.
    expect(screen.getByText('Token usage')).toBeTruthy();
    expect(
      screen.getByText('12,400 input · 3,200 output · 8,100 cache read · 640 reasoning'),
    ).toBeTruthy();
    // Cost: provider-reported + billed -> no estimate/unconfirmed caveat.
    expect(screen.getByText('Cost')).toBeTruthy();
    expect(screen.getByText('$0.47')).toBeTruthy();
    // Context occupancy: 86,000 / 200,000 -> 43%, rendered as a labelled Progress bar + value.
    expect(screen.getByText('Context window occupancy')).toBeTruthy();
    expect(screen.getByText('43%')).toBeTruthy();
    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars.length).toBeGreaterThanOrEqual(1);
    // Rate limits: both windows fit (<= 2), so no "+N more", most-used window ranked first, each
    // its own labelled bar.
    expect(screen.getByText('5h window')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('7d window')).toBeTruthy();
    expect(screen.getByText('13%')).toBeTruthy();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
    // Nothing here is stale.
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('shows only the available dimensions for partial telemetry, never a placeholder for cost', () => {
    const { container } = renderSection(partialAntigravityTelemetrySnapshot);

    // Usage is partial but present.
    expect(screen.getByText('5,600 input · 1,150 output')).toBeTruthy();
    // Cost is unavailable (Antigravity: no proven currency) — never shown as $0 or any amount,
    // and the "Cost" label itself is absent along with it.
    expect(screen.queryByText('Cost')).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    // Limits observed as a direct percent-unit window, rendered as its own Progress bar.
    expect(screen.getByText('5h window')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    // Context is unavailable on this fixture, so no occupancy label/bar at all — only the one
    // rate-limit bar above exists, not two.
    expect(screen.queryByText('Context window occupancy')).toBeNull();
    expect(container.querySelectorAll('[role="progressbar"]').length).toBe(1);
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

    // Every one of usage/cost/context/limits is stale on this fixture.
    const staleMarks = screen.getAllByText('Stale');
    expect(staleMarks.length).toBeGreaterThanOrEqual(4);
    // Cost is `estimated`/`api-equivalent` on this fixture — must say so, not read as billed.
    expect(screen.getByText(/\$1\.08 \(estimated, API-equivalent\)/)).toBeTruthy();
  });
});
