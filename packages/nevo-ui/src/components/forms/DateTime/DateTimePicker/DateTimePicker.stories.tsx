import { parseZonedDateTime } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../../Field';
import { DateTimePicker } from './DateTimePicker';

const captureProps = (sourceId: string) =>
  ({
    'data-design-canonical': 'true',
    'data-design-source-id': sourceId,
  }) as const;

const defaultValue = parseZonedDateTime('2026-09-15T12:30[Europe/Warsaw]');

const meta = {
  title: 'Nevo UI/Forms/DateTime/DateTimePicker',
  component: DateTimePicker,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Starts at',
    defaultValue,
  },
} satisfies Meta<typeof DateTimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DesktopOpen: Story = {
  args: {
    defaultOpen: true,
    pickerPresentation: 'desktop',
  },
};

export const MobileOpen: Story = {
  args: {
    defaultOpen: true,
    pickerPresentation: 'mobile',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
    layout: 'fullscreen',
  },
};

export const MinuteStep5: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 5,
    pickerPresentation: 'desktop',
  },
};

export const MinuteStep10: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 10,
    pickerPresentation: 'desktop',
  },
};

export const MinuteStep15: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 15,
    pickerPresentation: 'desktop',
  },
};

export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };

export const FieldComposition: Story = {
  render: (args) => (
    <Field className="max-w-md">
      <Field.Label>Starts at</Field.Label>
      <DateTimePicker {...args} />
      <Field.Description>
        Zoned date and time; the supplied zone remains authoritative.
      </Field.Description>
    </Field>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['DateTimePicker']}>
      <div className="grid w-96 gap-4">
        <DateTimePicker
          {...captureProps('default')}
          aria-label="Starts at"
          defaultValue={defaultValue}
        />
        <DateTimePicker
          {...captureProps('disabled')}
          aria-label="Starts at"
          defaultValue={defaultValue}
          disabled
        />
        <DateTimePicker
          {...captureProps('invalid')}
          aria-label="Starts at"
          defaultValue={defaultValue}
          invalid
        />
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'DateTimePicker',
      title: 'DateTimePicker',
      description: 'Time-zone-aware segmented date/time control backed by ZonedDateTime.',
      kind: 'component',
      order: 136,
    },
  },
};
