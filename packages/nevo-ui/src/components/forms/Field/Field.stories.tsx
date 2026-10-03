import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from './Field';
import { Icon } from '../../foundations/Icon';
import { IconButton } from '../../actions/IconButton';
import { InputGroup } from '../InputGroup';
import { TextInput } from '../TextInput';
import { Typography } from '../../foundations/Typography';

const meta = {
  title: 'Nevo UI/Forms/Field',
  component: Field,
  tags: ['autodocs'],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function BasicField({ description = false }: { description?: boolean }) {
  return (
    <Field className="w-80">
      <Field.Label>Email</Field.Label>
      <TextInput placeholder="name@example.com" type="email" />
      {description ? <Field.Description>Used for account notifications.</Field.Description> : null}
    </Field>
  );
}

function CompleteField() {
  return (
    <Field className="w-96">
      <Field.Label>Search</Field.Label>
      <InputGroup>
        <InputGroup.Addon>
          <Icon name="search" size="sm" />
        </InputGroup.Addon>
        <TextInput placeholder="Search records..." type="search" />
        <InputGroup.Action>
          <IconButton aria-label="Clear search" icon="close" size="xs" />
        </InputGroup.Action>
      </InputGroup>
      <Field.Description>Search across the current collection.</Field.Description>
    </Field>
  );
}

function FieldMatrix() {
  return (
    <DesignCaptureProvider captureComponents={['Field']}>
      <div className="grid w-96 gap-6">
        <div className="grid gap-1.5">
          <Typography className="text-content-muted" variant="label-sm">
            Default
          </Typography>
          <Field>
            <Field.Label>Email</Field.Label>
            <TextInput defaultValue="person@example.com" type="email" />
            <Field.Description>Used for account notifications.</Field.Description>
          </Field>
        </div>
        <div className="grid gap-1.5">
          <Typography className="text-content-muted" variant="label-sm">
            Disabled
          </Typography>
          <Field disabled>
            <Field.Label>Email</Field.Label>
            <TextInput defaultValue="person@example.com" type="email" />
            <Field.Description>This field is currently unavailable.</Field.Description>
          </Field>
        </div>
        <div className="grid gap-1.5">
          <Typography className="text-content-muted" variant="label-sm">
            Invalid
          </Typography>
          <Field invalid>
            <Field.Label>Email</Field.Label>
            <TextInput defaultValue="invalid@" type="email" />
            <Field.Error>Enter a valid email address.</Field.Error>
          </Field>
        </div>
      </div>
    </DesignCaptureProvider>
  );
}

export const LabelAndInput: Story = {
  render: () => <BasicField />,
};

export const WithDescription: Story = {
  render: () => <BasicField description />,
};

export const WithError: Story = {
  render: () => (
    <Field className="w-80" invalid>
      <Field.Label>Email</Field.Label>
      <TextInput defaultValue="invalid@" type="email" />
      <Field.Error>Enter a valid email address.</Field.Error>
    </Field>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field className="w-80" disabled>
      <Field.Label>Email</Field.Label>
      <TextInput defaultValue="person@example.com" type="email" />
      <Field.Description>This field is currently unavailable.</Field.Description>
    </Field>
  ),
};

export const CompleteComposition: Story = {
  render: () => <CompleteField />,
  play: async ({ canvas }) => {
    const input = canvas.getByRole('searchbox', { name: 'Search' });
    const description = canvas.getByText('Search across the current collection.');
    assert(input.id !== '', 'Field should provide a stable control id.');
    assert(
      canvas.getByText('Search').getAttribute('for') === input.id,
      'Field label should target the control id.',
    );
    assert(
      input.getAttribute('aria-describedby')?.split(' ').includes(description.id),
      'Field description should be referenced by the control.',
    );
  },
};

export const StateCapture: Story = {
  render: () => <FieldMatrix />,
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Field',
      title: 'Field',
      description: 'Accessible label, control, description and error composition',
      kind: 'component',
      order: 20,
    },
  },
};
