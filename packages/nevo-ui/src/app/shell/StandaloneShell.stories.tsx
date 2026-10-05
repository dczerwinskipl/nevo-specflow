import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';

import { Button } from '../../components/actions/Button';
import { Typography } from '../../components/foundations/Typography';
import { StandaloneShell } from './StandaloneShell';

function HeaderFixture() {
  return (
    <>
      <Typography as="span" variant="label-md">
        Product
      </Typography>
      <Button size="sm" variant="ghost">
        Preferences
      </Button>
    </>
  );
}

function ContentFixture() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          Standalone task
        </Typography>
        <Typography className="text-content-secondary" variant="body-md">
          A compact application surface without primary navigation.
        </Typography>
      </div>
      <Button>Continue</Button>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Layout/StandaloneShell',
  component: StandaloneShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Standalone application frame for login, recovery, fatal-error and other navigation-free product surfaces.',
      },
    },
  },
  args: {
    mobileHeader: <HeaderFixture />,
    desktopHeader: <HeaderFixture />,
    children: <ContentFixture />,
  },
} satisfies Meta<typeof StandaloneShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const Desktop: Story = {
  play: ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('[data-standalone-shell-region="body"]');
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="surface"]',
    );
    const mobileHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="mobile-header"]',
    );
    const desktopHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="desktop-header"]',
    );
    assert(root && surface && mobileHeader && desktopHeader, 'Standalone shell regions must render.');

    const rootRect = root.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const centerDelta = Math.abs(
      surfaceRect.left + surfaceRect.width / 2 - (rootRect.left + rootRect.width / 2),
    );
    assert(surfaceRect.width <= 449, 'Desktop standalone surface must remain compact.');
    assert(centerDelta <= 2, 'Desktop standalone surface must remain horizontally centered.');
    assert(getComputedStyle(mobileHeader).display === 'none', 'Mobile header must hide on desktop.');
    assert(
      getComputedStyle(desktopHeader).display === 'flex',
      'Desktop header must render inside the compact surface.',
    );
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-design-component="StandaloneShell"]');
    const mobileHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="mobile-header"]',
    );
    const surface = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="surface"]',
    );
    const desktopHeader = canvasElement.querySelector<HTMLElement>(
      '[data-standalone-shell-region="desktop-header"]',
    );
    assert(shell && mobileHeader && surface && desktopHeader, 'Standalone shell regions must render.');

    const shellRect = shell.getBoundingClientRect();
    const headerRect = mobileHeader.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    assert(
      Math.abs(headerRect.bottom - surfaceRect.top) <= 1,
      'Mobile workspace sheet must begin directly below the single header.',
    );
    assert(
      surfaceRect.bottom >= shellRect.bottom - 1,
      'Mobile workspace sheet must fill the remaining shell height.',
    );
    assert(getComputedStyle(mobileHeader).display === 'flex', 'Mobile header must be visible.');
    assert(getComputedStyle(desktopHeader).display === 'none', 'Desktop header must hide on mobile.');
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['StandaloneShell']}>
      <StandaloneShell
        data-design-canonical="true"
        data-design-source-id="desktop"
        desktopHeader={<HeaderFixture />}
        mobileHeader={<HeaderFixture />}
      >
        <ContentFixture />
      </StandaloneShell>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'StandaloneShell',
      title: 'Standalone shell',
      description: 'Navigation-free application frame with compact desktop surface',
      kind: 'component',
      order: 22,
    },
  },
};
