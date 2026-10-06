import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { TextInput } from './TextInput';
import { WorkspaceSurfacePreview } from '../../foundations/Environment';
import { Typography } from '../../foundations/Typography';

const meta = {
  title: 'Nevo UI/Forms/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) =>
      context.parameters.designCapture ? (
        <Story />
      ) : (
        <WorkspaceSurfacePreview className="flex items-center justify-center">
          <Story />
        </WorkspaceSurfacePreview>
      ),
  ],
  args: { 'aria-label': 'Text input', placeholder: 'Enter a value' },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function resolvedColorToken(variable: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

async function settleColorTransition() {
  for (let frame = 0; frame < 12; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function ControlledInput() {
  const [value, setValue] = useState('');
  return (
    <div className="w-80" data-value={value}>
      <TextInput
        aria-label="Company name"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Acme Inc."
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

function TextInputMatrix() {
  return (
    <DesignCaptureProvider captureComponents={['TextInput']}>
      <div className="grid w-80 gap-4">
        <State label="Default">
          <TextInput aria-label="Default input" placeholder="Search records..." />
        </State>
        <State label="Focus">
          <TextInput aria-label="Focused input" autoFocus defaultValue="Quarterly plan" />
        </State>
        <State label="Disabled">
          <TextInput aria-label="Disabled input" disabled defaultValue="Unavailable" />
        </State>
        <State label="Invalid">
          <TextInput aria-invalid="true" aria-label="Invalid input" defaultValue="invalid@" />
        </State>
      </div>
    </DesignCaptureProvider>
  );
}

export const Playground: Story = {};

export const Focused: Story = {
  args: { autoFocus: true, defaultValue: 'Quarterly plan' },
};

export const Disabled: Story = {
  args: { defaultValue: 'Unavailable', disabled: true },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'invalid@' },
};

export const InvalidFocused: Story = {
  args: { 'aria-invalid': true, autoFocus: true, defaultValue: 'invalid@' },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Text input' });
    assert(document.activeElement === input, 'Invalid input should retain native focus.');
    assert(
      input.getAttribute('aria-invalid') === 'true',
      'Invalid state should remain exposed while focused.',
    );
    await settleColorTransition();
    const style = getComputedStyle(input);
    assert(
      style.borderTopColor === 'rgb(239, 68, 68)',
      'Invalid border should remain visible while focused.',
    );
    assert(
      style.outlineStyle === 'solid',
      'Focused invalid input should retain a distinct focus outline.',
    );
    assert(
      style.outlineColor === resolvedColorToken('--color-focus-ring'),
      'Focus outline should use the focus token.',
    );
  },
};

export const Controlled: Story = {
  render: () => <ControlledInput />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Company name' });
    await userEvent.type(input, 'Nevo Labs');
    assert(
      input.getAttribute('value') === 'Nevo Labs',
      'Controlled TextInput should reflect changes.',
    );
    assert(
      input.closest('[data-value]')?.getAttribute('data-value') === 'Nevo Labs',
      'Consumer state should own the value.',
    );
  },
};

export const StateCapture: Story = {
  render: () => <TextInputMatrix />,
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'TextInput',
      title: 'Text input',
      description: 'Native input with composable focus, disabled and aria-invalid states',
      kind: 'component',
      order: 14,
    },
  },
};
