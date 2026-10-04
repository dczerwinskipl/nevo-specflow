import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { TextArea } from './TextArea';
import { Typography } from '../../foundations/Typography';

const meta = {
  title: 'Nevo UI/Forms/TextArea',
  component: TextArea,
  tags: ['autodocs'],
  args: { 'aria-label': 'Text area', placeholder: 'Write a note...' },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ControlledTextArea({ maxRows = 4 }: { maxRows?: number }) {
  const [value, setValue] = useState('');
  return (
    <div className="w-96" data-value={value}>
      <TextArea
        aria-label="Internal note"
        autoGrow
        maxRows={maxRows}
        minRows={2}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
    </div>
  );
}

function State({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Typography className="text-content-muted" variant="label-sm">
        {label}
      </Typography>
      {children}
    </div>
  );
}

function TextAreaMatrix() {
  return (
    <DesignCaptureProvider captureComponents={['TextArea']}>
      <div className="grid w-96 gap-4">
        <State label="Default">
          <TextArea aria-label="Default text area" placeholder="Write a note..." />
        </State>
        <State label="Focus">
          <TextArea aria-label="Focused text area" autoFocus defaultValue="Customer context" />
        </State>
        <State label="Disabled">
          <TextArea aria-label="Disabled text area" disabled defaultValue="Unavailable" />
        </State>
        <State label="Invalid">
          <TextArea
            aria-invalid="true"
            aria-label="Invalid text area"
            defaultValue="Needs more detail"
          />
        </State>
      </div>
    </DesignCaptureProvider>
  );
}

export const Playground: Story = {};

export const AutoGrow: Story = {
  render: () => <ControlledTextArea />,
};

export const MaxHeightReached: Story = {
  render: () => <ControlledTextArea maxRows={4} />,
  play: async ({ canvas, userEvent }) => {
    const textarea = canvas.getByRole('textbox', { name: 'Internal note' });
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Expected a textarea.');
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => Math.max(62, textarea.value.split('\n').length * 20 + 22),
    });

    await userEvent.type(textarea, 'One{enter}Two{enter}Three{enter}Four{enter}Five');
    const maximumHeight = textarea.style.height;
    assert(maximumHeight !== '', 'Auto-grow should set an explicit bounded height.');
    assert(
      textarea.style.overflowY === 'auto',
      'Overflow should become internally scrollable at maxRows.',
    );

    await userEvent.type(textarea, '{enter}Six{enter}Seven');
    assert(textarea.style.height === maximumHeight, 'Height should stop increasing after maxRows.');
    assert(
      textarea.style.overflowY === 'auto',
      'Overflow should remain scrollable beyond maxRows.',
    );
  },
};

export const Disabled: Story = {
  args: { defaultValue: 'Unavailable', disabled: true },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'Needs more detail' },
};

export const StateCapture: Story = {
  render: () => <TextAreaMatrix />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'TextArea',
      title: 'Text area',
      description: 'Native multiline input with bounded auto-grow and reusable subtle scrolling',
      kind: 'component',
      order: 16,
    },
  },
};
