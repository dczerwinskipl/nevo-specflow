import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoutedApplication } from '../../app/SpecFlowShell.stories';

// The real router and account/navigation shell, not a substitute detail fixture.
const meta = {
  title: 'SpecFlow/Screens/Specification',
  component: RoutedApplication,
  parameters: { layout: 'fullscreen' },
  args: { path: '/specs/admission?collection=current' },
} satisfies Meta<typeof RoutedApplication>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Working: Story = {};

export const Current: Story = {
  play: async ({ canvas }) => {
    await canvas.findByText('Specification ID: admission', {}, { timeout: 5000 });
    const back = canvas.getByRole('link', { name: 'Back to Specifications' });
    const icon = back.querySelector('svg')?.getBoundingClientRect();
    const label = back.querySelector('[data-spec-back-label]')?.getBoundingClientRect();
    if (!icon || !label || Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2) > 1)
      throw new Error('Back icon and label must share the same vertical center.');
  },
};

export const Archive: Story = {
  args: { path: '/specs/archive-0?collection=archive' },
  play: async ({ canvas }) => {
    await canvas.findByText('Specification ID: archive-0', {}, { timeout: 5000 });
    canvas.getByRole('link', { name: 'Back to Specifications' });
  },
};

export const EmptyPreparation: Story = {
  args: { path: '/specs/empty-scaffold' },
};

export const PreparingTasks: Story = {
  args: { path: '/specs/preparing-spec' },
};

export const GitConflicts: Story = {
  args: { path: '/specs/conflict-spec' },
};

export const NoGit: Story = {
  args: { path: '/specs/no-git-spec' },
};

export const Documents: Story = {
  args: { path: '/specs/docs-spec?view=documents' },
};

export const FullTask: Story = {
  args: { path: '/specs/admission?task=TASK-03' },
};

export const NarrowLongIdentity: Story = {
  args: { path: `/specs/${'long-identity-'.repeat(16)}` },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const Polish: Story = { args: { locale: 'pl' } };
