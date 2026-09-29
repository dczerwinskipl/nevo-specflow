import type { Meta, StoryObj } from '@storybook/react-vite';

import { WorkspaceHeader } from './WorkspaceHeader';

const meta = {
  title: 'Nevo UI/Layout/Workspace Header',
  component: WorkspaceHeader,
  decorators: [
    (Story) => (
      <div className="min-h-24 bg-canvas p-4 text-content-primary">
        <div className="@container flex h-14 max-w-4xl items-center rounded-composite border border-border-subtle bg-surface px-4">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { title: 'Customers', subtitle: '5 accounts', icon: 'users' },
  argTypes: { actions: { control: false }, status: { control: false } },
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoActions: Story = {};

export const OnePrimary: Story = {
  args: {
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        onPress: () => undefined,
      },
    ],
  },
};

export const PrimaryAndSecondaryActions: Story = {
  args: {
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        onPress: () => undefined,
      },
      {
        id: 'export',
        label: 'Export',
        icon: 'file',
        onPress: () => undefined,
      },
      {
        id: 'refresh',
        label: 'Refresh',
        icon: 'loader',
        onPress: () => undefined,
      },
    ],
  },
};

export const OverflowWithDanger: Story = {
  args: {
    title: 'Orbit Finance',
    subtitle: 'Enterprise account',
    icon: undefined,
    actions: [
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: 'file',
        onPress: () => undefined,
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: 'archive',
        onPress: () => undefined,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        tone: 'danger',
        onPress: () => undefined,
      },
    ],
  },
};

export const DisabledPrimary: Story = {
  args: {
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        disabled: true,
        onPress: () => undefined,
      },
    ],
  },
};
