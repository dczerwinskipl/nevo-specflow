import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useInitialAppearance } from './useInitialAppearance';

function AppearanceFixture({
  cached = false,
  workspaceMotion = 'idle',
}: {
  cached?: boolean;
  workspaceMotion?: 'idle' | 'entering';
}) {
  const [loading, setLoading] = useState(!cached);
  const [updates, setUpdates] = useState(0);
  const region = useInitialAppearance('resource', loading, !loading);

  return (
    <div data-workspace-motion={workspaceMotion}>
      <button onClick={() => setLoading(false)}>Resolve</button>
      <button onClick={() => setUpdates(updates + 1)}>Update</button>
      <div ref={region} data-appearance-region>
        {loading ? 'Loading region' : 'Ready region'}
        <span>{updates}</span>
      </div>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Feedback/Initial appearance contract',
  component: AppearanceFixture,
  tags: ['contract'],
} satisfies Meta<typeof AppearanceFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AfterPlaceholder: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve' }));
    const region = canvasElement.querySelector<HTMLElement>('[data-appearance-region]')!;
    if (!region.classList.contains('initial-content-appearance')) {
      throw new Error('Committed placeholder must reveal content once');
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      getComputedStyle(region).animationName !== (reduced ? 'none' : 'initial-content-appearance')
    ) {
      throw new Error('Appearance must follow motion preference');
    }

    const animation = region.getAnimations()[0];
    await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
    if (
      region !== canvasElement.querySelector('[data-appearance-region]') ||
      (region.getAnimations()[0] !== undefined && region.getAnimations()[0] !== animation)
    ) {
      throw new Error('Ordinary updates must preserve the region and never restart its appearance');
    }
  },
};
export const DuringWorkspaceTransition: Story = {
  args: { workspaceMotion: 'entering' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve' }));
    if (canvasElement.querySelector('.initial-content-appearance')) {
      throw new Error('Workspace motion must suppress local appearance');
    }
  },
};
export const Cached: Story = {
  args: { cached: true },
  play: ({ canvasElement }) => {
    if (canvasElement.querySelector('.initial-content-appearance')) {
      throw new Error('Cached entry must be immediate');
    }
  },
};
