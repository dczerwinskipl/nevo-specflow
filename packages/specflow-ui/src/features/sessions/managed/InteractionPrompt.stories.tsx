import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { InteractionPrompt } from './InteractionPrompt';

const meta = {
  title: 'SpecFlow/Sessions/Interaction Permission',
  component: InteractionPrompt,
  tags: ['contract'],
  decorators: [
    (Story) => (
      <StoryLocalization locale="en">
        <Story />
      </StoryLocalization>
    ),
  ],
  args: {
    busy: false,
    onRespond: fn(),
    interaction: {
      interactionId: 'permission-1',
      turnId: 'turn-1',
      workId: 'work-1',
      revision: 1,
      kind: 'permission',
      prompt: 'Allow this command once?',
      actionSummary: 'Run a controlled command',
      action: {
        operation: 'command',
        command: 'echo controlled\necho second line',
        cwd: 'src/tools',
        authority: 'host-execution',
        approval: 'once',
      },
    },
  },
} satisfies Meta<typeof InteractionPrompt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HostExecution: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Directory relative to the workspace: src\/tools/)).toBeVisible();
    const command = canvas.getByText(/echo controlled/);
    await expect(command).toHaveTextContent('echo controlled echo second line');
    await expect(command).toHaveStyle({ whiteSpace: 'pre-wrap' });
    await expect(canvas.getByText(/It may change files outside the workspace/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Allow' }));
    await expect(args.onRespond).toHaveBeenCalledWith({ kind: 'permission', decision: 'allow' });
  },
};
