import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
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
  tags: ['contract', '!autodocs'],
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
  tags: ['capture', '!autodocs'],
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

function EdgeAnchoredExample() {
  return (
    <div className="flex min-h-64 justify-end bg-canvas p-2 text-content-primary">
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="secondary">Path</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Full document path" className="w-96 p-3">
          <Typography as="p" className="m-0 break-all" variant="body-sm">
            specifications/admission/documents/decisions/adr-001-keep-the-specification-history-readable-on-narrow-screens.md
          </Typography>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const EdgeAnchoredNarrow: Story = {
  render: () => <EdgeAnchoredExample />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const EdgeAnchoredNarrowContract: Story = {
  ...EdgeAnchoredNarrow,
  tags: ['contract', '!autodocs'],
  play: async () => {
    const content = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Full document path"]'),
      'The popover opens.',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rect = content.getBoundingClientRect();
    assert(window.innerWidth <= 360, 'The contract runs on a narrow viewport.');
    assert(
      rect.left >= 0 && rect.right <= window.innerWidth,
      `The popover is clamped inside the viewport (${rect.left}-${rect.right} of ${window.innerWidth}).`,
    );
    assert(
      content.scrollWidth <= content.clientWidth,
      'Long unbroken content wraps inside the clamped popover.',
    );
  },
};

/**
 * A software keyboard shrinks the visible viewport. The story stands in for it with a boundary of
 * constrained height (`collisionBoundary`), the same input the browser viewport gives the popover.
 */
function KeyboardConstrainedExample() {
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setBoundary}
      className="relative flex h-56 items-end justify-start overflow-hidden bg-canvas p-4 text-content-primary"
      data-testid="visible-viewport"
    >
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="secondary">Change record</Button>
        </PopoverTrigger>
        <PopoverContent
          aria-label="Change record"
          className="w-72 p-3"
          collisionBoundary={boundary}
          container={boundary}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <TextInput aria-label="Search records" />
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {Array.from({ length: 24 }, (_, index) => (
              <li key={index}>
                <Typography variant="body-sm">Record {index + 1}</Typography>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const VisibleViewportContract: Story = {
  render: () => <KeyboardConstrainedExample />,
  tags: ['contract', '!autodocs'],
  play: async () => {
    const content = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Change record"]'),
      'The popover opens.',
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const boundary = document.querySelector<HTMLElement>('[data-testid="visible-viewport"]')!;
    const area = boundary.getBoundingClientRect();
    const rect = content.getBoundingClientRect();
    assert(
      rect.top >= area.top - 0.5 && rect.bottom <= area.bottom + 0.5,
      `The popover stays inside the visible area (${rect.top}-${rect.bottom} of ${area.top}-${area.bottom}).`,
    );
    const input = content.querySelector<HTMLInputElement>('input')!.getBoundingClientRect();
    assert(input.top >= area.top && input.bottom <= area.bottom, 'The first control is visible.');
    const body = content.firstElementChild as HTMLElement;
    assert(
      body.scrollHeight > body.clientHeight,
      'Overflowing content scrolls inside the popover.',
    );
    body.scrollTop = body.scrollHeight;
    assert(body.scrollTop > 0, 'The popover body is scrollable.');
  },
};
