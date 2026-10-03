import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { SegmentedControl } from './SegmentedControl';

const meta = {
  title: 'Nevo UI/Forms/SegmentedControl',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['SegmentedControl', 'SegmentedControlItem']}>
      <SegmentedControl
        aria-label="Date and time"
        className="w-72"
        defaultValue="date"
        data-design-canonical="true"
        data-design-source-id="default"
      >
        <SegmentedControl.Item value="date">Date</SegmentedControl.Item>
        <SegmentedControl.Item value="time">Time</SegmentedControl.Item>
      </SegmentedControl>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'SegmentedControl',
      title: 'SegmentedControl',
      description: 'Compact single-select control for switching between related local views.',
      kind: 'component',
      order: 28,
    },
  },
};
