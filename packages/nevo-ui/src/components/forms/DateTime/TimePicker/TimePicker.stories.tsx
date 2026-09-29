import { parseTime } from '@internationalized/date';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../../Field';
import { TimePicker } from './TimePicker';

const captureProps = (sourceId: string) =>
  ({
    'data-design-canonical': 'true',
    'data-design-source-id': sourceId,
  }) as const;

const meta = {
  title: 'Nevo UI/Forms/DateTime/TimePicker',
  component: TimePicker,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Start time',
    defaultValue: parseTime('12:30'),
  },
} satisfies Meta<typeof TimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DesktopOpen: Story = {
  args: {
    defaultOpen: true,
    pickerPresentation: 'desktop',
  },
};

export const DesktopOpenStep5: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 5,
    pickerPresentation: 'desktop',
  },
};

export const DesktopOpenStep10: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 10,
    pickerPresentation: 'desktop',
  },
};

export const DesktopOpenStep15: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 15,
    pickerPresentation: 'desktop',
  },
};

export const MobileOpen: Story = {
  args: {
    defaultOpen: true,
    minuteStep: 5,
    pickerPresentation: 'mobile',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
    layout: 'fullscreen',
  },
};

export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };

export const FieldComposition: Story = {
  render: (args) => (
    <Field className="max-w-sm">
      <Field.Label>Start time</Field.Label>
      <TimePicker {...args} />
      <Field.Description>Local wall-clock time.</Field.Description>
    </Field>
  ),
};

function ControlledStateFixture() {
  const [value, setValue] = useState(parseTime('09:15'));
  const [open, setOpen] = useState(true);
  const [commits, setCommits] = useState<string[]>([]);

  return (
    <div className="grid max-w-sm gap-3 p-6" data-commits={commits.join(',')}>
      <TimePicker
        aria-label="Controlled time"
        open={open}
        pickerPresentation="desktop"
        value={value}
        onChange={(nextValue) => {
          if (!nextValue) return;
          setValue(nextValue);
          setCommits((current) => [...current, nextValue.toString()]);
        }}
        onOpenChange={setOpen}
      />
      <button type="button" onClick={() => setValue(parseTime('14:30'))}>
        Set open external time
      </button>
      <button type="button" onClick={() => setValue(parseTime('16:45'))}>
        Set closed external time
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open controlled picker
      </button>
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

export const ControlledStateContract: Story = {
  render: () => <ControlledStateFixture />,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    canvas.getByRole('button', { name: 'Set open external time' }).click();
    const cancel = await findDocumentButton('Cancel');
    assert(cancel, 'The controlled picker should expose Cancel while open.');
    await userEvent.click(cancel);
    assert(
      canvasElement.querySelector('[data-commits]')?.getAttribute('data-commits') === '',
      'Cancel after an external update must not commit a stale draft.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Set closed external time' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Open controlled picker' }));
    const done = await findDocumentButton('Done');
    assert(done, 'The controlled picker should expose Done after reopening.');
    await userEvent.click(done);
    assert(
      canvasElement.querySelector('[data-commits]')?.getAttribute('data-commits') === '16:45:00',
      'Done must commit the latest externally controlled value, including a closed update.',
    );
  },
};

function UncontrolledStateFixture() {
  const [commits, setCommits] = useState<string[]>([]);
  return (
    <div className="max-w-sm p-6" data-commits={commits.join(',')}>
      <TimePicker
        aria-label="Uncontrolled time"
        defaultOpen
        defaultValue={parseTime('08:10')}
        pickerPresentation="desktop"
        onChange={(value) => setCommits((current) => [...current, value?.toString() ?? 'null'])}
      />
    </div>
  );
}

export const UncontrolledStateContract: Story = {
  render: () => <UncontrolledStateFixture />,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const done = await findDocumentButton('Done');
    assert(done, 'defaultOpen should open an uncontrolled picker.');
    await userEvent.click(done);
    assert(
      canvasElement.querySelector('[data-commits]')?.getAttribute('data-commits') === '08:10:00',
      'Done should commit the uncontrolled defaultValue.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Choose time' }));
    const cancel = await findDocumentButton('Cancel');
    assert(cancel, 'An uncontrolled picker should reopen through its trigger.');
    await userEvent.click(cancel);
    assert(
      canvasElement.querySelector('[data-commits]')?.getAttribute('data-commits') === '08:10:00',
      'Cancel must not add another uncontrolled commit.',
    );
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['TimePicker']}>
      <div className="grid w-80 gap-4">
        <TimePicker
          {...captureProps('default')}
          aria-label="Start time"
          defaultValue={parseTime('12:30')}
        />
        <TimePicker
          {...captureProps('disabled')}
          aria-label="Start time"
          defaultValue={parseTime('12:30')}
          disabled
        />
        <TimePicker
          {...captureProps('invalid')}
          aria-label="Start time"
          defaultValue={parseTime('12:30')}
          invalid
        />
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'TimePicker',
      title: 'TimePicker',
      description: 'Wall-clock time control with segmented input and clock trigger.',
      kind: 'component',
      order: 132,
    },
  },
};



