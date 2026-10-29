import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Button } from '../../actions/Button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  type DrawerSide,
  type DrawerSize,
} from './Drawer';
import { Typography } from '../../foundations/Typography';

interface SheetRow {
  id: string;
  label: string;
}

function createSheetRows(count: number): SheetRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `section-${index + 1}`,
    label: `${index + 1}. Section ${index + 1} of the document`,
  }));
}

function DrawerExample({
  canonical = false,
  defaultOpen = false,
  longContent = false,
  side = 'right',
  sheetRowCount,
  size = 'default',
  ownHeader = false,
}: {
  canonical?: boolean;
  /** Renders the surface open on first paint (showcase and visual inspection). */
  defaultOpen?: boolean;
  longContent?: boolean;
  side?: DrawerSide;
  /** When set, the body is a table-of-contents list of touch rows instead of activity cards. */
  sheetRowCount?: number;
  size?: DrawerSize;
  /** Sheet without the built-in close action; the header carries its own close button. */
  ownHeader?: boolean;
}) {
  const [open, setOpen] = useState(canonical || defaultOpen);
  const sheetRows = sheetRowCount === undefined ? null : createSheetRows(sheetRowCount);

  return (
    <div className="min-h-screen bg-canvas p-6 text-content-primary">
      <Typography as="h1" className="mb-2" variant="title-md">
        Repository workspace
      </Typography>
      <Typography as="p" className="m-0 max-w-xl text-content-muted" variant="body-md">
        Open the repository activity drawer without leaving the current workspace.
      </Typography>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button className="mt-5" variant="secondary">
            View activity
          </Button>
        </DrawerTrigger>
        <DrawerContent
          {...(ownHeader ? { showClose: false as const } : { closeLabel: 'Close customer drawer' })}
          side={side}
          size={size}
          data-design-canonical={canonical ? 'true' : undefined}
          data-design-source-id={canonical ? 'canonical-open' : undefined}
          onOpenAutoFocus={canonical ? (event) => event.preventDefault() : undefined}
          style={canonical ? { animationDelay: '-220ms' } : undefined}
        >
          <DrawerHeader
            className={ownHeader ? 'flex items-center justify-between gap-3' : undefined}
          >
            <div>
              <DrawerTitle>{sheetRows ? 'Contents' : 'Repository activity'}</DrawerTitle>
              <DrawerDescription>
                {sheetRows
                  ? 'Jump to a section of this document.'
                  : 'Recent changes and automation events for the active branch.'}
              </DrawerDescription>
            </div>
            {ownHeader ? (
              <DrawerClose asChild>
                <Button size="sm" variant="secondary">
                  Done
                </Button>
              </DrawerClose>
            ) : null}
          </DrawerHeader>

          {sheetRows ? (
            <DrawerBody className="px-2 py-2">
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {sheetRows.map((row) => (
                  <li key={row.id}>
                    <DrawerClose asChild>
                      <Button
                        className="justify-start [&>span]:text-left"
                        style={{ minHeight: 'var(--spacing-target-touch)' }}
                        variant="ghost"
                        width="full"
                      >
                        {row.label}
                      </Button>
                    </DrawerClose>
                  </li>
                ))}
              </ul>
            </DrawerBody>
          ) : (
            <DrawerBody>
              <div className="grid gap-3">
                {[
                  ['Task 06 started', 'Claude opened the runtime Drawer implementation.'],
                  ['Review accepted', 'Dominik approved the capability materialization changes.'],
                  ['Branch synchronized', 'The experiment branch is aligned with its remote.'],
                ].map(([title, description]) => (
                  <div
                    className="rounded-lg border border-border-default bg-surface px-4 py-3"
                    key={title}
                  >
                    <Typography as="h2" className="m-0" variant="label-md">
                      {title}
                    </Typography>
                    <Typography as="p" className="mb-0 mt-1 text-content-muted" variant="body-sm">
                      {description}
                    </Typography>
                  </div>
                ))}
                {longContent
                  ? Array.from({ length: 40 }, (_, index) => (
                      <div
                        className="rounded-lg border border-border-default bg-surface px-4 py-3"
                        key={index}
                      >
                        <Typography as="p" className="m-0" variant="body-sm">
                          Earlier activity entry {index + 1}
                        </Typography>
                      </div>
                    ))
                  : null}
              </div>
            </DrawerBody>
          )}

          {sheetRows ? null : (
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="w-full sm:w-fit" variant="secondary">
                  Close
                </Button>
              </DrawerClose>
              <Button className="w-full sm:w-fit">Open repository</Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Overlays/Drawer',
  component: DrawerExample,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DrawerExample>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) {
      return result;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(message);
}

export const Interactive: Story = {};

const sheetViewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '800px' } },
  tablet768: { name: 'Tablet 768', styles: { width: '768px', height: '1000px' } },
  desktop1440: { name: 'Desktop 1440', styles: { width: '1440px', height: '900px' } },
} as const;

