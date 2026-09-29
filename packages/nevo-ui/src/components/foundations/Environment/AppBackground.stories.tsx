import type { Meta, StoryObj } from '@storybook/react-vite';

import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { DEFAULT_BRAND_PRIMARY } from '../../../design-system/brandEnvironment';
import { Typography } from '../Typography';
import { AppBackground } from './Environment';

const meta = {
  title: 'Nevo UI/Foundations/AppBackground',
  component: AppBackground,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <AppBackground className="h-[34rem] min-h-[34rem] w-full" />,
};

export const BrandDerivation: Story = {
  name: 'Brand derivation',
  render: () => (
    <div className="grid min-h-screen gap-px bg-border-subtle p-px lg:grid-cols-2">
      {[
        { label: 'Default product', primary: DEFAULT_BRAND_PRIMARY },
        { label: 'Temporary violet', primary: '#7c3aed' },
      ].map(({ label, primary }) => (
        <AppBackground
          key={primary}
          brandPrimary={primary}
          className="flex min-h-[32rem] items-end p-6"
        >
          <Typography className="text-content-secondary" variant="label-md">
            {label} · {primary}
          </Typography>
        </AppBackground>
      ))}
    </div>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['AppBackground']}>
      <AppBackground
        className="h-[540px] w-[960px]"
        data-design-canonical="true"
        data-design-source-id="default"
      />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'AppBackground',
      title: 'App background',
      description: 'Near-black environment with deterministic brand-derived ambient light.',
      kind: 'component',
      order: 5,
    },
  },
};
