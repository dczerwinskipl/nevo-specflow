import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoutedApplication } from '../../app/SpecFlowShell.stories';

// The real router and account/navigation shell, not a substitute detail fixture.
const meta = {
  title: 'SpecFlow/Screens/Specification Workspace',
  component: RoutedApplication,
  parameters: { layout: 'fullscreen' },
  args: { path: '/specs/admission?collection=current' },
} satisfies Meta<typeof RoutedApplication>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Working: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('Specification ID: admission', {}, { timeout: 5000 });
    const checkboxes = await canvas.findAllByRole('checkbox');
    const firstCheckbox = checkboxes[0];
    if (firstCheckbox) {
      await userEvent.click(firstCheckbox);
      await canvas.findByText('1 selected', {}, { timeout: 2000 });
      await userEvent.click(firstCheckbox);
    }
  },
};

export const TaskPreviewFlow: Story = {
  args: { path: '/specs/admission?collection=current' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('Specification ID: admission', {}, { timeout: 10000 });

    const taskElement = await canvas.findByText(
      /Obsługa odświeżania uprawnień w długotrwałej sesji użytkownika/i,
    );
    await userEvent.click(taskElement);

    const taskMatches = await canvas.findAllByText('TASK-03', {}, { timeout: 5000 });
    if (taskMatches.length < 2) throw new Error('Expected TASK-03 in both row and preview');

    const closeBtn = await canvas.findByRole('button', { name: /Close secondary content/i });
    await userEvent.click(closeBtn);

    const historyElements = await canvas.findAllByText(/Activity history/i, {}, { timeout: 5000 });
    if (historyElements.length === 0) throw new Error('Expected Activity history after closing');
  },
};

export const FullTaskPromotionFlow: Story = {
  args: { path: '/specs/admission?collection=current' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('Specification ID: admission', {}, { timeout: 10000 });

    const taskElement = await canvas.findByText(
      /Obsługa odświeżania uprawnień w długotrwałej sesji użytkownika/i,
    );
    await userEvent.click(taskElement);

    const fullTaskButtons = await canvas.findAllByText(/Full task view/i);
    if (fullTaskButtons.length === 0)
      throw new Error('Expected Full task view action in task preview');
    await userEvent.click(fullTaskButtons[0]);

    await canvas.findByRole('heading', { name: /Task \/ TASK-03/i }, { timeout: 5000 });

    const backBtn = await canvas.findByRole('button', {
      name: /Back to specification|Wróć do specyfikacji/i,
    });
    await userEvent.click(backBtn);

    await canvas.findByText('Specification ID: admission', {}, { timeout: 5000 });
  },
};

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
