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
  if (!condition) {
    throw new Error(message);
  }
}

export const InteractionContract: Story = {
  ...Destructive,
  tags: ['contract', '!autodocs'],
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

const footerViewports = {
  w320: { name: '320', styles: { width: '320px', height: '640px' }, type: 'mobile' },
  w390: { name: '390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  w640: { name: '640 (1280 at 200%)', styles: { width: '640px', height: '500px' }, type: 'tablet' },
  w1440: { name: '1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
} as const;

function FooterExample({ actions }: { actions: 2 | 3 }) {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button variant="secondary">Open</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Porzucić konfigurację?</AlertDialogTitle>
          <AlertDialogDescription>
            Wprowadzone ustawienia nowej specyfikacji zostaną utracone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Kontynuuj edycję</Button>
          </AlertDialogCancel>
          {actions === 3 ? <Button variant="destructive">Odrzuć zmiany</Button> : null}
          <AlertDialogAction asChild>
            <Button variant={actions === 3 ? 'primary' : 'destructive'}>
              {actions === 3 ? 'Zapisz i przejdź dalej' : 'Porzuć konfigurację'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

async function verifyFooter(width: number) {
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
  assert(dialog, 'The dialog renders open.');
  assert(
    window.innerWidth === width,
    `Expected a ${width}px viewport, got ${window.innerWidth}px.`,
  );
  const footer =
    dialog.querySelector<HTMLElement>('[data-design-slot="footer"]') ??
    (dialog.lastElementChild as HTMLElement);
  const buttons = [...footer.querySelectorAll<HTMLButtonElement>('button')];
  const footerRect = footer.getBoundingClientRect();
  const dialogRect = dialog.getBoundingClientRect();
  assert(
    dialogRect.left >= 0 && dialogRect.right <= window.innerWidth,
    'The dialog stays inside the viewport.',
  );
  assert(
    dialog.scrollWidth <= dialog.clientWidth,
    'The dialog content must not overflow horizontally.',
  );
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    assert(
      rect.left >= footerRect.left - 0.5 && rect.right <= footerRect.right + 0.5,
      `"${button.textContent}" must not be clipped.`,
    );
    assert(
      button.scrollWidth <= button.clientWidth,
      `"${button.textContent}" label must fit its button.`,
    );
  }

  const cancel = buttons[0]!;
  const action = buttons.at(-1)!;
  if (width < 640) {
    for (const button of buttons) {
      assert(
        Math.abs(button.getBoundingClientRect().width - footerRect.width) < 1,
        'Narrow footers stack full-width actions.',
      );
    }

    assert(
      action.getBoundingClientRect().top < cancel.getBoundingClientRect().top,
      'The primary/destructive action is stacked on top.',
    );
  } else {
    assert(
      Math.abs(action.getBoundingClientRect().right - footerRect.right) < 1,
      'Wide footers right-align the action.',
    );
    assert(
      cancel.getBoundingClientRect().left < action.getBoundingClientRect().left ||
        cancel.getBoundingClientRect().top < action.getBoundingClientRect().top,
      'Cancel precedes the action in reading order.',
    );
  }

  cancel.focus();
  assert(
    buttons.indexOf(document.activeElement as HTMLButtonElement) === 0,
    'Focus order starts at Cancel.',
  );
}

export const FooterTwoActions: Story = {
  render: () => <FooterExample actions={2} />,
  parameters: { viewport: { options: footerViewports } },
};
export const FooterThreeActions: Story = {
  render: () => <FooterExample actions={3} />,
  parameters: { viewport: { options: footerViewports } },
};
export const FooterTwoActions320Contract: Story = {
  ...FooterTwoActions,
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w320', isRotated: false } },
  play: async () => verifyFooter(320),
};
export const FooterThreeActions320Contract: Story = {
  ...FooterThreeActions,
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w320', isRotated: false } },
  play: async () => verifyFooter(320),
};
export const FooterTwoActions390Contract: Story = {
  ...FooterTwoActions,
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w390', isRotated: false } },
  play: async () => verifyFooter(390),
};
export const FooterThreeActions640Contract: Story = {
  ...FooterThreeActions,
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w640', isRotated: false } },
  play: async () => verifyFooter(640),
};
export const FooterThreeActions1440Contract: Story = {
  ...FooterThreeActions,
  tags: ['contract', '!autodocs'],
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async () => verifyFooter(1440),
};
