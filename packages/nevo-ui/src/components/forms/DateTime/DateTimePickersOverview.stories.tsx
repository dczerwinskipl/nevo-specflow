import { parseDate, parseTime, parseZonedDateTime } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from '../Field';
import { DatePicker } from './DatePicker';
import { DateRangePicker } from './DateRangePicker';
import { DateTimePicker } from './DateTimePicker';
import { TimePicker } from './TimePicker';

const meta = {
  title: 'Nevo UI/Forms/DateTime/Overview',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Supported date and time picker surfaces. Individual component stories document states, responsive presentations and interaction contracts.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SupportedPickers: Story = {
  render: () => (
    <div className="grid w-[min(48rem,calc(100vw-2rem))] gap-6 md:grid-cols-2">
      <Field>
        <Field.Label>Delivery date</Field.Label>
        <DatePicker defaultValue={parseDate('2026-09-18')} />
        <Field.Description>Date-only value.</Field.Description>
      </Field>

      <Field>
        <Field.Label>Start time</Field.Label>
        <TimePicker defaultValue={parseTime('12:30')} />
        <Field.Description>Local wall-clock time.</Field.Description>
      </Field>

      <Field>
        <Field.Label>Delivery window</Field.Label>
        <DateRangePicker
          defaultValue={{
            start: parseDate('2026-09-15'),
            end: parseDate('2026-09-19'),
          }}
        />
        <Field.Description>Date range using one shared calendar surface.</Field.Description>
      </Field>

      <Field>
        <Field.Label>Starts at</Field.Label>
        <DateTimePicker defaultValue={parseZonedDateTime('2026-09-15T12:30[Europe/Warsaw]')} />
        <Field.Description>Zoned date and time.</Field.Description>
      </Field>
    </div>
  ),
};

