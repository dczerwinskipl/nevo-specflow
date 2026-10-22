import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import { TextInput } from '../../forms/TextInput';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './Dialog';

/** Polls until the portal content exists (no storybook/test import in the design-system package). */
async function until<T>(read: () => T | null | undefined): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the dialog.');
}

const meta = {
  title: 'Nevo UI/Overlays/Dialog',
  component: Dialog,
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Update the customer record.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <TextInput aria-label="Customer name" defaultValue="Acme Industries" />
          <TextInput aria-label="Country" defaultValue="PL" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const CompactContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Open compact dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename customer</DialogTitle>
          <DialogDescription>Choose a new display name.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TextInput aria-label="New name" defaultValue="Acme Industries" />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  ...Default,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert(dialog, 'Keyboard activation should open the dialog portal.');
    assert(dialog.contains(document.activeElement), 'Open dialog should move focus inside.');
    await userEvent.keyboard('{Escape}');
    assert(document.querySelector('[role="dialog"]') === null, 'Escape should close the dialog.');
    assert(document.activeElement === trigger, 'Closing should restore trigger focus.');
  },
};

/** The IconButton hit area makes it `relative`; the close action must still sit in the corner. */
export const CloseActionIsPinnedToTheCorner: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pinned close</DialogTitle>
        </DialogHeader>
        <DialogBody>Body</DialogBody>
      </DialogContent>
    </Dialog>
  ),
  tags: ['contract', '!autodocs'],
  play: async () => {
    const dialog = await until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
    const close = dialog.querySelector<HTMLElement>('button[aria-label="Close dialog"]');
    assert(close, 'The close action should render.');
    assert(getComputedStyle(close).position === 'absolute', 'Close must be absolutely positioned.');
    const box = dialog.getBoundingClientRect();
    const rect = close.getBoundingClientRect();
    assert(box.right - rect.right < 24, 'Close should sit at the right edge.');
    assert(rect.top - box.top < 24, 'Close should sit at the top edge.');
  },
};
