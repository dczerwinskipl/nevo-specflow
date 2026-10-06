import { CalendarDate, Time, parseZonedDateTime } from '@internationalized/date';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../overlays/Dialog';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../../overlays/Drawer';
import { DatePicker } from './DatePicker';
import { DateRangePicker } from './DateRangePicker';
import { DateTimePicker } from './DateTimePicker';
import { TimePicker } from './TimePicker';

type Presentation = 'desktop' | 'mobile';

const date = new CalendarDate(2026, 9, 15);
const range = {
  start: new CalendarDate(2026, 9, 15),
  end: new CalendarDate(2026, 9, 18),
};
const zoned = parseZonedDateTime('2026-09-15T12:30[Europe/Warsaw]');
const futureDateMin = new CalendarDate(2099, 1, 1);
const futureDateMax = new CalendarDate(2099, 1, 31);
const constrainedTimeMin = new Time(10, 0);
const constrainedTimeMax = new Time(11, 0);
const futureZonedMin = parseZonedDateTime('2099-01-01T10:00[Europe/Warsaw]');
const futureZonedMax = parseZonedDateTime('2099-01-31T18:00[Europe/Warsaw]');

function PickerSet({ presentation }: { presentation: Presentation }) {
  return (
    <div className="grid gap-4">
      <DatePicker aria-label="Start date" defaultValue={date} pickerPresentation={presentation} />
      <DateRangePicker
        aria-label="Date range"
        defaultValue={range}
        pickerPresentation={presentation}
      />
      <TimePicker
        aria-label="Start time"
        defaultValue={new Time(12, 30)}
        pickerPresentation={presentation}
      />
      <DateTimePicker
        aria-label="Starts at"
        defaultValue={zoned}
        pickerPresentation={presentation}
      />
    </div>
  );
}

function InDialog({ presentation }: { presentation: Presentation }) {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Date/time overlay compatibility</DialogTitle>
          <DialogDescription>
            React Aria picker overlays nested inside the Radix Dialog.
          </DialogDescription>
        </DialogHeader>
        <PickerSet presentation={presentation} />
      </DialogContent>
    </Dialog>
  );
}

function InDrawer({ presentation }: { presentation: Presentation }) {
  return (
    <Drawer defaultOpen>
      <DrawerTrigger asChild>
        <Button>Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent closeLabel="Close drawer">
        <DrawerHeader>
          <DrawerTitle>Date/time overlay compatibility</DrawerTitle>
          <DrawerDescription>
            React Aria picker overlays nested inside the Radix Drawer.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <PickerSet presentation={presentation} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function EmptyConstrainedDatePicker() {
  const [committed, setCommitted] = useState('');

  return (
    <div data-commit={committed}>
      <DatePicker
        aria-label="Constrained empty date"
        defaultOpen
        maxValue={futureDateMax}
        minValue={futureDateMin}
        pickerPresentation="desktop"
        onChange={(value) => setCommitted(value?.toString() ?? 'null')}
      />
    </div>
  );
}

function EmptyConstrainedTimePicker() {
  const [committed, setCommitted] = useState('');

  return (
    <div data-commit={committed}>
      <TimePicker
        aria-label="Constrained empty time"
        defaultOpen
        maxValue={constrainedTimeMax}
        minValue={constrainedTimeMin}
        pickerPresentation="desktop"
        onChange={(value) => setCommitted(value?.toString() ?? 'null')}
      />
    </div>
  );
}

function EmptyConstrainedDateRangePicker() {
  const [committed, setCommitted] = useState('');

  return (
    <div data-commit={committed}>
      <DateRangePicker
        aria-label="Constrained empty date range"
        defaultOpen
        maxValue={futureDateMax}
        minValue={futureDateMin}
        pickerPresentation="desktop"
        onChange={(value) =>
          setCommitted(value ? `${value.start.toString()}..${value.end.toString()}` : 'null')
        }
      />
    </div>
  );
}

function EmptyConstrainedDateTimePicker() {
  const [committed, setCommitted] = useState('');

  return (
    <div data-commit={committed}>
      <DateTimePicker
        aria-label="Constrained empty date and time"
        defaultOpen
        defaultTimeZone="Europe/Warsaw"
        maxValue={futureZonedMax}
        minValue={futureZonedMin}
        pickerPresentation="desktop"
        onChange={(value) => setCommitted(value?.toString() ?? 'null')}
      />
    </div>
  );
}

async function findDocumentButton(name: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (button) return button;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return undefined;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function commitImmediateDone(
  canvasElement: HTMLElement,
  userEvent: { click: (element: HTMLElement) => Promise<void> },
  expected: string,
) {
  const done = await findDocumentButton('Done');
  assert(done, 'The constrained empty picker should expose Done immediately.');
  await userEvent.click(done);
  assert(
    canvasElement.querySelector('[data-commit]')?.getAttribute('data-commit') === expected,
    `Immediate Done should commit the constrained fallback ${expected}.`,
  );
}

const meta = {
  title: 'Nevo UI/Internal/DateTime/Radix compatibility',
  tags: ['integration', '!autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Manual merge gate for React Aria picker overlays nested in Nevo Radix Dialog and Drawer.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const DesktopInsideDialog: Story = {
  render: () => <InDialog presentation="desktop" />,
};

export const MobileInsideDialog: Story = {
  render: () => <InDialog presentation="mobile" />,
};

export const DesktopInsideDrawer: Story = {
  render: () => <InDrawer presentation="desktop" />,
};

export const MobileInsideDrawer: Story = {
  render: () => <InDrawer presentation="mobile" />,
};

export const EmptyConstrainedDateImmediateDone: Story = {
  render: () => <EmptyConstrainedDatePicker />,
  play: async ({ canvasElement, userEvent }) => {
    await commitImmediateDone(canvasElement, userEvent, futureDateMin.toString());
  },
};

export const EmptyConstrainedTimeImmediateDone: Story = {
  render: () => <EmptyConstrainedTimePicker />,
  play: async ({ canvasElement, userEvent }) => {
    await commitImmediateDone(canvasElement, userEvent, constrainedTimeMin.toString());
  },
};

export const EmptyConstrainedDateRangeImmediateDone: Story = {
  render: () => <EmptyConstrainedDateRangePicker />,
  play: async ({ canvasElement, userEvent }) => {
    await commitImmediateDone(
      canvasElement,
      userEvent,
      `${futureDateMin.toString()}..${futureDateMin.toString()}`,
    );
  },
};

export const EmptyConstrainedDateTimeImmediateDone: Story = {
  render: () => <EmptyConstrainedDateTimePicker />,
  play: async ({ canvasElement, userEvent }) => {
    await commitImmediateDone(canvasElement, userEvent, futureZonedMin.toString());
  },
};
