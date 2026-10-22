import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Field } from '../Field';
import { OptionPicker, type OptionPickerItem } from './OptionPicker';

const labels = { showOptions: 'Show options', noResults: 'No results', loading: 'Loading' };

const options = (count: number): OptionPickerItem[] =>
  Array.from({ length: count }, (_, index) => ({
    value: `branch-${index}`,
    textValue: `feature/branch-${index}`,
    label: `feature/branch-${index}`,
    ...(index === 1 ? { unavailable: true, description: 'Checked out in another workspace' } : {}),
  }));

function Picker({ count }: { count: number }) {
  const [value, setValue] = useState('');
  return (
    <div className="w-72 max-w-full">
      <Field>
        <Field.Label>Branch</Field.Label>
        <OptionPicker
          items={options(count)}
          value={value}
          onValueChange={setValue}
          labels={labels}
          placeholder="Choose a branch"
        />
      </Field>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Forms/OptionPicker',
  component: OptionPicker,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Chooses one option from a list the owner cannot bound in advance: up to eight options a closed Select, more a searchable Combobox, with the same item anatomy.',
      },
    },
  },
} satisfies Meta<typeof OptionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const unused = { items: [], value: '', labels, onValueChange: () => undefined };

export const ShortListIsASelect: Story = {
  args: unused,
  render: () => <Picker count={5} />,
};

export const LongListIsACombobox: Story = {
  args: unused,
  render: () => <Picker count={12} />,
};
