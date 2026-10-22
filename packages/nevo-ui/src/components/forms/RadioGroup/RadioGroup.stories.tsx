import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioGroup, RadioGroupOption } from './RadioGroup';

const meta = {
  title: 'Nevo UI/Forms/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="standard" className="max-w-md">
      <RadioGroupOption
        value="standard"
        label="Standard"
        description="Use the default processing path."
      />
      <RadioGroupOption
        value="priority"
        label="Priority"
        description="Process this record ahead of the normal queue."
      />
      <RadioGroupOption value="disabled" label="Unavailable option" disabled />
    </RadioGroup>
  ),
};

export const DisabledWithReason: Story = {
  render: () => (
    <RadioGroup defaultValue="existing" className="max-w-md">
      <RadioGroupOption
        value="existing"
        label="Use the current branch"
        description="Work continues on main."
      />
      <RadioGroupOption
        disabled
        value="new"
        label="Create a new branch"
        description="Branch creation is unavailable because the repository is read-only."
      />
    </RadioGroup>
  ),
};

export const DisabledWithReasonContract: Story = {
  ...DisabledWithReason,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas }) => {
    const reason = canvas.getByText(/repository is read-only/);
    for (let node: HTMLElement | null = reason; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity !== '1')
        throw new Error('The disabled reason must not fade.');
    }
    const disabledLabel = canvas.getByText('Create a new branch');
    if (
      getComputedStyle(disabledLabel).color ===
      getComputedStyle(canvas.getByText('Use the current branch')).color
    )
      throw new Error('The disabled label shows the disabled role.');
    const radio = canvas.getByRole('radio', { name: 'Create a new branch' });
    if (!radio.hasAttribute('disabled') || radio.getAttribute('aria-describedby') !== reason.id)
      throw new Error('The option stays disabled and described by its reason.');
  },
};
