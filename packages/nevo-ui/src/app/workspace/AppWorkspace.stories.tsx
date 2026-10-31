import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Button, Typography } from '../../components';
import { AppShell } from '../shell/AppShell';
import {
  AppContent,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceHeader,
  AppWorkspaceSlots,
} from './AppWorkspace';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';
import { defineSecondaryStack } from './SecondaryStack';

function Region({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-4">
      <Typography className="text-content-muted" variant="label-sm">
        {label}
      </Typography>
    </div>
  );
}

function ContentRegion({ label, rows = 0 }: { label: string; rows?: number }) {
  return (
    <AppContent>
      <AppWorkspaceHeader>
        <Typography className="text-content-primary" variant="title-sm">
          {label}
        </Typography>
      </AppWorkspaceHeader>
      <AppWorkspaceBody data-workspace-scroll-region={label}>
        <div className="grid gap-2">
          {Array.from({ length: Math.max(rows, 1) }, (_, index) => (
            <div
              className="rounded-control border border-border-subtle bg-surface-subtle p-3"
              key={`${label}-${index}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Typography className="text-content-secondary" variant="body-sm">
                  {rows === 0 ? 'Application-owned content' : `Customer record ${index + 1}`}
                </Typography>
                {rows > 0 ? (
                  <Button size="sm" variant="ghost">
                    Open
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

const meta = {
  title: 'Nevo UI/Layout/Workspace',
  component: AppWorkspaceSlots,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <AppShell navigation={<Region label="Navigation" />}>
      <AppWorkspaceSlots {...args} />
    </AppShell>
  ),
  args: {
    primary: { content: <Region label="Primary workspace" /> },
    secondary: { content: <Region label="Secondary workspace" /> },
    split: 'balanced',
  },
  argTypes: {
    primary: {
      control: false,
      description: 'Required primary workspace region.',
    },
    secondary: {
      control: false,
      description: 'Optional secondary workspace region.',
    },
    split: {
      control: 'inline-radio',
      description: 'Relative emphasis when both workspace regions are present.',
      options: ['primary', 'balanced', 'secondary'],
    },
  },
} satisfies Meta<typeof AppWorkspaceSlots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Balanced: Story = {};

export const PrimaryEmphasis: Story = {
  args: { split: 'primary' },
};

export const SecondaryEmphasis: Story = {
  args: { split: 'secondary' },
};

export const SinglePanel: Story = {
  args: { secondary: undefined },
};

function WorkspaceCaptureFixture() {
  const layouts = ['primary', 'balanced', 'secondary', 'single'] as const;

  return (
    <DesignCaptureProvider captureComponents={['AppWorkspaceSlots']}>
      <div className="grid gap-8">
        {layouts.map((layout) => (
          <AppShell
            key={layout}
            navigation={<Region label="Navigation" />}
            style={{ height: 900, width: 1400 }}
          >
            <AppWorkspaceSlots
              primary={{ content: <Region label={`${layout} primary workspace`} /> }}
              secondary={
                layout === 'single'
                  ? undefined
                  : { content: <Region label={`${layout} secondary workspace`} /> }
              }
              split={layout === 'single' ? 'primary' : layout}
            />
          </AppShell>
        ))}
      </div>
    </DesignCaptureProvider>
  );
}

export const CanonicalCapture: Story = {
  render: () => <WorkspaceCaptureFixture />,
  tags: ['capture', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
    controls: { disable: true },
    designCapture: {
      component: 'AppWorkspaceSlots',
      title: 'Application workspace',
      description: 'Canonical desktop split-layout variants',
      kind: 'component',
      order: 25,
    },
  },
};

export const ContentAnatomy: Story = {
  args: {
    primary: { content: <ContentRegion label="Customer records" rows={18} /> },
    secondary: { content: <ContentRegion label="Customer details" rows={12} /> },
    split: 'primary',
  },
  play: async ({ canvas }) => {
    const primaryBody = canvas
      .getByText('Customer record 18')
      .closest<HTMLElement>('[data-workspace-scroll-region]');
    assert(primaryBody, 'The primary workspace should expose its scrolling body.');
    assert(
      primaryBody.scrollHeight > primaryBody.clientHeight,
      'Long workspace content should scroll inside the body.',
    );

    const shell =
      primaryBody.closest<HTMLElement>('[data-layout-contract-shell]') ??
      primaryBody.closest<HTMLElement>('.h-screen');
    assert(shell, 'Workspace content should remain inside AppShell.');
    assert(
      shell.scrollHeight <= shell.clientHeight + 1,
      'Long content must not make the application shell scroll.',
    );
  },
};

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

export const GeometryContract: Story = {
  render: () => (
    <AppShell
      data-layout-contract-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1400 }}
    >
      <AppWorkspaceSlots
        primary={{ content: <Region label="Primary workspace" /> }}
        secondary={{ content: <Region label="Secondary workspace" /> }}
        split="primary"
      />
    </AppShell>
  ),
  tags: ['contract', '!autodocs'],
  parameters: {
    // Geometry-only fixture renders another complete application landmark tree.
    // Public AppShell stories retain the accessibility scan.
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-layout-contract-shell]');
    const navigation = shell?.querySelector<HTMLElement>('[data-design-slot="navigation"]');
    const workspace = shell?.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
    const primary = workspace?.querySelector<HTMLElement>('[data-design-slot="primary"]');
    const secondary = workspace?.querySelector<HTMLElement>('[data-design-slot="secondary"]');
    assert(
      shell && navigation && workspace && primary && secondary,
      'The layout contract fixture should expose every region.',
    );

    const shellRect = shell.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    const secondaryRect = secondary.getBoundingClientRect();

    assert(
      Math.abs(navigationRect.width - 260) < 1,
      'Desktop navigation should remain 260px wide.',
    );
    assert(
      Math.abs(workspaceRect.left - navigationRect.right - 8) < 1,
      'Navigation and workspace should retain the compact 8px gap.',
    );
    assert(
      Math.abs(workspaceRect.top - shellRect.top - 16) < 1,
      'Workspace should retain its 16px top inset.',
    );
    assert(
      Math.abs(primaryRect.width / workspaceRect.width - 0.75) < 0.01,
      'Primary emphasis should remain a 75% share.',
    );
    assert(
      Math.abs(secondaryRect.width / workspaceRect.width - 0.25) < 0.01,
      'Secondary emphasis should remain a 25% share.',
    );
    assert(
      workspace.scrollWidth <= workspace.clientWidth + 1,
      'The split should not overflow horizontally.',
    );
  },
};

export const MediumDominanceContract: Story = {
  render: () => (
    <AppShell
      data-medium-dominance-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1200 }}
    >
      <AppWorkspaceSlots
        primary={{ content: <Region label="Primary workspace" /> }}
        secondary={{ content: <Region label="Secondary workspace" /> }}
        split="primary"
      />
    </AppShell>
  ),
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-medium-dominance-shell]');
    const workspace = shell?.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
    const primary = workspace?.querySelector<HTMLElement>('[data-design-slot="primary"]');
    const secondary = workspace?.querySelector<HTMLElement>('[data-design-slot="secondary"]');
    assert(
      shell && workspace && primary && secondary,
      'The medium fixture should expose both workspace regions.',
    );

    const primaryWidth = primary.getBoundingClientRect().width;
    const secondaryWidth = secondary.getBoundingClientRect().width;
    assert(
      Math.abs(primaryWidth / secondaryWidth - 2) < 0.01,
      'Medium primary emphasis should use a 2:1 relationship.',
    );
  },
};

export const MediumSurfaceContract: Story = {
  render: () => (
    <AppShell
      data-medium-surface-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 960 }}
    >
      <AppWorkspace split="primary">
        <AppWorkspace.Primary>
          <Region label="Primary workspace" />
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary>
          <Region label="Secondary workspace" />
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  ),
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-medium-surface-shell]');
    assert(shell, 'The medium fixture should expose its application shell.');
    const { layout, workspace } = await waitFor(() => {
      const candidate = shell.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
      const layout = candidate?.querySelector<HTMLElement>('[data-layout="split"]');

      return candidate && layout ? { workspace: candidate, layout } : null;
    }, 'The drawer-navigation fixture should retain a split workspace at 960px.');
    const primary = layout.querySelector<HTMLElement>('[data-workspace-surface="primary"]');
    const secondary = layout.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
    assert(primary && secondary, 'The compact split should expose both workspace surfaces.');
    assert(
      secondary.getBoundingClientRect().left >= primary.getBoundingClientRect().right - 1,
      'The compact runtime surfaces should remain side by side without overlap.',
    );
    assert(
      workspace.dataset.appShellWorkspaceMaterialOwner === 'panel',
      'The compact shell should keep navigation in drawer mode and delegate workspace material.',
    );
    assert(
      !workspace.classList.contains('workspace-surface-material') &&
        layout.classList.contains('workspace-surface-material'),
      'The compact split root should own the workspace material.',
    );
  },
};

export const NarrowSurfaceContract: Story = {
  render: () => (
    <AppShell
      data-narrow-surface-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 839 }}
    >
      <AppWorkspace split="primary">
        <AppWorkspace.Primary>
          <Region label="Primary workspace" />
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary>
          <Region label="Secondary workspace" />
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  ),
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-narrow-surface-shell]');
    assert(shell, 'The narrow fixture should expose its application shell.');
    const { layout, workspace } = await waitFor(() => {
      const candidate = shell.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
      const layout = candidate?.querySelector<HTMLElement>('[data-layout="stacked"]');

      return candidate && layout ? { workspace: candidate, layout } : null;
    }, 'The workspace should stack below the 840px threshold.');
    const activeSurface = layout.querySelector<HTMLElement>('[data-header-covered]:not(.hidden)');
    assert(activeSurface, 'The stacked workspace should expose one active surface.');
    const floatingControl = activeSurface.querySelector<HTMLElement>(
      '.mobile-floating-navigation > button',
    );
    assert(floatingControl, 'The narrow surface should expose floating navigation.');
    const floatingStyle = getComputedStyle(floatingControl);
    assert(
      floatingStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        floatingStyle.backdropFilter !== 'none',
      'Floating controls should retain a translucent surface and backdrop blur above content.',
    );
    assert(
      Math.abs(
        activeSurface.getBoundingClientRect().width - workspace.getBoundingClientRect().width,
      ) < 1,
      'The active stacked surface should occupy the full workspace width.',
    );
    assert(
      !layout.textContent?.includes('Secondary workspace'),
      'A declarative default Secondary should not auto-stack on narrow layouts.',
    );
    assert(
      !workspace.classList.contains('workspace-surface-material') &&
        activeSurface.querySelector('.workspace-surface-material'),
      'The active stacked panel should own the narrow workspace material.',
    );
  },
};

const defaultDetailStack = defineSecondaryStack<
  Record<never, never>,
  string,
  { detail: Record<never, never> }
>({
  id: 'default-secondary-detail',
  initial: 'detail',
  useData: () => ({ status: 'ready', data: 'Runtime task detail' }),
  screens: {
    detail: {
      title: 'Task detail',
      component: ({ data }) => (
        <div className="w-[320px] p-4">
          <Typography variant="body-sm">{data}</Typography>
        </div>
      ),
    },
  },
});

function DismissibleDefaultSecondaryContent() {
  const navigation = useSecondaryNavigation();
  const [contextOpen, setContextOpen] = useState(true);

  return (
    <AppShell
      data-dismissible-secondary-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1400 }}
    >
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header="Conversation">
          <div className="grid w-[720px] gap-3 p-4">
            <Button onClick={() => setContextOpen(true)}>Open context</Button>
            <Typography variant="body-sm">Primary conversation</Typography>
          </div>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header="Context" open={contextOpen} onOpenChange={setContextOpen}>
          <div className="grid w-[320px] gap-3 p-4">
            <Typography variant="body-sm">Default context content</Typography>
            <Button
              variant="secondary"
              onClick={() => void navigation.open(defaultDetailStack, {})}
            >
              Open task detail
            </Button>
          </div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

function DismissibleDefaultSecondaryFixture() {
  return (
    <AppWorkspaceProvider>
      <DismissibleDefaultSecondaryContent />
    </AppWorkspaceProvider>
  );
}

export const DismissibleDefaultSecondaryContract: Story = {
  render: () => <DismissibleDefaultSecondaryFixture />,
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    assert(
      canvasElement.querySelectorAll('[data-app-shell-region="workspace"]').length === 1,
      'A complete AppShell fixture should not be nested inside another AppShell.',
    );
    await waitFor(
      () => canvas.queryByText('Default context content'),
      'The default Secondary should be visible on split entry.',
    );

    const openTaskDetail = canvas.getByRole('button', { name: 'Open task detail' });
    await userEvent.click(openTaskDetail);
    await waitFor(
      () => canvas.queryByText('Runtime task detail'),
      'A runtime detail should replace the default Secondary.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
    await waitFor(
      () => canvas.queryByText('Default context content'),
      'Back from the first runtime detail should reveal the default Secondary base.',
    );
    await waitFor(
      () => document.activeElement === canvas.getByRole('button', { name: 'Open task detail' }),
      'Back should restore focus to the control in the default Secondary that opened the detail.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    await waitFor(
      () => canvas.queryByText('Default context content') === null,
      'Closing the default Secondary should keep it dismissed.',
    );

    assert(
      canvasElement.querySelector('[data-workspace-surface="secondary"]') === null,
      'A dismissed default Secondary should leave a single Primary surface.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Open context' }));
    await waitFor(
      () => canvas.queryByText('Default context content'),
      'An explicit product action should be able to restore the default Secondary.',
    );
  },
};

export const RuntimeFitContract: Story = {
  render: () => (
    <AppShell
      data-runtime-fit-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1400 }}
    >
      <AppWorkspace split="balanced">
        <AppWorkspace.Primary>
          <div data-runtime-width="primary" style={{ width: 220 }}>
            <Region label="Small primary" />
          </div>
        </AppWorkspace.Primary>

        <AppWorkspace.Secondary>
          <div data-runtime-width="secondary" style={{ width: 360 }}>
            <Region label="Small secondary" />
          </div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  ),
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-runtime-fit-shell]');
    const navigation = shell?.querySelector<HTMLElement>('[data-design-slot="navigation"]');
    const workspace = shell?.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
    const primary = workspace?.querySelector<HTMLElement>('[data-runtime-width="primary"]');
    const secondary = workspace?.querySelector<HTMLElement>('[data-runtime-width="secondary"]');
    const layout = workspace?.querySelector<HTMLElement>('[data-workspace-fit="content"]');
    assert(
      shell && navigation && workspace && primary && secondary && layout,
      'Runtime sizing fixture should expose shell, navigation, workspace, layout and both surfaces.',
    );

    const shellRect = shell.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const workspaceStyle = getComputedStyle(workspace);
    const availableWidth = shellRect.width - navigationRect.width - 8;

    assert(
      Math.abs(primary.getBoundingClientRect().width - 220) < 1,
      'Small primary content should keep its authored width.',
    );
    assert(
      Math.abs(secondary.getBoundingClientRect().width - 360) < 1,
      'Small secondary content should keep its authored width.',
    );
    assert(
      workspaceRect.width < availableWidth,
      'Content-capped runtime panels should not force a full-width workspace frame.',
    );
    assert(
      Math.abs(navigationRect.left - shellRect.left - (shellRect.right - workspaceRect.right)) < 1,
      'An inset navigation and workspace group should remain centered in the shell.',
    );
    assert(
      workspaceStyle.borderTopRightRadius !== '0px' &&
        workspaceStyle.borderBottomRightRadius === '0px' &&
        workspaceStyle.borderRightWidth !== '0px',
      'An inset workspace frame should restore its right edge with only the top-right corner rounded.',
    );
    assert(
      Math.abs(
        workspaceRect.right - layoutRect.right - Number.parseFloat(workspaceStyle.borderRightWidth),
      ) < 1,
      'Workspace content should end at the inside edge of its restored right border.',
    );
    assert(
      workspace.scrollWidth <= workspace.clientWidth + 1,
      'Content-driven runtime surfaces must remain inside the fitted workspace frame.',
    );
  },
};

// --- W03: Secondary root-tab strip composition --------------------------------------------------
// Fixtures and interaction stories for workspace-dynamic-split.md §4.1's tab strip: absent with one
// open tab (pixel/DOM-identical to today's single Secondary), present with ItemTabs at two or more.

interface TabStripPages {
  summary: Record<never, never>;
  detail: Record<never, never>;
}

function tabStripItemStack(id: string, label: string) {
  return defineSecondaryStack<Record<never, never>, string, TabStripPages>({
    id,
    initial: 'summary',
    useData: () => ({ status: 'ready', data: label }),
    screens: {
      summary: {
        title: label,
        component: ({ data }) => {
          const stack = useSecondaryStack<TabStripPages>();

          return (
            <div className="grid gap-2 p-4" data-item-page={`${label}:summary`}>
              <Typography variant="body-sm">{`${data} summary`}</Typography>
              <Button onClick={() => void stack.navTo('detail')} size="sm" variant="secondary">
                Push detail
              </Button>
            </div>
          );
        },
      },
      detail: {
        title: `${label} detail`,
        component: ({ data }) => (
          <div className="p-4" data-item-page={`${label}:detail`}>
            <Typography variant="body-sm">{`${data} detail`}</Typography>
          </div>
        ),
      },
    },
  });
}

const tabStripItemA = tabStripItemStack('tab-strip-item-a', 'Item A');
const tabStripItemB = tabStripItemStack('tab-strip-item-b', 'Item B');

function TabStripPrimaryContent() {
  const navigation = useSecondaryNavigation();

  return (
    <div className="grid gap-2 p-4">
      <Typography variant="body-sm">Primary conversation</Typography>
      <Button onClick={() => void navigation.openTab(tabStripItemA, {})} size="sm">
        Open Item A
      </Button>
      <Button onClick={() => void navigation.openTab(tabStripItemB, {})} size="sm">
        Open Item B
      </Button>
    </div>
  );
}

function PinnedTabStripFixture() {
  const [contextOpen, setContextOpen] = useState(true);
  // `AppWorkspace.Secondary` only defines the pinned tab's static content (contract §4.1); a
  // declarative Secondary host still registers it explicitly, exactly as any other product using
  // this pattern would (see `useRegisterPinnedSecondaryTab`'s own doc comment).
  useRegisterPinnedSecondaryTab(contextOpen ? { title: 'Context' } : null);

  return (
    <AppShell
      data-tab-strip-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1400 }}
    >
      <AppWorkspace fit="available" split="secondary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
          <TabStripPrimaryContent />
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary
          header={<WorkspaceHeader title="Context" />}
          open={contextOpen}
          onOpenChange={setContextOpen}
        >
          <div className="p-4">
            <Typography variant="body-sm">Pinned context content</Typography>
          </div>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

function PinnedTabStripContract() {
  return (
    <AppWorkspaceProvider>
      <PinnedTabStripFixture />
    </AppWorkspaceProvider>
  );
}

function NoPinnedTabStripFixture() {
  return (
    <AppShell
      data-tab-strip-shell="true"
      navigation={<Region label="Navigation" />}
      style={{ height: 600, width: 1400 }}
    >
      <AppWorkspace fit="available" split="secondary">
        <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
          <TabStripPrimaryContent />
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppShell>
  );
}

function NoPinnedTabStripContract() {
  return (
    <AppWorkspaceProvider>
      <NoPinnedTabStripFixture />
    </AppWorkspaceProvider>
  );
}

function secondaryHeader(shell: HTMLElement) {
  return shell.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"] [data-workspace-header="true"]',
  );
}

export const RootTabStripAppearsContract: Story = {
  render: () => <PinnedTabStripContract />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-tab-strip-shell]');
    assert(shell, 'The fixture should expose its application shell.');

    assert(
      shell.querySelector('[role="tablist"]') === null,
      'With only the pinned tab open, no strip should render at all.',
    );
    assert(
      secondaryHeader(shell)?.textContent?.includes('Context'),
      "The pinned tab's own header should render exactly as today's single Secondary.",
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => shell.querySelector('[role="tablist"]'),
      'Opening a second root tab should render the tab strip.',
    );

    const tabs = Array.from(shell.querySelectorAll<HTMLElement>('[role="tab"]'));
    assert(
      tabs.length === 2 &&
        tabs
          .map((tab) => tab.textContent)
          .join('|')
          .includes('Context'),
      'The strip should list exactly the pinned tab and the newly opened one.',
    );
    assert(
      tabs
        .find((tab) => tab.getAttribute('aria-selected') === 'true')
        ?.textContent?.includes('Item A'),
      'The newly opened tab should become the active one.',
    );
    assert(
      canvas.queryByRole('button', { name: 'Close Context' }) === null,
      "The pinned tab must offer no close affordance (W01's closable: false).",
    );
    assert(
      canvas.queryByRole('button', { name: 'Close Item A' }) !== null,
      'A non-pinned tab must remain closable.',
    );
  },
};

export const RootTabStripClosesToBaselineContract: Story = {
  render: () => <PinnedTabStripContract />,
  tags: ['contract', '!autodocs'],
  parameters: {
    // Covered by RootTabStripAppearsContract while the strip is visible; this story's own
    // regression check is DOM/markup equality against the pre-strip baseline, asserted below.
    a11y: { test: 'off' },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-tab-strip-shell]');
    assert(shell, 'The fixture should expose its application shell.');
    const baseline = secondaryHeader(shell)?.outerHTML;
    assert(baseline, 'The single-tab baseline should render a Secondary header.');

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => shell.querySelector('[role="tablist"]'),
      'Opening a second root tab should render the tab strip.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Close Item A' }));
    await waitFor(
      () => shell.querySelector('[role="tablist"]') === null,
      'Closing back down to the pinned tab should remove the strip.',
    );
    assert(
      secondaryHeader(shell)?.outerHTML === baseline,
      "Closing back down to the pinned tab should restore today's single-Secondary header exactly, byte for byte.",
    );
  },
};

export const RootTabStripNoPinnedTabContract: Story = {
  render: () => <NoPinnedTabStripContract />,
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-tab-strip-shell]');
    assert(shell, 'The fixture should expose its application shell.');

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    assert(
      shell.querySelector('[role="tablist"]') === null,
      'A workspace with no pinned tab and one opened tab must still show no strip.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item B' }));
    await waitFor(
      () => shell.querySelectorAll('[role="tab"]').length === 2,
      'Two openTab()-opened tabs with no pinned tab should render the strip.',
    );
    assert(
      canvas.queryByRole('button', { name: 'Close Item A' }) !== null &&
        canvas.queryByRole('button', { name: 'Close Item B' }) !== null,
      'With no pinned tab, every tab is closable.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Close Item B' }));
    await waitFor(
      () => shell.querySelector('[role="tablist"]') === null,
      'Closing back down to the one remaining openTab() tab should remove the strip, with no pinned tab synthesized in its place.',
    );
    assert(
      canvas.queryByText('Item A summary'),
      'The remaining openTab() tab should stay active and visible.',
    );
  },
};

export const RootTabStripActivateRemountsContract: Story = {
  render: () => <PinnedTabStripContract />,
  tags: ['contract', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-tab-strip-shell]');
    assert(shell, 'The fixture should expose its application shell.');

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item A' }));
    await waitFor(
      () => canvas.queryByText('Item A summary'),
      'Item A should open to its summary page.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Push detail' }));
    await waitFor(
      () => shell.querySelector('[data-item-page="Item A:detail"]'),
      "Pushing inside Item A's own stack should navigate to its detail page.",
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Open Item B' }));
    await waitFor(
      () => canvas.queryByText('Item B summary'),
      'Opening a brand-new tab should activate it at its own initial page.',
    );
    assert(
      shell.querySelector('[data-item-page="Item A:detail"]') === null,
      "Item A's content is not mounted while backgrounded (this architecture renders only the active tab).",
    );

    const itemATab = canvas.getAllByRole('tab').find((tab) => tab.textContent?.includes('Item A'));
    assert(itemATab, 'Item A should still be listed in the strip while backgrounded.');
    await userEvent.click(itemATab);

    await waitFor(
      () => shell.querySelector('[data-item-page="Item A:detail"]'),
      'Activating Item A via the strip must remount it back onto its stored detail page, not reset to its initial summary page.',
    );
    assert(
      shell.querySelector('[data-item-page="Item A:summary"]') === null,
      'Item A must not have been reset to its initial page by the switch.',
    );
  },
};
