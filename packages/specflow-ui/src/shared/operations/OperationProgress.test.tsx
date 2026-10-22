// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalizationProvider, createSpecFlowI18n } from '../../i18n';
import { message } from '../../i18n/message';
import { OperationProgress, type OperationProgressStep } from './OperationProgress';

const steps: readonly OperationProgressStep[] = [
  { id: 'reserving', label: message('create.progress.steps.reserving.title'), status: 'done' },
  {
    id: 'preparing-workspace',
    label: message('create.progress.steps.preparing-workspace.title'),
    status: 'running',
  },
  {
    id: 'registering',
    label: message('create.progress.steps.registering.title'),
    status: 'pending',
  },
];

function renderProgress(props: Partial<Parameters<typeof OperationProgress>[0]> = {}) {
  return render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <OperationProgress steps={steps} label={message('create.progress.label')} {...props} />
    </LocalizationProvider>,
  );
}

afterEach(() => cleanup());

describe('OperationProgress', () => {
  it('is a named group (not a live region) with an ordered list of the given steps', () => {
    renderProgress();
    const region = screen.getByRole('group', { name: 'Specification creation progress' });
    expect(region.hasAttribute('aria-live')).toBe(false);
    const items = within(region).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Reserving the name done',
      'Preparing the workspace in progress',
      'Finishing setup waiting',
    ]);
  });

  it('marks the running step as current and says each state in text, not only by icon', () => {
    renderProgress();
    const [done, running, pending] = screen.getAllByRole('listitem');
    expect(running?.getAttribute('aria-current')).toBe('step');
    expect(done?.getAttribute('aria-current')).toBeNull();
    expect(done?.textContent).toBe('Reserving the name done');
    expect(running?.textContent).toBe('Preparing the workspace in progress');
    expect(pending?.textContent).toBe('Finishing setup waiting');
  });

  it('renders nothing without steps and placeholders', () => {
    const { container } = renderProgress({ steps: [] });
    expect(container.innerHTML).toBe('');
  });

  it('reserves rows before the first snapshot without announcing them', () => {
    const { container } = renderProgress({ steps: [], placeholderRows: 3 });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);
  });

  it('draws the one-line description of a step under its label', () => {
    renderProgress({
      steps: [
        {
          id: 'a',
          label: message('create.progress.steps.reserving.title'),
          description: message('create.progress.steps.reserving.done'),
          status: 'done',
        },
      ],
    });
    expect(screen.getByRole('listitem').textContent).toBe(
      'Reserving the name doneName and branch reserved',
    );
  });

  it('shows ONE neutral running row when no step is known, never a simulated list', () => {
    renderProgress({
      steps: [],
      neutral: {
        label: message('create.progress.neutral.title'),
        description: message('create.progress.neutral.description'),
      },
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const region = screen.getByRole('group', { name: 'Specification creation progress' });
    expect(within(region).getByText('Creating specification')).toBeTruthy();
    expect(region.querySelectorAll('[data-operation-progress="neutral"]')).toHaveLength(1);
  });
});
