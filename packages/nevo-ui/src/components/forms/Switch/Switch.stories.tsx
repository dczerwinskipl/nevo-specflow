import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch, SwitchField } from './Switch';

const meta = {
  title: 'Nevo UI/Forms/Switch',
  component: Switch,
  tags: ['autodocs'],
  args: { 'aria-label': 'Switch' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const WithLabel: Story = {
  render: () => (
    <div className="max-w-md">
      <SwitchField
        defaultChecked
        label="Automatic notifications"
        description="Notify the account team when the customer status changes."
      />
    </div>
  ),
};

