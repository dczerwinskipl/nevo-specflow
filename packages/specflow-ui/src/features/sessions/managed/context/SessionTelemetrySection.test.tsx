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
  it('renders every available dimension for a full telemetry snapshot', () => {
    const { container } = renderSection(fullTelemetrySnapshot);

    expect(screen.getByText('Session details')).toBeTruthy();
    // Token usage: only the dimensions actually present on the fixture.
    expect(
      screen.getByText('12,400 input · 3,200 output · 8,100 cache read · 640 reasoning'),
    ).toBeTruthy();
    // Cost: provider-reported + billed -> no estimate/unconfirmed caveat.
    expect(screen.getByText('$0.47')).toBeTruthy();
    // Context occupancy: 86,000 / 200,000 -> 43%.
    expect(screen.getByText('43% of context used')).toBeTruthy();
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
    // Rate limits: both windows fit (<= 2), so no "+N more", most-used window ranked first.
    expect(screen.getByText(/5h window: 42% used/)).toBeTruthy();
    // Nothing here is stale.
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('shows only the available dimensions for partial telemetry, never a placeholder for cost', () => {
    renderSection(partialAntigravityTelemetrySnapshot);

    // Usage is partial but present.
    expect(screen.getByText('5,600 input · 1,150 output')).toBeTruthy();
    // Cost is unavailable (Antigravity: no proven currency) — never shown as $0 or any amount.
    expect(screen.queryByText(/\$/)).toBeNull();
    // Limits observed as a direct percent-unit window.
    expect(screen.getByText(/5h window: 42% used/)).toBeTruthy();
    // Context is unavailable on this fixture, so no occupancy line/progress bar at all.
    expect(screen.queryByText(/of context used/)).toBeNull();
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
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
