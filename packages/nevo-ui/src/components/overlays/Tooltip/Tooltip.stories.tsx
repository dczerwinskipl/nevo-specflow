import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from '../../actions/IconButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip';

const meta = {
  title: 'Nevo UI/Overlays/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton aria-label="Archive" icon="archive" />
        </TooltipTrigger>
        <TooltipContent>Archive customer</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  ...Default,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Archive' });
    trigger.focus();
    await userEvent.keyboard('{Tab}{Shift>}{Tab}{/Shift}');
    assert(document.querySelector('[role="tooltip"]'), 'Keyboard focus should expose the tooltip.');
    await userEvent.keyboard('{Escape}');
    assert(
      document.querySelector('[role="tooltip"]') === null,
      'Escape should dismiss the tooltip.',
    );
  },
};
