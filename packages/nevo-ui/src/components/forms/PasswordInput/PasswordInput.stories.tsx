import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../Field';
import { PasswordInput } from './PasswordInput';

const meta = {
  title: 'Nevo UI/Forms/PasswordInput',
  component: PasswordInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'TextInput composition for passwords with an eye/eye-off visibility action. Visible text stays out of the control; localized show/hide strings are exposed through the labels contract.',
      },
    },
  },
  args: {
    labels: {
      hide: 'Hide',
      show: 'Show',
    },
  },
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field className="max-w-sm">
      <Field.Label>Password</Field.Label>
      <PasswordInput {...args} defaultValue="correct-horse-battery-staple" />
      <Field.Description>Use at least 12 characters.</Field.Description>
    </Field>
  ),
};

export const Revealed: Story = {
  render: (args) => (
    <Field className="max-w-sm">
      <Field.Label>Password</Field.Label>
      <PasswordInput {...args} defaultValue="correct-horse-battery-staple" />
    </Field>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show' }));
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true },
  render: (args) => (
    <Field className="max-w-sm" invalid>
      <Field.Label>Password</Field.Label>
      <PasswordInput {...args} defaultValue="short" />
      <Field.Error>Password does not meet the current policy.</Field.Error>
    </Field>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Field className="max-w-sm" disabled>
      <Field.Label>Password</Field.Label>
      <PasswordInput {...args} defaultValue="password" />
    </Field>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['PasswordInput']}>
      <div className="grid w-80 gap-4">
        <PasswordInput
          aria-label="Password"
          labels={{ hide: 'Hide', show: 'Show' }}
          defaultValue="password"
        />
        <PasswordInput
          aria-label="Password"
          labels={{ hide: 'Hide', show: 'Show' }}
          defaultValue="password"
          disabled
        />
        <Field invalid>
          <PasswordInput
            aria-invalid
            aria-label="Password"
            labels={{ hide: 'Hide', show: 'Show' }}
            defaultValue="password"
          />
        </Field>
      </div>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'PasswordInput',
      title: 'PasswordInput',
      description:
        'Password input composed from the shared text-control surface with an eye/eye-off visibility action.',
      kind: 'component',
      order: 118,
    },
  },
};



