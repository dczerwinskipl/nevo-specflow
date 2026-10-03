import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Button } from '../../actions/Button';
import { TextInput } from '../../forms/TextInput';
import { Typography } from '../../foundations/Typography';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './Popover';

function PopoverExample({ canonical = false }: { canonical?: boolean }) {
  return (
    <div className="flex min-h-64 items-center justify-center bg-canvas p-8 text-content-primary">
      <Popover defaultOpen={canonical} open={canonical ? true : undefined}>
        <PopoverTrigger asChild>
          <Button variant="secondary">Edit owner</Button>
        </PopoverTrigger>
        <PopoverContent
          aria-label="Edit record owner"
          className="w-72 p-3"
          data-design-canonical={canonical ? 'true' : undefined}
          data-design-source-id={canonical ? 'canonical-open' : undefined}
          onOpenAutoFocus={canonical ? (event) => event.preventDefault() : undefined}
        >
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Typography as="h2" className="m-0" variant="label-md">
                Record owner
              </Typography>
              <Typography as="p" className="m-0 text-content-muted" variant="body-sm">
                Assign the person responsible for this customer.
              </Typography>
            </div>
            <TextInput aria-label="Owner name" defaultValue="Maya Chen" />
            <div className="flex justify-end gap-2">
              <PopoverClose asChild>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </PopoverClose>
              <PopoverClose asChild>
                <Button size="sm">Save</Button>
              </PopoverClose>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Overlays/Popover',
  component: PopoverExample,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PopoverExample>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

export const FormContent: Story = {};

export const InteractionContract: Story = {
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Edit owner' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const popover = await waitFor(
      () => document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]'),
      'Popover should open from the keyboard.',
    );
    const input = popover.querySelector<HTMLInputElement>('input[aria-label="Owner name"]');
    assert(input !== null, 'Popover should expose its form content.');
    assert(document.activeElement === input, 'Focus should move to the first focusable control.');

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => document.querySelector('[data-radix-popper-content-wrapper]') === null,
      'Escape should close the Popover.',
    );
    assert(document.activeElement === trigger, 'Closing should restore focus to the trigger.');
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Popover']}>
      <PopoverExample canonical />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Popover',
      title: 'Popover',
      description: 'Anchored floating surface with an editable content slot',
      kind: 'component',
      order: 30,
    },
  },
};
