// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@nevo/ui';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createOptionsFixture } from '../options/creationOptions.stories-support';
import { WorkspacePlaceSection, type WorkspacePlaceSectionHandle } from './WorkspacePlaceSection';
import { initialWorkspaceChoice, type WorkspaceChoice } from './model/workspaceChoice';

afterEach(cleanup);

it.each([undefined, 'refs/heads/feature/payments'])(
  'a blocked Create focuses the invalid source without replacing a remembered %s',
  async (selectedRef) => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    Element.prototype.scrollIntoView = () => undefined;
    const handle = createRef<WorkspacePlaceSectionHandle>();
    let observed = initialWorkspaceChoice;
    function Harness() {
      const [choice, update] = useState<WorkspaceChoice>({
        ...initialWorkspaceChoice,
        tile: 'new',
        ...(selectedRef ? { base: { on: true, ref: selectedRef } } : {}),
      });
      observed = choice;

      return (
        <WorkspacePlaceSection
          state={{ status: 'ready', options: createOptionsFixture('base-config-unusable') }}
          choice={choice}
          update={update}
          locked={false}
          onRefresh={vi.fn()}
          onAnnounce={vi.fn()}
          title="Payment limits"
          headingId="workspace-heading"
          handleRef={handle}
        />
      );
    }

    render(
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <TooltipProvider>
          <Harness />
        </TooltipProvider>
      </LocalizationProvider>,
    );
    act(() => handle.current!.focusProblem('base'));
    const picker = await screen.findByRole('combobox', { name: 'Start from' });
    await waitFor(() => expect(document.activeElement).toBe(picker));
    expect(picker.getAttribute('aria-invalid')).toBe('true');
    const description = picker.getAttribute('aria-describedby')!;
    expect(observed.base.ref).toBe(selectedRef ?? 'refs/heads/develop');
    expect(document.getElementById(description)?.textContent).toContain(
      'Cannot start from this branch. Choose another branch.',
    );
    vi.unstubAllGlobals();
  },
);
