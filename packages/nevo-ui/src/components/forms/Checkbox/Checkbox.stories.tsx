import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox, CheckboxField } from './Checkbox';

const meta = {
  title: 'Nevo UI/Forms/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: { 'aria-label': 'Checkbox' },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Indeterminate: Story = { args: { indeterminate: true } };
export const Disabled: Story = { args: { disabled: true } };
export const WithLabel: Story = {
  render: () => (
    <CheckboxField
      defaultChecked
      label="Include archived customers"
      description="Archived records will appear in search results."
    />
  ),
};