const sheetParameters = { viewport: { options: sheetViewports } } as const;

/** Bottom sheet on a phone: the contents list scrolls inside a sheet capped 3rem below the top edge. */
export const BottomSheetPhone: Story = {
  args: { defaultOpen: true, side: 'bottom', sheetRowCount: 24 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const BottomSheetPhoneShort: Story = {
  args: { defaultOpen: true, side: 'bottom', sheetRowCount: 4 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** From the medium breakpoint the sheet is a centred 30rem column. */
export const BottomSheetTablet: Story = {
  args: { defaultOpen: true, side: 'bottom', sheetRowCount: 24 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'tablet768', isRotated: false } },
};

export const BottomSheetDesktop: Story = {
  args: { defaultOpen: true, side: 'bottom', sheetRowCount: 8 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'desktop1440', isRotated: false } },
};

export const TopSheetPhone: Story = {
  args: { defaultOpen: true, side: 'top', sheetRowCount: 24 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const TopSheetDesktop: Story = {
  args: { defaultOpen: true, side: 'top', sheetRowCount: 5 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'desktop1440', isRotated: false } },
};

/** Compact sheet (65dvh) with a long list: more of the page stays visible. */
export const BottomSheetCompactPhone: Story = {
  args: { defaultOpen: true, side: 'bottom', size: 'compact', sheetRowCount: 24 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const BottomSheetCompactTablet: Story = {
  args: { defaultOpen: true, side: 'bottom', size: 'compact', sheetRowCount: 24 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'tablet768', isRotated: false } },
};

/** `showClose={false}`: the header does not reserve room for the close action and hosts its own. */
export const BottomSheetOwnHeader: Story = {
  args: { defaultOpen: true, side: 'bottom', ownHeader: true, sheetRowCount: 6 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

function isSettled(element: HTMLElement) {
  const { transform } = getComputedStyle(element);

  return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
}

export const SheetContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { side: 'bottom', sheetRowCount: 40 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'View activity' });
    await userEvent.click(trigger);
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'The sheet should open as a dialog.',
    );
    assert(dialog.dataset.side === 'bottom', 'The sheet is anchored to the bottom.');
    assert(dialog.getAttribute('aria-labelledby'), 'The sheet is named by its title.');
    await waitFor(() => isSettled(dialog), 'The slide-in animation settles.');
    const rect = dialog.getBoundingClientRect();
    assert(
      Math.abs(rect.bottom - window.innerHeight) < 1,
      'The sheet touches the bottom edge of the viewport.',
    );
    assert(Math.abs(rect.width - window.innerWidth) < 1, 'The sheet is full width on a phone.');
    assert(rect.top >= 47, 'The sheet leaves at least 3rem of the page visible above it.');
    assert(
      getComputedStyle(dialog).borderTopLeftRadius !== '0px',
      'The sheet has rounded top corners.',
    );
    const viewport = dialog.querySelector<HTMLElement>('.scroll-area-viewport');
    assert(viewport !== null, 'The sheet body is a DS ScrollArea.');
    assert(viewport.scrollHeight > viewport.clientHeight, 'Long content scrolls inside the sheet.');
    const firstRow = dialog.querySelector<HTMLButtonElement>('.scroll-area-content li button');
    assert(firstRow !== null, 'The contents list has actionable rows.');
    assert(firstRow.getBoundingClientRect().height >= 44, 'Sheet rows meet the 44px touch target.');
    const firstRowLabel = firstRow.querySelector('span');
    assert(firstRowLabel !== null, 'The row exposes its text label.');
    assert(getComputedStyle(firstRowLabel).textAlign === 'left', 'Row labels align left.');
    const close = dialog.querySelector<HTMLElement>('button[aria-label="Close customer drawer"]');
    assert(close !== null, 'The sheet exposes its named close action.');
    assert(close.getBoundingClientRect().top >= rect.top, 'The close action is inside the sheet.');

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => document.querySelector('[role="dialog"]') === null,
      'Escape closes the sheet.',
    );
    await waitFor(
      () => (document.activeElement === trigger ? trigger : null),
      'Closing restores focus to the trigger.',
    );
  },
};

export const SheetWideContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { side: 'bottom', sheetRowCount: 6 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'desktop1440', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View activity' }));
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'The sheet should open as a dialog.',
    );
    const rect = dialog.getBoundingClientRect();
    assert(
      Math.abs(rect.width - 480) < 1,
      'Wide viewports constrain the sheet to the 30rem width.',
    );
    assert(
      Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) < 1,
      'The sheet is centred horizontally.',
    );
    assert(rect.height < window.innerHeight / 2, 'A short sheet is content-sized, not stretched.');
  },
};

