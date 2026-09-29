import type { Meta, StoryObj } from '@storybook/react-vite';

import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { CrmExample } from './CrmExample';

const meta = {
  title: 'Examples/CRM',
  component: CrmExample,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CrmExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  render: () => <CrmExample />,
};

export const CustomerSelected: Story = {
  ...Desktop,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('row', { name: 'Edit Northstar Labs' }));
    await canvas.findByRole('heading', { name: 'Northstar Labs' });
    await canvas.findByRole('button', { name: 'Save changes' });
  },
};

export const Compact: Story = {
  render: () => <CrmExample width={960} />,
};

export const CompactCustomerSelected: Story = {
  ...Compact,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('row', { name: 'Edit Northstar Labs' }));
    await canvas.findByRole('heading', { name: 'Northstar Labs' });

    const workspace = canvasElement.querySelector<HTMLElement>(
      '[data-app-shell-region="workspace"]',
    );
    const layout = workspace?.querySelector<HTMLElement>('[data-layout="stacked"]');
    const secondary = layout?.querySelector<HTMLElement>('[data-header-covered]:not(.hidden)');
    if (!workspace || !layout || !secondary) {
      throw new Error('Compact CRM should expose a full-width stacked Secondary surface.');
    }

    if (
      Math.abs(secondary.getBoundingClientRect().width - workspace.getBoundingClientRect().width) >
      1
    ) {
      throw new Error('Compact CRM Secondary must occupy the full workspace width.');
    }
  },
};

export const Mobile: Story = {
  render: () => <CrmExample width={390} />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const FigmaCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['CrmExampleScreen']}>
      <CrmExample height={900} initialCustomerId="northstar" width={1400} />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'CrmExampleScreen',
      title: 'Nevo CRM — Customers',
      description: 'Complete desktop CRM workspace with customer details open',
      kind: 'screen',
      order: 110,
    },
  },
};
