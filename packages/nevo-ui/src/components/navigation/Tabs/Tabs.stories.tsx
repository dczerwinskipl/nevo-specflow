import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';
import { ControlledTabs, TabsExample } from './Tabs.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: { defaultValue: 'overview' },
  argTypes: {
    children: {
      control: false,
      description: 'Compose with Tabs.List, Tabs.Trigger and Tabs.Content.',
      table: { type: { summary: 'ReactNode' } },
    },
    defaultValue: {
      control: 'text',
      description: 'Initially active value for uncontrolled usage.',
      table: { type: { summary: 'string' } },
    },
    value: {
      control: false,
      description: 'Active value for controlled usage.',
      table: { type: { summary: 'string' } },
    },
    onValueChange: {
      control: false,
      description: 'Called when the active tab changes.',
      table: { type: { summary: '(value: string) => void' } },
    },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: ({ defaultValue }) => <TabsExample defaultValue={defaultValue} />,
};

export const Controlled: Story = {
  render: () => <ControlledTabs />,
};

export const Disabled: Story = {
  render: () => <TabsExample disabledActivity />,
};

