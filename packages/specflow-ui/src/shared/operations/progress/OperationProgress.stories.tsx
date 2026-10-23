import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { withLocale } from '../../../i18n/StoryLocalization';
import { message } from '../../../i18n/message';
import { OperationProgress, type OperationProgressStep } from './OperationProgress';

const label = message('create.progress.label');
const step = (
  id: string,
  status: OperationProgressStep['status'],
  key:
    | 'create.progress.steps.reserving.title'
    | 'create.progress.steps.preparing-workspace.title'
    | 'create.progress.steps.writing-specification.title'
    | 'create.progress.steps.registering.title',
): OperationProgressStep => ({ id, status, label: message(key) });

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Shared/Operation Progress',
  component: OperationProgress,
  parameters: { layout: 'padded' },
  args: { label },
} satisfies Meta<typeof OperationProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: {
    steps: [
      step('reserving', 'done', 'create.progress.steps.reserving.title'),
      step('preparing-workspace', 'running', 'create.progress.steps.preparing-workspace.title'),
      step('writing-specification', 'pending', 'create.progress.steps.writing-specification.title'),
      step('registering', 'pending', 'create.progress.steps.registering.title'),
    ],
  },
  play: async ({ canvas }) => {
    const region = canvas.getByRole('group', { name: 'Postęp tworzenia specyfikacji' });
    await expect(region).not.toHaveAttribute('aria-live');
    const running = within(region).getByText('Przygotowanie środowiska pracy').closest('li');
    await expect(running).toHaveAttribute('aria-current', 'step');
    await expect(within(region).getAllByRole('listitem')).toHaveLength(4);
  },
};

export const Finished: Story = {
  args: {
    steps: [
      step('reserving', 'done', 'create.progress.steps.reserving.title'),
      step('writing-specification', 'done', 'create.progress.steps.writing-specification.title'),
      step('registering', 'done', 'create.progress.steps.registering.title'),
    ],
  },
};

/** Before the first snapshot: rows are reserved so nothing moves when the checklist arrives. */
export const WaitingForFirstSnapshot: Story = {
  args: { steps: [], placeholderRows: 4 },
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole('listitem')).toHaveLength(0);
  },
};

/** 320 px: long Polish labels wrap inside the row and never overflow the page. */
export const Narrow320: Story = {
  args: {
    steps: [
      step('reserving', 'done', 'create.progress.steps.reserving.title'),
      step('preparing-workspace', 'done', 'create.progress.steps.preparing-workspace.title'),
      step('writing-specification', 'running', 'create.progress.steps.writing-specification.title'),
      step('registering', 'pending', 'create.progress.steps.registering.title'),
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }} data-testid="frame">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const frame = canvas.getByTestId('frame');
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  },
};
