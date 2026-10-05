import { parseDate } from '@internationalized/date';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Field } from '../../Field';
import { DatePicker } from './DatePicker';

const captureProps = (sourceId: string) =>
  ({
    'data-design-canonical': 'true',
    'data-design-source-id': sourceId,
  }) as const;

const meta = {
  title: 'Nevo UI/Forms/DateTime/DatePicker',
  component: DatePicker,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Delivery date',
    defaultValue: parseDate('2026-09-18'),
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <DatePicker {...args} />
    </div>
  ),
};

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
    minValue: parseDate('2026-09-14'),
    maxValue: parseDate('2026-10-31'),
  },
};

export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };

export const FieldComposition: Story = {
  render: (args) => (
    <Field className="max-w-sm">
      <Field.Label>Delivery date</Field.Label>
      <DatePicker {...args} />
      <Field.Description>Field labeling is bridged to the segmented control.</Field.Description>
    </Field>
  ),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <DatePicker {...args} pickerPresentation="desktop" />
    </div>
  ),
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert(dialog, 'Keyboard activation should open the calendar dialog.');
    assert(dialog.contains(document.activeElement), 'The calendar dialog should receive focus.');
    await userEvent.keyboard('{Escape}');
    assert(document.querySelector('[role="dialog"]') === null, 'Escape should close the calendar.');
    // React Aria restores FocusScope focus on an animation frame after unmount.
    // Keep the exact assertion, but observe the completed lifecycle rather than the key event.
    for (let attempt = 0; document.activeElement !== trigger && attempt < 60; attempt += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    assert(document.activeElement === trigger, 'The calendar should restore trigger focus.');
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['DatePicker']}>
      <div className="grid w-80 gap-4">
        <DatePicker
          {...captureProps('default')}
          aria-label="Delivery date"
          defaultValue={parseDate('2026-09-18')}
        />
        <DatePicker
          {...captureProps('disabled')}
          aria-label="Delivery date"
          defaultValue={parseDate('2026-09-18')}
          disabled
        />
        <DatePicker
          {...captureProps('invalid')}
          aria-label="Delivery date"
          defaultValue={parseDate('2026-09-18')}
          invalid
        />
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'DatePicker',
      title: 'DatePicker',
      description: 'Date-only segmented control backed by CalendarDate with a calendar trigger.',
      kind: 'component',
      order: 130,
    },
  },
};
