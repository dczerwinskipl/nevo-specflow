import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './AlertDialog';

const meta = {
  title: 'Nevo UI/Overlays/AlertDialog',
  component: AlertDialog,
  tags: ['autodocs'],
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destructive: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete customer?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The customer and its related data will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive">Delete</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  ...Destructive,
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Delete' });
    await userEvent.click(trigger);
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
    assert(dialog, 'The trigger should open an alert dialog portal.');
    assert(dialog.contains(document.activeElement), 'The alert dialog should contain focus.');
    await userEvent.keyboard('{Escape}');
    assert(
      document.querySelector('[role="alertdialog"]') === null,
      'Escape should cancel the alert dialog.',
    );
    assert(document.activeElement === trigger, 'Cancel should restore trigger focus.');
  },
};
