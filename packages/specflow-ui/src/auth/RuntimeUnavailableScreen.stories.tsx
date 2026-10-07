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
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="surface"]',
    );
    const desktopHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="desktop-header"]',
    );
    const root = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="root"]');
    if (!surface || !desktopHeader || !root || !surface.contains(desktopHeader)) {
      throw new Error('Desktop recovery header must stay inside the standalone surface.');
    }
    if (!desktopHeader.querySelector('[aria-label="Change language"]')) {
      throw new Error('Desktop recovery header must expose the product language action.');
    }

    const rootRect = root.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const centerDelta = Math.abs(
      surfaceRect.left + surfaceRect.width / 2 - (rootRect.left + rootRect.width / 2),
    );
    if (surfaceRect.width > 449) {
      throw new Error(
        `Desktop recovery surface should remain compact; received ${surfaceRect.width}px.`,
      );
    }
    if (centerDelta > 2) {
      throw new Error('Desktop recovery surface must remain horizontally centered.');
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
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: ({ canvasElement }) => {
    const mobileHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="mobile-header"]',
    );
    const mobileSelector = mobileHeader?.querySelector<HTMLElement>(
      '[aria-label="Change language"]',
    );
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="surface"]',
    );
    const root = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="root"]');
    if (!mobileHeader || !mobileSelector || !surface || !root) {
      throw new Error('Standalone recovery layout regions must be present.');
    }

    const rootRect = root.getBoundingClientRect();
    const headerRect = mobileHeader.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    if (Math.abs(headerRect.bottom - surfaceRect.top) > 1) {
      throw new Error('Runtime recovery workspace must begin directly below the mobile header.');
    }
    if (surfaceRect.bottom < rootRect.bottom - 1) {
      throw new Error('Runtime recovery workspace must fill the remaining viewport height.');
    }
    if (!mobileHeader.contains(mobileSelector)) {
      throw new Error('Mobile recovery language selection must belong to the auth header.');
    }
    if (root.scrollWidth > root.clientWidth + 1) {
      throw new Error('Runtime recovery must not introduce horizontal overflow on small screens.');
    }
    if (root.scrollHeight > root.clientHeight + 1) {
      throw new Error('Runtime recovery must remain constrained to the mobile viewport.');
    }
  },
};
