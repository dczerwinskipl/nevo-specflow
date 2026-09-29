import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Typography } from '../../components';
import { AppShell } from '../shell/AppShell';
import {
  AppContent,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceHeader,
  AppWorkspaceSlots,
} from './AppWorkspace';

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
  decorators: [
    (Story) => (
      <AppShell navigation={<Region label="Navigation" />}>
        <Story />
      </AppShell>
    ),
  ],
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
  tags: ['!dev', '!autodocs'],
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
      Math.abs(workspaceRect.left - navigationRect.right - 16) < 1,
      'Navigation and workspace should retain the 16px gap.',
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
  tags: ['!dev', '!autodocs'],
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
  tags: ['!dev', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
  play: async ({ canvasElement }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-medium-surface-shell]');
    assert(shell, 'The medium fixture should expose its application shell.');
    const { layout, workspace } = await waitFor(() => {
      const candidate = shell.querySelector<HTMLElement>('main[data-design-slot="workspace"]');
      const layout = candidate?.querySelector<HTMLElement>('[data-layout="stacked"]');
      return candidate && layout ? { workspace: candidate, layout } : null;
    }, 'The drawer-navigation fixture should use a stacked workspace.');
    const activeSurface = layout.querySelector<HTMLElement>('[data-header-covered]:not(.hidden)');
    assert(activeSurface, 'The stacked workspace should expose one active surface.');
    assert(
      Math.abs(
        activeSurface.getBoundingClientRect().width - workspace.getBoundingClientRect().width,
      ) < 1,
      'The active stacked surface should occupy the full workspace width.',
    );
    assert(
      workspace.dataset.appShellWorkspaceMaterialOwner === 'panel',
      'The medium stacked shell should delegate workspace material to its panels.',
    );
    assert(
      !workspace.classList.contains('workspace-surface-material') &&
        activeSurface.querySelector('.workspace-surface-material'),
      'The active stacked panel should be the only painted workspace material owner.',
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
  tags: ['!dev', '!autodocs'],
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
    const availableWidth = shellRect.width - navigationRect.width - 16;

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
      workspaceStyle.borderTopRightRadius !== '0px' && workspaceStyle.borderRightWidth !== '0px',
      'An inset workspace frame should restore its right edge and right-side rounding.',
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