export const SheetSizeContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { side: 'bottom', size: 'compact', sheetRowCount: 40 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View activity' }));
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'The sheet should open as a dialog.',
    );
    const rect = dialog.getBoundingClientRect();
    assert(
      Math.abs(rect.height - window.innerHeight * 0.65) < 1,
      'A long compact sheet is capped at 65dvh.',
    );
    const viewport = dialog.querySelector<HTMLElement>('.scroll-area-viewport');
    assert(
      viewport !== null && viewport.scrollHeight > viewport.clientHeight,
      'Long content scrolls inside the compact sheet.',
    );
  },
};

export const OwnHeaderContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { side: 'bottom', ownHeader: true, sheetRowCount: 6 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View activity' }));
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'The sheet should open as a dialog.',
    );
    const header = dialog.querySelector<HTMLElement>('[data-design-slot="header"]');
    assert(header !== null, 'The sheet renders its header.');
    assert(getComputedStyle(header).paddingRight === '20px', 'The header reserves no close space.');
    assert(
      dialog.querySelector('button[aria-label="Close customer drawer"]') === null,
      'No built-in close action is rendered.',
    );
  },
};

export const TopSheetContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { side: 'top', sheetRowCount: 40 },
  parameters: sheetParameters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'View activity' }));
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'The sheet should open as a dialog.',
    );
    await waitFor(() => isSettled(dialog), 'The slide-in animation settles.');
    const rect = dialog.getBoundingClientRect();
    assert(dialog.dataset.side === 'top', 'The sheet is anchored to the top.');
    assert(Math.abs(rect.top) < 1, 'The sheet touches the top edge.');
    assert(
      window.innerHeight - rect.bottom >= 47,
      'The sheet leaves at least 3rem of the page visible below it.',
    );
    assert(
      getComputedStyle(dialog).borderBottomLeftRadius !== '0px',
      'The sheet has rounded bottom corners.',
    );
  },
};

export const InteractionContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'View activity' });

    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'Drawer should open as a dialog.',
    );
    assert(dialog.contains(document.activeElement), 'Focus should enter the open Drawer.');

    await userEvent.tab();
    assert(dialog.contains(document.activeElement), 'Tab should remain inside the Drawer.');
    await userEvent.tab({ shift: true });
    assert(dialog.contains(document.activeElement), 'Shift+Tab should remain inside the Drawer.');

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => document.querySelector('[role="dialog"]') === null,
      'Escape should close the Drawer.',
    );
    await waitFor(
      () => (document.activeElement === trigger ? trigger : null),
      'Escape should restore focus to the trigger.',
    );

    await userEvent.keyboard('{Enter}');
    const closeAction = await waitFor(
      () => document.querySelector<HTMLButtonElement>('button[aria-label="Close customer drawer"]'),
      'The Drawer should expose its named close action.',
    );
    closeAction.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(
      () => document.querySelector('[role="dialog"]') === null,
      'The close action should close the Drawer from the keyboard.',
    );
    await waitFor(
      () => (document.activeElement === trigger ? trigger : null),
      'Closing should restore focus to the trigger.',
    );
  },
};

export const LongBodyContract: Story = {
  tags: ['contract', '!autodocs'],
  args: { longContent: true },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'View activity' });
    await userEvent.click(trigger);
    const dialog = await waitFor(
      () => document.querySelector<HTMLElement>('[role="dialog"]'),
      'Drawer should open as a dialog.',
    );
    const viewport = dialog.querySelector<HTMLElement>('.scroll-area-viewport');
    assert(viewport !== null, 'The Drawer body is a DS ScrollArea, not a native scroller.');
    assert(
      getComputedStyle(viewport).scrollbarWidth === 'thin',
      'The scrollbar is the DS thin one.',
    );
    assert(viewport.scrollHeight > viewport.clientHeight, 'Long content scrolls inside the body.');
    const footer = dialog.querySelector<HTMLElement>('[data-design-slot="footer"]');
    assert(footer !== null, 'The footer stays rendered below the body.');
    assert(
      footer.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
      'The footer remains visible while the body scrolls.',
    );
    const root = viewport.parentElement!;
    await waitFor(
      () => root.dataset.edgeBottom === 'true',
      'A bottom edge indicator shows more content.',
    );
    viewport.scrollTop = viewport.scrollHeight;
    await waitFor(
      () => root.dataset.edgeBottom === 'false',
      'The bottom indicator clears at the end.',
    );

    // Focus trap and initial focus stay inside the dialog; the scroll region is one Tab stop.
    assert(dialog.contains(document.activeElement), 'Focus is inside the Drawer.');
    for (let step = 0; step < 6; step += 1) {
      await userEvent.tab();
      assert(dialog.contains(document.activeElement), 'Tab never leaves the Drawer.');
    }

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => (document.activeElement === trigger ? trigger : null),
      'Closing restores focus to the trigger.',
    );
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Drawer', 'IconButton']}>
      <DrawerExample canonical />
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Drawer',
      title: 'Drawer',
      description: 'Static open-state side panel with editable content and reusable actions',
      kind: 'component',
      // Keep the portal-based capture after the existing screen captures so
      // its full-viewport host does not influence their measured coordinates.
      order: 110,
    },
  },
};
