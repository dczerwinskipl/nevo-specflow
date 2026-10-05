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

export const Default: Story = {
  play: ({ canvasElement }) => {
    const surface = canvasElement.querySelector<HTMLElement>('[data-auth-layout="surface"]');
    const desktopSelector = canvasElement.querySelector<HTMLElement>(
      '[data-auth-layout="desktop-language-selector"]',
    );
    if (!surface || !desktopSelector || !surface.contains(desktopSelector)) {
      throw new Error('Desktop recovery language selection must stay inside the auth surface.');
    }
  },
};

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
    const mobileHeader = canvasElement.querySelector<HTMLElement>(
      '[data-auth-layout="mobile-header"]',
    );
    const mobileSelector = canvasElement.querySelector<HTMLElement>(
      '[data-auth-layout="mobile-language-selector"]',
    );
    const surface = canvasElement.querySelector<HTMLElement>('[data-auth-layout="surface"]');
    const root = canvasElement.querySelector<HTMLElement>('[data-auth-layout="root"]');
    if (!mobileHeader || !mobileSelector || !surface || !root) {
      throw new Error('Standalone recovery layout regions must be present.');
    }

    if (mobileHeader.getBoundingClientRect().bottom > surface.getBoundingClientRect().top) {
      throw new Error('Mobile auth header must not overlap the Runtime recovery surface.');
    }
    if (!mobileHeader.contains(mobileSelector)) {
      throw new Error('Mobile recovery language selection must belong to the auth header.');
    }
    if (root.scrollWidth > root.clientWidth + 1) {
      throw new Error('Runtime recovery must not introduce horizontal overflow on small screens.');
    }
  },
};
