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
    if (value) {
      return value;
    }

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
  if (!condition) {
    throw new Error(message);
  }
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

/**
 * A body taller than the viewport scrolls between the header and the footer: the footer actions stay
 * reachable on a short screen (for example 390 × 844 with a long option list).
 */
export const TallBodyScrollsBetweenHeaderAndFooter: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a document type</DialogTitle>
          <DialogDescription>The list is longer than the screen.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          {Array.from({ length: 40 }, (_, index) => (
            <label key={index} className="flex items-start gap-2 text-body-md">
              <input type="radio" name="tall-dialog-option" defaultChecked={index === 0} />
              Option {index + 1}: a line of body content that makes the dialog taller.
            </label>
          ))}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  tags: ['contract', '!autodocs'],
  play: async () => {
    const dialog = await until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
    const body = dialog.querySelector<HTMLElement>('[data-design-slot="body"]');
    assert(body, 'The dialog body should render.');
    const box = dialog.getBoundingClientRect();
    assert(box.bottom <= window.innerHeight, 'The dialog should fit the viewport.');
    assert(body.scrollHeight > body.clientHeight, 'The tall body should scroll inside the dialog.');
    // A quiet edge says there is more below; it goes once the end is reached.
    await until(() => body.getAttribute('data-more') === 'true');
    body.scrollTop = body.scrollHeight;
    await until(() => !body.hasAttribute('data-more'));
    const create = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Create',
    );
    assert(create, 'The footer action should render.');
    const action = create.getBoundingClientRect();
    assert(
      action.top >= box.top && action.bottom <= box.bottom,
      'The footer action should stay inside the visible dialog.',
    );
  },
};
