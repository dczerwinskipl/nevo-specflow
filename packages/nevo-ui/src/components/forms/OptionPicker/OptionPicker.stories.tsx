import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { within, waitFor } from '@testing-library/dom';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
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

const longBranch = 'feature/platform-wide-integration-of-the-new-workspace-lifecycle-and-recovery';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function NestedBranchPicker() {
  const [value, setValue] = useState('long');

  return (
    <Field className="w-64">
      <Field.Label>Starting branch</Field.Label>
      <OptionPicker
        value={value}
        onValueChange={setValue}
        labels={labels}
        items={[
          {
            value: 'long',
            textValue: longBranch,
            meta: 'Current workspace',
            label: (wraps) => (
              <span className="inline-flex min-w-0 max-w-full items-start gap-1">
                <Icon name="branch" size="sm" className="shrink-0" />
                <Typography
                  as="span"
                  variant="code-md"
                  className={wraps ? 'min-w-0 wrap-anywhere' : 'min-w-0 truncate'}
                >
                  {longBranch}
                </Typography>
              </span>
            ),
          },
          { value: 'main', textValue: 'main', label: 'main' },
        ]}
      />
    </Field>
  );
}

export const WrappedOptionsKeepClosedValueInline: Story = {
  args: unused,
  tags: ['contract'],
  render: () => <NestedBranchPicker />,
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Starting branch' });
    const icon = trigger.querySelector('svg')!;
    const name = trigger.querySelector<HTMLElement>('.font-mono')!;
    const iconBounds = icon.getBoundingClientRect();
    const nameBounds = name.getBoundingClientRect();
    assert(nameBounds.left >= iconBounds.right, 'The name stays beside its branch icon.');
    assert(
      nameBounds.top < iconBounds.bottom && iconBounds.top < nameBounds.bottom,
      'The closed name and icon occupy the same line.',
    );
    assert(getComputedStyle(name).whiteSpace === 'nowrap', 'The closed name stays single-line.');

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    try {
      const option = await within(document.body).findByRole('option', { name: longBranch });
      const openName = option.querySelector<HTMLElement>('.font-mono')!;
      assert(getComputedStyle(openName).whiteSpace === 'normal', 'The open name can wrap.');
      assert(
        openName.getBoundingClientRect().height > nameBounds.height,
        'The complete long name wraps onto more than one line in the option.',
      );
    } finally {
      await userEvent.keyboard('{Escape}');
    }

    await waitFor(() =>
      assert(document.activeElement === trigger, 'Focus returns to the trigger.'),
    );
  },
};
