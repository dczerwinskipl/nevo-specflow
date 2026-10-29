import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { Button } from '@nevo/ui';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';

const longText = Array.from({ length: 400 }, (_, line) => `Linia ${line + 1} dokumentu`).join('\n');
const onViewStateChange = fn();

function Fixture() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex h-[400px] flex-col">
      <Button onClick={() => setOpen(false)}>Zamknij edytor</Button>
      {open && (
        <MarkdownSourceEditor
          value={longText}
          label="Treść notes.md"
          onChange={() => undefined}
          onSave={() => undefined}
          onViewStateChange={onViewStateChange}
        />
      )}
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Contracts/Markdown source editor',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Scrolling is stored as the reading anchor (a ref); it must not push state to the owner per event. */
export const ScrollingDoesNotUpdateOwnerState: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    onViewStateChange.mockClear();
    const scroller = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLElement>('.cm-scroller');
      if (!found) {
        throw new Error('editor not mounted');
      }

      return found;
    });
    for (let step = 1; step <= 30; step++) {
      scroller.scrollTop = step * 40;
      scroller.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    await expect(scroller.scrollTop).toBeGreaterThan(0);
    await expect(onViewStateChange).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Zamknij edytor' }));
    await waitFor(() => expect(onViewStateChange).toHaveBeenCalledTimes(1));
  },
};
