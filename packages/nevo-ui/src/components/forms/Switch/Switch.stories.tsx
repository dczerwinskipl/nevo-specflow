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

export const DisabledWithDescription: Story = {
  tags: ['contract', '!autodocs'],
  render: () => (
    <div className="grid max-w-md gap-4">
      <SwitchField label="Off" description="Reason stays readable." />
      <SwitchField defaultChecked label="On" description="Reason stays readable." />
      <SwitchField disabled label="Disabled off" description="Reason stays readable." />
      <SwitchField
        disabled
        defaultChecked
        label="Disabled on"
        description="Reason stays readable."
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const description = canvas.getAllByText('Reason stays readable.')[2]!;
    const field = description.parentElement!.parentElement!;
    if (getComputedStyle(field).opacity !== '1') {
      throw new Error('The disabled field wrapper must not fade (the control fades itself).');
    }

    const control = canvas.getAllByRole('switch')[2]!;
    if (Number(getComputedStyle(control).opacity) !== 0.6) {
      throw new Error('The disabled control fades once.');
    }

    // Off state boundary uses the 3:1 control border, not the decorative border.
    const off = canvas.getAllByRole('switch')[0]!;
    if (getComputedStyle(off).borderTopColor === 'rgba(255, 255, 255, 0.095)') {
      throw new Error('The OFF switch must use border-control.');
    }
  },
};
