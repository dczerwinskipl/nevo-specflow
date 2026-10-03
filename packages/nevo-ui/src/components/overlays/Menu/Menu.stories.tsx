import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Button } from '../../actions/Button';
import { Typography } from '../../foundations/Typography';
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from './Menu';

function MenuExample({
  canonical = false,
  longLabels = false,
}: {
  canonical?: boolean;
  longLabels?: boolean;
}) {
  const [selection, setSelection] = useState('No action selected');
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 bg-canvas p-8 text-content-primary">
      <Menu
        defaultOpen={canonical}
        modal={canonical ? false : undefined}
        open={canonical ? true : undefined}
      >
        <MenuTrigger asChild>
          <Button variant="secondary">Record actions</Button>
        </MenuTrigger>
        <MenuContent
          aria-label="Record actions"
          data-design-canonical={canonical ? 'true' : undefined}
          data-design-source-id={canonical ? 'canonical-open' : undefined}
          onCloseAutoFocus={canonical ? (event) => event.preventDefault() : undefined}
        >
          <MenuLabel>Customer</MenuLabel>
          <MenuGroup>
            <MenuItem
              leadingIcon="file"
              onSelect={() => setSelection('Opened customer')}
              shortcut="↵"
              title={longLabels ? 'Open customer profile and recent account activity' : undefined}
            >
              {longLabels ? 'Open customer profile and recent account activity' : 'Open customer'}
            </MenuItem>
            <MenuItem leadingIcon="branch" onSelect={() => setSelection('Moved customer')}>
              Move to workspace
            </MenuItem>
            <MenuItem disabled leadingIcon="archive">
              Archive unavailable
            </MenuItem>
          </MenuGroup>
          <MenuSeparator />
          <MenuItem
            leadingIcon="trash"
            onSelect={() => setSelection('Deleted customer')}
            tone="danger"
          >
            Delete customer
          </MenuItem>
        </MenuContent>
      </Menu>
      <Typography aria-live="polite" className="text-content-muted" variant="body-sm">
        {selection}
      </Typography>
    </div>
  );
}

function MenuItemMatrix() {
  return (
    <div className="flex min-h-96 items-center justify-center bg-canvas p-8">
      <Menu modal={false} open>
        <MenuTrigger asChild>
          <Button variant="secondary">States</Button>
        </MenuTrigger>
        <MenuContent
          aria-label="Menu item states"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {(['neutral', 'danger'] as const).flatMap((tone) => [
            <MenuItem
              data-design-source-id={`${tone}-default`}
              key={`${tone}-default`}
              leadingIcon={tone === 'danger' ? 'trash' : 'file'}
              shortcut="⌘K"
              tone={tone}
            >
              Default
            </MenuItem>,
            <MenuItem
              autoFocus
              data-design-source-id={`${tone}-highlighted`}
              key={`${tone}-highlighted`}
              leadingIcon={tone === 'danger' ? 'trash' : 'file'}
              shortcut="⌘K"
              tone={tone}
            >
              Highlighted
            </MenuItem>,
            <MenuItem
              data-design-source-id={`${tone}-disabled`}
              disabled
              key={`${tone}-disabled`}
              leadingIcon={tone === 'danger' ? 'trash' : 'file'}
              shortcut="⌘K"
              tone={tone}
            >
              Disabled
            </MenuItem>,
          ])}
        </MenuContent>
      </Menu>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Overlays/Menu',
  component: MenuExample,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MenuExample>;

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

export const Actions: Story = {};

export const LongLabels: Story = {
  args: { longLabels: true },
};

export const InteractionContract: Story = {
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Record actions' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const menu = await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"]'),
      'Menu should open from the keyboard.',
    );
    const openItem = menu.querySelector<HTMLElement>('[role="menuitem"]');
    assert(document.activeElement === openItem, 'Focus should enter the first enabled item.');

    await userEvent.keyboard('{ArrowDown}');
    assert(
      document.activeElement?.textContent?.includes('Move to workspace'),
      'ArrowDown should move to the next item.',
    );
    await userEvent.keyboard('{ArrowDown}');
    assert(
      document.activeElement?.textContent?.includes('Delete customer'),
      'Navigation should skip disabled items.',
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => document.querySelector('[role="menu"]') === null,
      'Escape should close the Menu.',
    );
    assert(document.activeElement === trigger, 'Closing should restore focus to the trigger.');
  },
};

export const ItemStateCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['MenuItem']}>
      <MenuItemMatrix />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'MenuItem',
      title: 'Menu item',
      description: 'Compact neutral and destructive actions across interaction states',
      kind: 'component',
      order: 32,
    },
  },
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Menu']}>
      <MenuExample canonical />
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'Menu',
      title: 'Menu',
      description: 'Floating action list composed from reusable menu primitives',
      kind: 'component',
      order: 34,
    },
  },
};
