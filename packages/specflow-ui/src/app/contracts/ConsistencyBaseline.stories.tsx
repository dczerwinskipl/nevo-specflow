import type { Meta, StoryObj } from '@storybook/react-vite';
import { browserPage } from '../../test-support/browserPage';
import { TaskWorkbenchFixture } from '../../features/tasks/pages/FullTaskWorkspace.stories';
import { RoutedApplication } from '../SpecFlowShell.stories';
import scrollMeta from '../../../../nevo-ui/src/app/workspace/AppWorkspaceScroll.contract.stories';
import { withLocale } from '../../i18n/StoryLocalization';

function Baseline({ screen = 'task' }: { screen?: 'task' | 'specification' | 'scroll' }) {
  if (screen === 'specification') {
    return <RoutedApplication path="/specs/admission?collection=current" />;
  }

  if (screen === 'scroll') {
    const Scroll = scrollMeta.component;

    return <Scroll />;
  }

  return <TaskWorkbenchFixture scenario="human-gates" />;
}

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Contracts/Creation consistency baseline',
  component: Baseline,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Baseline>;
export default meta;
type Story = StoryObj<typeof meta>;
async function capture(_name: string) {
  for (const width of [1440, 390]) {
    await (await browserPage()).viewport(width, 900);
  }
}

export const Task: Story = {
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      name: 'Preserve session and navigation context',
      level: 1,
    });
    await capture('task');
  },
};
export const Specification: Story = {
  args: { screen: 'specification' },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
    await capture('specification');
  },
};
export const Scroll: Story = {
  args: { screen: 'scroll' },
  play: async ({ canvas }) => {
    await canvas.findByRole('button', { name: 'Save document' });
    await capture('scroll');
  },
};
