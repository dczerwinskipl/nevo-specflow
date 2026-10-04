import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

function ControlledExample() {
  const [value, setValue] = useState('preview');

  return (
    <SegmentedControl
      aria-label="View mode"
      className="w-72"
      value={value}
      onValueChange={setValue}
    >
      <SegmentedControl.Item value="preview">Preview</SegmentedControl.Item>
      <SegmentedControl.Item value="code">Code</SegmentedControl.Item>
    </SegmentedControl>
  );
}

const meta = {
  title: 'Nevo UI/Forms/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  args: {
    defaultValue: 'date',
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SegmentedControl aria-label="Date and time" className="w-72" defaultValue="date">
      <SegmentedControl.Item value="date">Date</SegmentedControl.Item>
      <SegmentedControl.Item value="time">Time</SegmentedControl.Item>
    </SegmentedControl>
  ),
};

export const Controlled: Story = {
  render: () => <ControlledExample />,
};

export const ThreeItems: Story = {
  render: () => (
    <SegmentedControl aria-label="Density" className="w-96" defaultValue="comfortable">
      <SegmentedControl.Item value="compact">Compact</SegmentedControl.Item>
      <SegmentedControl.Item value="comfortable">Comfortable</SegmentedControl.Item>
      <SegmentedControl.Item value="spacious">Spacious</SegmentedControl.Item>
    </SegmentedControl>
  ),
};

export const DisabledItem: Story = {
  render: () => (
    <SegmentedControl aria-label="View mode" className="w-72" defaultValue="list">
      <SegmentedControl.Item value="list">List</SegmentedControl.Item>
      <SegmentedControl.Item disabled value="grid">
        Grid
      </SegmentedControl.Item>
    </SegmentedControl>
  ),
};
