import type { Meta, StoryObj } from '@storybook/react-vite';

import { RuntimeUnavailableView } from './RuntimeUnavailableScreen';

const meta = {
  title: 'SpecFlow/Screens/Runtime Unavailable',
  component: RuntimeUnavailableView,
  parameters: { layout: 'fullscreen' },
  args: { onRetry: () => undefined },
} satisfies Meta<typeof RuntimeUnavailableView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Retrying: Story = {
  args: { retrying: true },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
