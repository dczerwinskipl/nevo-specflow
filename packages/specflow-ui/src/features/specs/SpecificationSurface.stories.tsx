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

export const Current: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('Specification ID: admission');
    const back = canvas.getByRole('link', { name: 'Back to Specifications' });
    const icon = back.querySelector('svg')?.getBoundingClientRect();
    const label = back.querySelector('[data-spec-back-label]')?.getBoundingClientRect();
    if (!icon || !label || Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2) > 1)
      throw new Error('Back icon and label must share the same vertical center.');
    await userEvent.click(back);
    const current = await canvas.findByRole('radio', { name: 'Current' });
    if (current.getAttribute('aria-checked') !== 'true')
      throw new Error('Current Specification must return to the Current collection.');
  },
};

export const Archive: Story = {
  args: { path: '/specs/archive-0?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('Specification ID: archive-0');
    await userEvent.click(canvas.getByRole('link', { name: 'Back to Specifications' }));
    const archive = await canvas.findByRole('radio', { name: 'Archive' });
    if (archive.getAttribute('aria-checked') !== 'true')
      throw new Error('Archive Specification must return to Archive.');
  },
};

export const EmptyPreparation: Story = {
  args: { path: '/specs/empty-scaffold?scenario=empty' },
};

export const PreparingTasks: Story = {
  args: { path: '/specs/preparing-spec?scenario=preparing' },
};

export const GitConflicts: Story = {
  args: { path: '/specs/conflict-spec?scenario=git-conflict' },
};

export const NoGit: Story = {
  args: { path: '/specs/no-git-spec?scenario=no-git' },
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
