// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@nevo/ui';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { SpecificationWorkspace } from './SpecificationWorkspace';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  // A split-capable workspace: the declarative Secondary can show beside Overview.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({ width: 1600, height: 900, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0 }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const withHistory = createSpecificationWorkspaceFixture('working', 'SPEC-1');
const emptyHistory: SpecificationWorkspaceData = { ...withHistory, activityEvents: [] };

function Workspace({ data }: { readonly data: SpecificationWorkspaceData }) {
  return (
    <UiModulesProvider modules={builtInUiModuleRegistry}>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <AppShell navigation={<div>Navigation</div>}>
          <SpecificationWorkspace specId="SPEC-1" data={data} />
        </AppShell>
      </LocalizationProvider>
    </UiModulesProvider>
  );
}

function historyPanel() {
  return screen.queryByRole('heading', { level: 2, name: 'Activity history' });
}

function historyToggle() {
  return screen.getByRole('button', { name: 'Activity history' });
}

describe('Specification Overview Activity history', () => {
  it('does not open the Secondary for an empty history and offers it on demand', () => {
    render(<Workspace data={emptyHistory} />);

    expect(historyPanel()).toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(historyToggle());

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('No history for this specification')).not.toBeNull();
  });

  it('keeps a history the user opened open while it stays empty', () => {
    const { rerender } = render(<Workspace data={emptyHistory} />);
    fireEvent.click(historyToggle());

    // A refresh delivers a new, still empty, read model.
    rerender(<Workspace data={{ ...emptyHistory, activityEvents: [] }} />);

    expect(historyPanel()).not.toBeNull();
  });

  it('opens the Secondary by default when the history has entries', () => {
    render(<Workspace data={withHistory} />);

    expect(historyPanel()).not.toBeNull();
    expect(historyToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('never opens or closes the panel because the history changed', () => {
    const { rerender } = render(<Workspace data={withHistory} />);
    rerender(<Workspace data={emptyHistory} />);
    expect(historyPanel()).not.toBeNull();

    fireEvent.click(historyToggle());
    expect(historyPanel()).toBeNull();
    rerender(<Workspace data={withHistory} />);
    expect(historyPanel()).toBeNull();
  });
});
