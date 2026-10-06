import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Checkbox } from './Checkbox';
import { RadioGroup, RadioGroupOption } from './RadioGroup';
import { Switch } from './Switch';

const meta = {
  title: 'Nevo UI/Forms/Design Capture',
  tags: ['capture', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CheckboxCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Checkbox']}>
      <div className="flex gap-6 p-8">
        <Checkbox
          aria-label="Default"
          data-design-canonical="true"
          data-design-source-id="default"
        />
        <Checkbox
          aria-label="Checked"
          checked
          data-design-canonical="true"
          data-design-source-id="checked"
        />
        <Checkbox
          aria-label="Indeterminate"
          data-design-canonical="true"
          data-design-source-id="indeterminate"
          indeterminate
        />
        <Checkbox
          aria-label="Disabled"
          data-design-canonical="true"
          data-design-source-id="disabled"
          disabled
        />
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Checkbox',
      title: 'Checkbox',
      description: 'Selection control states',
      kind: 'component',
      order: 122,
    },
  },
};

export const RadioGroupCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['RadioGroup']}>
      <div className="w-96 p-8">
        <RadioGroup
          data-design-canonical="true"
          data-design-source-id="default"
          defaultValue="priority"
        >
          <RadioGroupOption
            label="Standard"
            description="Use the default processing path."
            value="standard"
          />
          <RadioGroupOption
            label="Priority"
            description="Process this record ahead of the normal queue."
            value="priority"
          />
          <RadioGroupOption disabled label="Unavailable option" value="disabled" />
        </RadioGroup>
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'RadioGroup',
      title: 'Radio group',
      description: 'Canonical option-group composition',
      kind: 'component',
      order: 124,
    },
  },
};

export const SwitchCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Switch']}>
      <div className="flex gap-6 p-8">
        <Switch aria-label="Default" data-design-canonical="true" data-design-source-id="default" />
        <Switch
          aria-label="Checked"
          checked
          data-design-canonical="true"
          data-design-source-id="checked"
        />
        <Switch
          aria-label="Disabled"
          data-design-canonical="true"
          data-design-source-id="disabled"
          disabled
        />
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Switch',
      title: 'Switch',
      description: 'Binary control states',
      kind: 'component',
      order: 126,
    },
  },
};
