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
  tags: ['!dev', '!autodocs'],
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
