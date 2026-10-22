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

export const DisabledWithReason: Story = {
  render: () => (
    <div className="grid max-w-md gap-4">
      <CheckboxField label="Create a worktree" description="Available for this repository." />
      <CheckboxField
        disabled
        label="Push the branch after creation"
        description="The remote is read-only for this project, so the branch cannot be pushed."
      />
    </div>
  ),
};

export const DisabledWithReasonContract: Story = {
  ...DisabledWithReason,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas }) => {
    const reason = canvas.getByText(/remote is read-only/);
    const enabledReason = canvas.getByText('Available for this repository.');
    const disabledLabel = canvas.getByText('Push the branch after creation');
    const enabledLabel = canvas.getByText('Create a worktree');
    for (let node: HTMLElement | null = reason; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity !== '1')
        throw new Error('The disabled reason must not fade.');
    }
    if (getComputedStyle(reason).color !== getComputedStyle(enabledReason).color)
      throw new Error('The disabled reason keeps the normal description role.');
    if (getComputedStyle(disabledLabel).color === getComputedStyle(enabledLabel).color)
      throw new Error('The disabled label shows the disabled role.');
    if (getComputedStyle(disabledLabel).cursor !== 'not-allowed')
      throw new Error('The disabled label is not interactive.');
    const checkbox = canvas.getByRole('checkbox', { name: 'Push the branch after creation' });
    if (
      !checkbox.hasAttribute('disabled') ||
      checkbox.getAttribute('aria-describedby') !== reason.id
    )
      throw new Error('The control stays disabled and described by its reason.');
  },
};
