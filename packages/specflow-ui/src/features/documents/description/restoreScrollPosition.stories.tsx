import { useLayoutEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { restoreScrollPosition } from './restoreScrollPosition';

/**
 * The workspace host can mount a page into a surface that is not laid out yet (hidden, animating).
 * The fixture keeps the scroller `display: none` until "Show surface" is activated, so every
 * earlier restore attempt cannot succeed and the position must be applied on the first layout.
 * The play function activates it programmatically: a pointer event would count as the reader
 * taking over the scroll position.
 */
function RestoreFixture({ target }: { readonly target: number }) {
  const page = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (!page.current) return;
    return restoreScrollPosition(
      page.current,
      () => target,
      () => setSettled(true),
    );
  }, [target]);
  return (
    <div>
      <button type="button" onClick={() => setVisible(true)}>
        Show surface
      </button>
      <output data-testid="settled">{String(settled)}</output>
      <div
        aria-label="Surface"
        data-testid="scroller"
        role="region"
        tabIndex={0}
        className="h-40 overflow-y-auto"
        style={{ display: visible ? 'block' : 'none' }}
      >
        <div ref={page} className="h-[600px]">
          Page
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Contracts/Restore Scroll Position',
  component: RestoreFixture,
  args: { target: 30 },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RestoreFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AppliesOnceTheSurfaceIsLaidOut: Story = {
  tags: ['contract'],
  play: async ({ canvas, canvasElement }) => {
    const scroller = canvasElement.querySelector<HTMLElement>('[data-testid="scroller"]')!;
    // Several frames pass without layout: the position cannot be applied yet.
    for (let frame = 0; frame < 4; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await expect(canvas.getByTestId('settled')).toHaveTextContent('false');
    canvas.getByRole('button', { name: 'Show surface', hidden: true }).click();
    await waitFor(async () => {
      await expect(scroller.scrollTop).toBe(30);
      await expect(canvas.getByTestId('settled')).toHaveTextContent('true');
    });
  },
};
