import { CalendarDate, Time } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { SegmentedControl } from '../SegmentedControl';
import { DateCalendarPanel, DateRangeCalendarPanel } from './shared/CalendarPanel';
import { PickerActions } from './shared/PickerActions';
import { TimeListSelector } from './shared/TimeListSelector';
import { TimeWheelSelector } from './shared/TimeWheelSelector';

type Pattern =
  | 'date-desktop'
  | 'date-mobile'
  | 'date-range-desktop'
  | 'date-range-mobile'
  | 'time-desktop'
  | 'time-mobile'
  | 'datetime-desktop'
  | 'datetime-mobile-date'
  | 'datetime-mobile-time';

const labels = {
  cancel: 'Cancel',
  done: 'Done',
  hour: 'Hour',
  minute: 'Minute',
  now: 'Now',
  time: 'Time',
};

const exampleDate = new CalendarDate(2026, 9, 15);
const exampleTime = new Time(12, 30);

function Surface({ children, mobile }: { children: ReactNode; mobile: boolean }) {
  return (
    <div
      className={
        mobile
          ? 'w-96 max-w-full rounded-t-surface border border-border-default bg-surface-raised px-4 pb-5 pt-4'
          : 'w-fit rounded-composite border border-border-default bg-surface-raised p-3 shadow-2xl'
      }
    >
      {children}
    </div>
  );
}

function StepSwitch({ selected }: { selected: 'date' | 'time' }) {
  return (
    <SegmentedControl
      aria-label="Date and time"
      className="w-full"
      value={selected}
      onValueChange={() => {}}
    >
      <SegmentedControl.Item value="date">Date</SegmentedControl.Item>
      <SegmentedControl.Item value="time">Time</SegmentedControl.Item>
    </SegmentedControl>
  );
}

function DateTimePickersOverview({ pattern }: { pattern: Pattern }) {
  const capture = useDesignMetadata('DateTimePickersOverview', { pattern });
  const mobile = pattern.includes('mobile');

  let content: ReactNode;

  switch (pattern) {
    case 'date-desktop':
    case 'date-mobile':
      content = (
        <div className="grid gap-3">
          <DateCalendarPanel defaultValue={exampleDate} />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} />
        </div>
      );
      break;

    case 'date-range-desktop':
    case 'date-range-mobile':
      content = (
        <div className="grid gap-3">
          <DateRangeCalendarPanel
            defaultValue={{
              start: new CalendarDate(2026, 9, 12),
              end: new CalendarDate(2026, 9, 16),
            }}
          />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} />
        </div>
      );
      break;

    case 'time-desktop':
      content = (
        <div className="grid gap-3">
          <TimeListSelector labels={labels} value={exampleTime} onChange={() => {}} />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} onNow={() => {}} />
        </div>
      );
      break;

    case 'time-mobile':
      content = (
        <div className="grid gap-4">
          <TimeWheelSelector labels={labels} value={exampleTime} onChange={() => {}} />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} onNow={() => {}} />
        </div>
      );
      break;

    case 'datetime-desktop':
      content = (
        <div className="grid gap-3">
          <div className="grid grid-cols-[auto_16rem] gap-4">
            <DateCalendarPanel defaultValue={exampleDate} />
            <div className="border-l border-border-subtle pl-4">
              <TimeListSelector labels={labels} value={exampleTime} onChange={() => {}} />
            </div>
          </div>
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} onNow={() => {}} />
        </div>
      );
      break;

    case 'datetime-mobile-date':
      content = (
        <div className="grid gap-4">
          <StepSwitch selected="date" />
          <DateCalendarPanel defaultValue={exampleDate} />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} onNow={() => {}} />
        </div>
      );
      break;

    case 'datetime-mobile-time':
      content = (
        <div className="grid gap-4">
          <StepSwitch selected="time" />
          <TimeWheelSelector labels={labels} value={exampleTime} onChange={() => {}} />
          <PickerActions labels={labels} onCancel={() => {}} onDone={() => {}} onNow={() => {}} />
        </div>
      );
      break;
  }

  return (
    <div
      {...capture}
      {...designSlot('DateTimePickersOverview', 'surface')}
      className="inline-grid w-fit"
      data-design-canonical="true"
      data-design-source-id={pattern}
    >
      <Surface mobile={mobile}>{content}</Surface>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Internal/DateTime/Overview capture',
  component: DateTimePickersOverview,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'centered',
    designCapture: {
      component: 'DateTimePickersOverview',
      title: 'Date & Time picker surfaces',
      description: 'Deterministic design overview of open desktop and mobile picker surfaces.',
      kind: 'component',
      order: 138,
    },
  },
  decorators: [
    (Story) => (
      <DesignCaptureProvider captureComponents={['DateTimePickersOverview']}>
        <Story />
      </DesignCaptureProvider>
    ),
  ],
} satisfies Meta<typeof DateTimePickersOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DateDesktop: Story = { args: { pattern: 'date-desktop' } };
export const DateMobile: Story = { args: { pattern: 'date-mobile' } };
export const DateRangeDesktop: Story = {
  args: { pattern: 'date-range-desktop' },
};
export const DateRangeMobile: Story = {
  args: { pattern: 'date-range-mobile' },
};
export const TimeDesktop: Story = { args: { pattern: 'time-desktop' } };
export const TimeMobile: Story = { args: { pattern: 'time-mobile' } };
export const DateTimeDesktop: Story = {
  args: { pattern: 'datetime-desktop' },
};
export const DateTimeMobileDate: Story = {
  args: { pattern: 'datetime-mobile-date' },
};
export const DateTimeMobileTime: Story = {
  args: { pattern: 'datetime-mobile-time' },
};

const capturePatterns: readonly Pattern[] = [
  'date-desktop',
  'date-mobile',
  'date-range-desktop',
  'date-range-mobile',
  'time-desktop',
  'time-mobile',
  'datetime-desktop',
  'datetime-mobile-date',
  'datetime-mobile-time',
];

export const CanonicalCapture: Story = {
  args: { pattern: 'time-desktop' },
  render: () => (
    <DesignCaptureProvider captureComponents={['DateTimePickersOverview']}>
      <div className="grid gap-8">
        {capturePatterns.map((pattern) => (
          <DateTimePickersOverview key={pattern} pattern={pattern} />
        ))}
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'DateTimePickersOverview',
      title: 'Date & Time picker surfaces',
      description: 'Deterministic design overview of open desktop and mobile picker surfaces.',
      kind: 'component',
      order: 138,
    },
  },
};
