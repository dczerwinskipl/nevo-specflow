import type { Meta, StoryObj } from '@storybook/react-vite';

import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
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
    await canvas.findByDisplayValue('Northstar Labs');

    await userEvent.click(canvas.getByRole('row', { name: 'Edit Atlas & Co.' }));
    await canvas.findByRole('heading', { name: 'Atlas & Co.' });
    await canvas.findByDisplayValue('Atlas & Co.');

    await userEvent.click(canvas.getByRole('row', { name: 'Edit Northstar Labs' }));
    await canvas.findByRole('heading', { name: 'Northstar Labs' });
    await canvas.findByDisplayValue('Northstar Labs');
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
    const layout = workspace?.querySelector<HTMLElement>('[data-layout="split"]');
    const primary = layout?.querySelector<HTMLElement>('[data-workspace-surface="primary"]');
    const secondary = layout?.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
    if (!workspace || !layout || !primary || !secondary) {
      throw new Error('Compact CRM should expose both workspace surfaces side by side.');
    }

    if (secondary.getBoundingClientRect().left < primary.getBoundingClientRect().right - 1) {
      throw new Error('Compact CRM workspace surfaces must not overlap.');
    }
  },
};

export const Mobile: Story = {
  render: () => <CrmExample width={390} />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const FigmaCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['CrmExampleScreen']}>
      <CrmExample height={900} initialCustomerId="northstar" width={1400} />
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
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
