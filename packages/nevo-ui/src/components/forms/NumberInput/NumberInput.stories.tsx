import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Field } from '../Field';
import { NumberInput } from './NumberInput';

const captureProps = (sourceId: string) =>
  ({
    'data-design-canonical': 'true',
    'data-design-source-id': sourceId,
  }) as const;

const meta = {
  title: 'Nevo UI/Forms/NumberInput',
  component: NumberInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Locale-aware numeric input. React Aria supplies parsing, step behavior and accessibility while Nevo UI owns the visual contract.',
      },
    },
  },
  args: {
    minValue: 0,
    maxValue: 100,
    step: 0.1,
    defaultValue: 12.5,
    showSteppers: true,
  },
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field className="max-w-xs">
      <Field.Label>Threshold</Field.Label>
      <NumberInput {...args} />
      <Field.Description>Use the buttons or Arrow Up / Arrow Down.</Field.Description>
    </Field>
  ),
};

export const FractionalStep: Story = {
  args: { defaultValue: 0.2, minValue: 0, maxValue: 1, step: 0.1 },
  render: (args) => (
    <Field className="max-w-xs">
      <Field.Label>Ratio</Field.Label>
      <NumberInput {...args} />
    </Field>
  ),
};

export const Currency: Story = {
  args: {
    defaultValue: 1234.5,
    minValue: 0,
    step: 0.01,
    formatOptions: { style: 'currency', currency: 'PLN' },
  },
  render: (args) => (
    <Field className="max-w-xs">
      <Field.Label>Budget</Field.Label>
      <NumberInput {...args} />
    </Field>
  ),
};

export const WithoutSteppers: Story = {
  args: { showSteppers: false },
  render: (args) => (
    <Field className="max-w-xs">
      <Field.Label>Quantity</Field.Label>
      <NumberInput {...args} />
    </Field>
  ),
};

export const Invalid: Story = {
  args: { invalid: true },
  render: (args) => (
    <Field className="max-w-xs" invalid>
      <Field.Label>Threshold</Field.Label>
      <NumberInput {...args} />
      <Field.Error>Enter a value in the allowed range.</Field.Error>
    </Field>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Field className="max-w-xs" disabled>
      <Field.Label>Threshold</Field.Label>
      <NumberInput {...args} />
    </Field>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['NumberInput']}>
      <div className="grid w-72 gap-4">
        <NumberInput
          {...captureProps('default-shown')}
          aria-label="Number"
          defaultValue={12.5}
          step={0.1}
        />
        <NumberInput
          {...captureProps('default-hidden')}
          aria-label="Number"
          defaultValue={12.5}
          showSteppers={false}
        />
        <NumberInput
          {...captureProps('disabled-shown')}
          aria-label="Number"
          defaultValue={12.5}
          disabled
        />
        <NumberInput
          {...captureProps('disabled-hidden')}
          aria-label="Number"
          defaultValue={12.5}
          disabled
          showSteppers={false}
        />
        <NumberInput
          {...captureProps('invalid-shown')}
          aria-label="Number"
          defaultValue={12.5}
          invalid
        />
        <NumberInput
          {...captureProps('invalid-hidden')}
          aria-label="Number"
          defaultValue={12.5}
          invalid
          showSteppers={false}
        />
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'NumberInput',
      title: 'NumberInput',
      description: 'Locale-aware numeric input with optional steppers and Nevo control styling.',
      kind: 'component',
      order: 116,
    },
  },
};
