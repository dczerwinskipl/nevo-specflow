import type { Meta, StoryObj } from '@storybook/react-vite';

import { StoryLocalization } from '../i18n/StoryLocalization';
import { RuntimeUnavailableView } from './RuntimeUnavailableScreen';

const meta = {
  title: 'SpecFlow/Screens/Runtime Unavailable',
  component: RuntimeUnavailableView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StoryLocalization>
        <Story />
      </StoryLocalization>
    ),
  ],
  args: { onRetry: () => undefined },
} satisfies Meta<typeof RuntimeUnavailableView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Retrying: Story = {
  args: { retrying: true },
};

export const Polish: Story = {
  render: (args) => (
    <StoryLocalization locale="pl">
      <RuntimeUnavailableView {...args} />
    </StoryLocalization>
  ),
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
