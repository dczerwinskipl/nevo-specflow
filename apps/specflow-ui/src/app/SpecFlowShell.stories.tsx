import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';

import { createSpecFlowRouter } from './router';

function RoutedApplication({ path = '/' }: { path?: '/' | '/ui-playground' }) {
  const router = useMemo(
    () => createSpecFlowRouter(createMemoryHistory({ initialEntries: [path] })),
    [path],
  );
  return <RouterProvider router={router} />;
}

const meta = {
  title: 'SpecFlow/Screens/Application Shell',
  component: RoutedApplication,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RoutedApplication>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};

export const Playground: Story = { args: { path: '/ui-playground' } };

export const Navigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('link', { name: 'UI Playground' }));
    await canvas.findByText(
      'A neutral product-owned surface for checking Nevo UI composition inside the real app.',
    );
  },
};

export const MobileNavigation: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Open navigation' }));
    const navigation = await waitFor(
      () =>
        canvasElement.ownerDocument.querySelector<HTMLElement>(
          'nav[aria-label="Product navigation"]',
        ),
      'Opening compact navigation should mount the product navigation.',
    );
    if (!navigation?.textContent?.includes('UI Playground')) {
      throw new Error('Opening compact navigation should expose the product links.');
    }
  },
};

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

export const FigmaCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['SpecFlowApplicationShell']}>
      <RoutedApplication />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'SpecFlowApplicationShell',
      title: 'Nevo SpecFlow — Application shell',
      description: 'Initial desktop application shell with Home selected',
      kind: 'screen',
      order: 200,
    },
  },
};
