import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { WorkspaceHeader } from './WorkspaceHeader';

const meta = {
  title: 'Nevo UI/Layout/Workspace Header',
  component: WorkspaceHeader,
  decorators: [
    (Story) => (
      <div className="min-h-24 bg-canvas p-4 text-content-primary">
        <div className="@container flex h-14 max-w-4xl items-center rounded-composite border border-border-subtle bg-surface px-4">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: { title: 'Customers', subtitle: '5 accounts', icon: 'users' },
  argTypes: { actions: { control: false }, status: { control: false } },
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoActions: Story = {};

export const OnePrimary: Story = {
  args: {
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        onPress: () => undefined,
      },
    ],
  },
};

export const PrimaryAndSecondaryActions: Story = {
  args: {
    labels: { menuScope: 'Customers' },
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        onPress: () => undefined,
      },
      {
        id: 'export',
        label: 'Export',
        icon: 'file',
        onPress: () => undefined,
      },
      {
        id: 'refresh',
        label: 'Refresh',
        icon: 'loader',
        onPress: () => undefined,
      },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'More actions' });
    await userEvent.click(trigger);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu || menu.querySelector('button'))
      throw new Error('Overflow should contain only menu actions.');
    if (menu.getBoundingClientRect().width > 192)
      throw new Error('Short action menus must remain compact.');
    if ([...menu.querySelectorAll('[role="menuitem"]')].some((item) => !item.querySelector('svg')))
      throw new Error('Each menu action must expose its semantic icon.');
    const style = getComputedStyle(menu);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && style.animationName !== 'none')
      throw new Error('Reduced motion must disable menu reveal.');
    await userEvent.keyboard('{Escape}');
    if (document.querySelector('[role="menu"]')) throw new Error('Escape must dismiss actions.');
  },
};

export const OverflowWithDanger: Story = {
  args: {
    title: 'Orbit Finance',
    subtitle: 'Enterprise account',
    icon: undefined,
    actions: [
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: 'file',
        onPress: () => undefined,
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: 'archive',
        onPress: () => undefined,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'trash',
        tone: 'danger',
        onPress: () => undefined,
      },
    ],
  },
};

export const DisabledPrimary: Story = {
  args: {
    actions: [
      {
        id: 'create',
        label: 'New customer',
        icon: 'plus',
        primary: true,
        disabled: true,
        onPress: () => undefined,
      },
    ],
  },
};

const documentEditActions = [
  {
    id: 'preview',
    label: 'Show preview',
    icon: 'eye',
    presentation: 'icon',
    direct: 'wide',
    onPress: () => undefined,
  },
  { id: 'save', label: 'Save', primary: true, direct: 'always', onPress: () => undefined },
  { id: 'discard', label: 'Discard changes', onPress: () => undefined },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const labelsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('button')].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
  );

/** Document header: wide = [preview][Save][•••], narrow = [Save][•••: Show preview, Discard]. */
export const DirectActionBudget: Story = {
  tags: ['contract', '!autodocs'],
  args: { title: 'Document title', icon: undefined, subtitle: undefined },
  render: (args) => (
    <div className="grid gap-4">
      <div data-testid="wide" style={{ width: 640 }}>
        <WorkspaceHeader {...args} actions={documentEditActions} />
      </div>
      <div data-testid="narrow" style={{ width: 300 }}>
        <WorkspaceHeader {...args} actions={documentEditActions} />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const wide = canvas.getByTestId('wide');
    const narrow = canvas.getByTestId('narrow');
    assert(
      labelsOf(wide).join('|') === 'Show preview|Save|More actions',
      `wide: ${labelsOf(wide).join('|')}`,
    );
    assert(
      labelsOf(narrow).join('|') === 'Save|More actions',
      `narrow: ${labelsOf(narrow).join('|')}`,
    );
    assert(
      wide
        .querySelector('[data-workspace-header]')
        ?.getAttribute('data-workspace-header-density') === 'wide',
      'Wide width is measured as wide.',
    );
    assert(
      narrow
        .querySelector('[data-workspace-header]')
        ?.getAttribute('data-workspace-header-density') === 'narrow',
      'Narrow width is measured as narrow.',
    );
    const iconButton = wide.querySelector<HTMLElement>('button[aria-label="Show preview"]')!;
    assert(
      iconButton.getBoundingClientRect().width === 32,
      'The icon action is a 32px IconButton.',
    );
  },
};

function ResizableHeader() {
  const [width, setWidth] = useState(640);
  return (
    <div>
      <button data-testid="shrink" onClick={() => setWidth(300)} type="button">
        shrink
      </button>
      <div data-testid="frame" style={{ width }}>
        <WorkspaceHeader title="Document title" actions={documentEditActions} />
      </div>
    </div>
  );
}

/** Narrow is a measured width: resizing the container moves the action between direct and menu. */
export const DensityFollowsMeasuredWidth: Story = {
  tags: ['contract', '!autodocs'],
  render: () => <ResizableHeader />,
  play: async ({ canvas, userEvent }) => {
    const frame = canvas.getByTestId('frame');
    assert(labelsOf(frame).includes('Show preview'), 'Wide shows the preview action directly.');
    await userEvent.click(canvas.getByTestId('shrink'));
    for (let attempt = 0; attempt < 40 && labelsOf(frame).includes('Show preview'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert(!labelsOf(frame).includes('Show preview'), 'Narrow moves the preview into the menu.');
    await userEvent.click(frame.querySelector<HTMLElement>('button[aria-label="More actions"]')!);
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
      item.textContent?.trim(),
    );
    assert(
      items.join('|') === 'Show preview|Discard changes',
      `Menu keeps order and has no duplicate: ${items.join('|')}`,
    );
    await userEvent.keyboard('{Escape}');
  },
};

export const ViewStateSingleIconAction: Story = {
  tags: ['visual', '!autodocs'],
  args: {
    title: 'Document title',
    actions: [
      {
        id: 'edit',
        label: 'Edit document',
        icon: 'file',
        presentation: 'icon',
        direct: 'always',
        onPress: () => undefined,
      },
    ],
  },
};

/** The action mounts an input and focuses it once the menu has closed. */
function InlineEntry() {
  const [mounted, setMounted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <WorkspaceHeader
        actions={[
          {
            id: 'new',
            label: 'New file',
            direct: 'never',
            onMenuClosed: () => input.current?.focus(),
            onPress: () => setMounted(true),
          },
          { id: 'other', label: 'Other', onPress: () => undefined },
        ]}
        title="Documents"
      />
      {mounted ? <input aria-label="File name" ref={input} /> : null}
    </>
  );
}

export const MenuActionMayMoveFocusItself: Story = {
  render: () => <InlineEntry />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /More actions/ }));
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent?.trim() === 'New file',
    );
    if (!item) throw new Error('The New file action is in the menu.');
    await userEvent.click(item);
    const input = await canvas.findByRole('textbox', { name: 'File name' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (document.activeElement !== input) {
      throw new Error('The menu took focus back from the input the action focused.');
    }
  },
};
