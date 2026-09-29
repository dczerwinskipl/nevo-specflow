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

