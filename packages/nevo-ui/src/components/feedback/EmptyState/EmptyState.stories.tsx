import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import { EmptyState } from './EmptyState';
const meta = {
  title: 'Nevo UI/Feedback/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: { title: 'No customers' },
  render: () => (
    <EmptyState
      icon="inbox"
      title="No customers"
      description="Create the first customer to start working with this account."
      actions={<Button size="sm">Create customer</Button>}
    />
  ),
};
