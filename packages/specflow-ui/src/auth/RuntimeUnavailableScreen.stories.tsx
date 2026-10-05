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
  play: ({ canvasElement }) => {
    const selector = canvasElement.querySelector<HTMLElement>(
      '[data-auth-layout="language-selector"]',
    );
    const surface = canvasElement.querySelector<HTMLElement>('[data-auth-layout="surface"]');
    const root = canvasElement.querySelector<HTMLElement>('[data-auth-layout="root"]');
    if (!selector || !surface || !root) {
      throw new Error('Standalone recovery layout regions must be present.');
    }

    if (selector.getBoundingClientRect().bottom > surface.getBoundingClientRect().top) {
      throw new Error('Locale selector must not overlap the Runtime recovery surface.');
    }
    if (root.scrollWidth > root.clientWidth + 1) {
      throw new Error('Runtime recovery must not introduce horizontal overflow on small screens.');
    }
  },
};
