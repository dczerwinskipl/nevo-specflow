import { parseDate } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../../Field';
import { DateRangePicker } from './DateRangePicker';

const captureProps = (sourceId: string) =>
  ({
    'data-design-canonical': 'true',
    'data-design-source-id': sourceId,
  }) as const;

const defaultValue = {
  start: parseDate('2026-09-15'),
  end: parseDate('2026-09-19'),
};

const meta = {
  title: 'Nevo UI/Forms/DateTime/DateRangePicker',
  component: DateRangePicker,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Delivery window',
    defaultValue,
  },
} satisfies Meta<typeof DateRangePicker>;

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

export const Constrained: Story = {
  args: {
    minValue: parseDate('2026-09-10'),
    maxValue: parseDate('2026-10-31'),
  },
};

export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };

export const FieldComposition: Story = {
  render: (args) => (
    <Field className="max-w-lg">
      <Field.Label>Delivery window</Field.Label>
      <DateRangePicker {...args} />
      <Field.Description>Select the start and end date.</Field.Description>
    </Field>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['DateRangePicker']}>
      <div className="grid w-[32rem] gap-4">
        <DateRangePicker
          {...captureProps('default')}
          aria-label="Delivery window"
          defaultValue={defaultValue}
        />
        <DateRangePicker
          {...captureProps('disabled')}
          aria-label="Delivery window"
          defaultValue={defaultValue}
          disabled
        />
        <DateRangePicker
          {...captureProps('invalid')}
          aria-label="Delivery window"
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
      component: 'DateRangePicker',
      title: 'DateRangePicker',
      description: 'Date-only range control using two segmented fields and one range calendar.',
      kind: 'component',
      order: 134,
    },
  },
};



