import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../Field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './Select';

const statusOptions = [
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['archived', 'Archived'],
] as const;

function StatusSelect({
  autoFocus = false,
  disabled = false,
  invalid = false,
  longLabels = false,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  longLabels?: boolean;
}) {
  return (
    <Field className="w-80" disabled={disabled} invalid={invalid}>
      <Field.Label>Status</Field.Label>
      <Select
        defaultValue={longLabels ? 'approval' : 'active'}
        disabled={disabled}
        invalid={invalid}
      >
        <SelectTrigger autoFocus={autoFocus}>
          <SelectValue placeholder="Choose a status" />
        </SelectTrigger>
        <SelectContent aria-label="Status options">
          <SelectGroup>
            <SelectLabel>Lifecycle</SelectLabel>
            {statusOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
          {longLabels ? (
            <>
              <SelectSeparator />
              <SelectItem
                textValue="Requires executive approval"
                title="Requires executive approval before the account can be reactivated"
                value="approval"
              >
                Requires executive approval before the account can be reactivated
              </SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>
      {invalid ? (
        <Field.Error>Select a valid lifecycle status.</Field.Error>
      ) : (
        <Field.Description>Used in customer filters and record views.</Field.Description>
      )}
    </Field>
  );
}

function ControlledSelect() {
  const [value, setValue] = useState('active');
  return (
    <div data-value={value}>
      <Field className="w-80">
        <Field.Label>Status</Field.Label>
        <Select onValueChange={setValue} value={value}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Status options">
            {statusOptions.map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function SelectTriggerMatrix() {
  return (
    <div className="grid w-80 gap-4">
      <Field>
        <Field.Label>Default</Field.Label>
        <Select defaultValue="default">
          <SelectTrigger data-design-source-id="default">
            <SelectValue>Active</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field>
        <Field.Label>Focus</Field.Label>
        <Select defaultValue="focus">
          <SelectTrigger autoFocus data-design-source-id="focus">
            <SelectValue>Active</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field disabled>
        <Field.Label>Disabled</Field.Label>
        <Select defaultValue="disabled" disabled>
          <SelectTrigger data-design-source-id="disabled">
            <SelectValue>Unavailable</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field invalid>
        <Field.Label>Invalid</Field.Label>
        <Select defaultValue="invalid" invalid>
          <SelectTrigger data-design-source-id="invalid">
            <SelectValue>Unknown status</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
    </div>
  );
}

function SelectItemMatrix() {
  return (
    <div className="flex min-h-72 items-center justify-center bg-canvas p-8">
      <div className="w-56">
        <Select open value="highlighted">
          <SelectTrigger aria-label="Option states" tabIndex={-1}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Select item states">
            <SelectItem data-design-source-id="default" value="default">
              Default option
            </SelectItem>
            <SelectItem autoFocus data-design-source-id="highlighted" value="highlighted">
              Highlighted option
            </SelectItem>
            <SelectItem data-design-source-id="disabled" disabled value="disabled">
              Disabled option
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StorySurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center bg-canvas p-8 text-content-primary">
      {children}
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Forms/Select',
  component: StatusSelect,
  decorators: [
    (Story) => (
      <StorySurface>
        <Story />
      </StorySurface>
    ),
  ],
} satisfies Meta<typeof StatusSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { invalid: true } };

export const LongOptions: Story = {
  args: { longLabels: true },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Status' });
    const value = trigger.querySelector<HTMLElement>('[data-design-slot="value"]');
    const icon = trigger.querySelector<HTMLElement>('[data-design-slot="trailingIcon"]');
    assert(value && icon, 'The long-value fixture should expose its value and trailing icon.');
    const triggerRect = trigger.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    assert(
      getComputedStyle(trigger).overflow === 'hidden',
      'The trigger should clip overflowing value content.',
    );
    assert(
      getComputedStyle(value).textOverflow === 'ellipsis',
      'The selected value should use an ellipsis.',
    );
    assert(
      valueRect.right <= iconRect.left,
      'The selected value must reserve space for the trailing icon.',
    );
    assert(
      iconRect.right <= triggerRect.right,
      'The trailing icon must remain inside the trigger.',
    );
  },
};

export const Controlled: Story = {
  render: () => <ControlledSelect />,
};

export const InteractionContract: Story = {
  render: () => <ControlledSelect />,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Status' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const listbox = await waitFor(
      () => document.querySelector<HTMLElement>('[role="listbox"]'),
      'Select should open its listbox from the keyboard.',
    );
    assert(
      listbox.querySelector('[role="option"][data-state="checked"]') !== null,
      'The current value should be selected.',
    );

    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(
      () => document.querySelector('[role="listbox"]') === null,
      'Enter should choose and close.',
    );
    assert(
      trigger.textContent?.includes('Paused'),
      'Keyboard selection should update the controlled value.',
    );
    assert(
      trigger.closest('[data-value]')?.getAttribute('data-value') === 'paused',
      'Consumer state should own the value.',
    );
    assert(document.activeElement === trigger, 'Selection should restore focus to the trigger.');

    await userEvent.keyboard('{Enter}{Escape}');
    await waitFor(
      () => document.querySelector('[role="listbox"]') === null,
      'Escape should close the listbox.',
    );
    assert(document.activeElement === trigger, 'Escape should restore focus to the trigger.');
  },
};

export const StateCapture: Story = {
  decorators: [],
  render: () => (
    <DesignCaptureProvider captureComponents={['Select']}>
      <StorySurface>
        <SelectTriggerMatrix />
      </StorySurface>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Select',
      title: 'Select',
      description: 'Single-value selection control with field-compatible states',
      kind: 'component',
      order: 36,
    },
  },
};

export const ItemStateCapture: Story = {
  decorators: [],
  render: () => (
    <DesignCaptureProvider captureComponents={['SelectItem']}>
      <SelectItemMatrix />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'SelectItem',
      title: 'Select item',
      description: 'Listbox option states with a selected check indicator',
      kind: 'component',
      order: 38,
    },
  },
};



