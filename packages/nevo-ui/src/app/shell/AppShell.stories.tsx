import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Badge, Button, ScrollArea, Typography } from '../../components';
import { AppShell } from './AppShell';
import { AppShellNavigationFixture, AppShellWorkspaceFixture } from './AppShell.storyFixtures';
import {
  AppContent,
  AppWorkspace,
  AppWorkspaceBody,
  WorkspaceHeader,
} from '../workspace/AppWorkspace';
import { AppWorkspaceProvider, useWorkspace } from '../workspace/WorkspaceContext';

const meta = {
  title: 'Nevo UI/Layout/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Responsive application frame. Wide layouts keep persistent navigation; compact layouts move navigation into a Drawer while AppWorkspace owns surface headers and mobile drill-in chrome.',
      },
    },
  },
  args: {
    navigation: <AppShellNavigationFixture />,
    children: <AppShellWorkspaceFixture />,
  },
  argTypes: {
    navigation: {
      control: false,
      description: 'Application-owned navigation content.',
      table: { type: { summary: 'ReactNode' } },
    },
    children: {
      control: false,
      description: 'Workspace content rendered inside the application shell.',
      table: { type: { summary: 'ReactNode' } },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['AppShell']}>
      <AppShell
        data-design-canonical="true"
        data-design-source-id="desktop"
        navigation={<AppShellNavigationFixture />}
        style={{ height: 900, width: 1400 }}
      >
        <AppShellWorkspaceFixture />
      </AppShell>
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'AppShell',
      title: 'Application shell',
      description: 'Canonical desktop navigation and workspace frame',
      kind: 'component',
      order: 20,
    },
  },
};

function ResponsiveFixture() {
  const [width, setWidth] = useState(480);
  return (
    <div className="grid gap-3 p-3">
      <div className="flex gap-2">
        <Button onClick={() => setWidth(480)}>Narrow shell</Button>
        <Button onClick={() => setWidth(1400)}>Wide shell</Button>
      </div>
      <AppShell
        data-responsive-shell="true"
        navigation={<AppShellNavigationFixture />}
        style={{ height: 600, width }}
      >
        <AppShellWorkspaceFixture />
      </AppShell>
    </div>
  );
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const ResponsiveContract: Story = {
  render: () => <ResponsiveFixture />,
  tags: ['contract', '!autodocs'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const shell = canvasElement.querySelector<HTMLElement>('[data-responsive-shell]');
    assert(shell, 'The responsive fixture should expose its shell.');
    await waitFor(
      () => canvas.queryByRole('button', { name: 'Open navigation' }),
      'Initial narrow layout should use drawer navigation.',
    );
    assert(
      shell.querySelector('aside') === null,
      'Narrow initialization must not mount persistent navigation.',
    );
    assert(
      canvas.queryByText('Details') === null,
      'Narrow workspace should not show default secondary content.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Wide shell' }));
    await waitFor(
      () => shell.querySelector('aside'),
      'Wide resize should mount persistent navigation.',
    );
    await waitFor(
      () => canvas.queryByText('Details'),
      'Wide workspace should switch to split layout.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Narrow shell' }));
    await waitFor(
      () => shell.querySelector('aside') === null && shell,
      'Narrow resize should remove persistent navigation again.',
    );
    assert(
      canvas.queryByText('Details') === null,
      'Narrow resize should return the workspace to one surface.',
    );
  },
};

function RecordList({ count = 28 }: { count?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: count }, (_, index) => (
        <div
          className="rounded-control border border-border-subtle bg-surface-subtle/70 p-3"
          key={index}
        >
          <Typography as="div" variant="label-sm">
            Customer conversation {index + 1}
          </Typography>
          <Typography as="div" className="text-content-muted" variant="body-sm">
            Updated recently · Workspace qualification in progress
          </Typography>
        </div>
      ))}
    </div>
  );
}

function StackLevel({ level }: { level: number }) {
  const workspace = useWorkspace();
  const nextLevel = level + 1;
  const nextTitle = nextLevel === 2 ? 'Billing' : 'Invoice #INV-2048';
  return (
    <AppContent className="w-content-narrow max-w-full">
      <AppWorkspaceBody>
        <div className="grid gap-4">
          <Typography className="text-content-secondary" variant="body-sm">
            This layer owns its header, actions and content as one local navigation entry.
          </Typography>
          {level < 3 ? (
            <Button
              onClick={() =>
                void workspace.pushSecondary(
                  {
                    header: (
                      <WorkspaceHeader
                        actions={
                          nextLevel === 2
                            ? [
                                {
                                  id: 'download-invoice',
                                  label: 'Download invoice',
                                  icon: 'file',
                                  primary: true,
                                  onPress: () => undefined,
                                },
                                {
                                  id: 'retry-payment',
                                  label: 'Retry payment',
                                  icon: 'loader',
                                  onPress: () => undefined,
                                },
                              ]
                            : [
                                {
                                  id: 'download',
                                  label: 'Download',
                                  icon: 'file',
                                  onPress: () => undefined,
                                },
                              ]
                        }
                        subtitle={nextLevel === 2 ? 'Orbit Finance' : 'Billing'}
                        title={nextTitle}
                      />
                    ),
                    content: <StackLevel level={nextLevel} />,
                  },
                  { onClose: () => undefined },
                )
              }
            >
              Open {nextTitle}
            </Button>
          ) : null}
          <RecordList count={12} />
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function InteractiveWorkspace({ combined = false }: { combined?: boolean }) {
  const workspace = useWorkspace();
  const openCustomer = () =>
    void workspace.pushSecondary({
      header: (
        <WorkspaceHeader
          actions={[
            {
              id: 'duplicate-customer',
              label: 'Duplicate',
              icon: 'file',
              onPress: () => undefined,
            },
            {
              id: 'archive-customer',
              label: 'Archive',
              icon: 'archive',
              onPress: () => undefined,
            },
            {
              id: 'delete-customer',
              label: 'Delete',
              icon: 'trash',
              tone: 'danger',
              onPress: () => undefined,
            },
          ]}
          status={<Badge tone="success">Active</Badge>}
          subtitle="Enterprise account"
          title="Orbit Finance"
        />
      ),
      content: <StackLevel level={1} />,
    });

  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            actions={[
              {
                id: 'create-customer',
                label: 'New customer',
                icon: 'plus',
                primary: true,
                onPress: openCustomer,
              },
              {
                id: 'export-customers',
                label: 'Export',
                icon: 'file',
                onPress: () => undefined,
              },
              {
                id: 'refresh-customers',
                label: 'Refresh',
                icon: 'loader',
                onPress: () => undefined,
              },
            ]}
            icon="users"
            subtitle="5 accounts"
            title="Customers"
          />
        }
      >
        <AppContent className="w-content-wide max-w-full">
          <AppWorkspaceBody>
            <div className="grid gap-4">
              <Button onClick={openCustomer} size="sm" variant="secondary">
                Open Orbit Finance
              </Button>
              {combined ? (
                <ScrollArea aria-label="Customer stages" direction="horizontal">
                  <div className="flex w-max gap-2 pb-2">
                    {['Lead', 'Qualified', 'Proposal', 'Review', 'Won', 'Renewal'].map((stage) => (
                      <div
                        className="w-40 rounded-control border border-border-subtle bg-surface-subtle p-3"
                        key={stage}
                      >
                        <Typography variant="label-sm">{stage}</Typography>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : null}
              <RecordList />
            </div>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>

      <AppWorkspace.Secondary
        header={<WorkspaceHeader subtitle="Nothing selected" title="Customer summary" />}
      >
        <AppContent className="w-content-narrow max-w-full">
          <AppWorkspaceBody>
            <Typography className="text-content-muted" variant="body-sm">
              Default Secondary base layer
            </Typography>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

function ShellInteractionFixture({
  combined = false,
  width,
}: {
  combined?: boolean;
  width: number;
}) {
  return (
    <AppWorkspaceProvider>
      <AppShell
        navigation={<AppShellNavigationFixture />}
        style={{ height: 720, maxWidth: '100%', width }}
      >
        <InteractiveWorkspace combined={combined} />
      </AppShell>
    </AppWorkspaceProvider>
  );
}

export const MobileLongWorkspace: Story = {
  render: () => <ShellInteractionFixture width={390} />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const MobileHeaderExpanded: Story = {
  ...MobileLongWorkspace,
};

export const MobileHeaderCompact: Story = {
  ...MobileLongWorkspace,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const viewport = canvasElement.querySelector<HTMLElement>('.mobile-workspace-scroll');
    assert(viewport, 'The mobile header fixture should expose its scroll viewport.');
    assert(
      canvasElement.querySelector('[data-workspace-layer="primary"]'),
      'The fixture should begin on Primary.',
    );
    viewport.scrollTop = 120;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await waitFor(
      () => canvasElement.querySelector('[data-header-covered="true"]'),
      'Scrolling beyond the expanded header should activate compact controls.',
    );
    assert(
      canvasElement.querySelector('[data-workspace-layer^="runtime-"]') === null,
      'Compact presentation must not mutate workspace navigation history.',
    );
    assert(
      canvas.getByRole('button', { name: 'Open navigation' }),
      'Navigation must remain a direct compact control.',
    );

    const overflow = await waitFor(
      () =>
        canvasElement.querySelector<HTMLButtonElement>(
          '.mobile-floating-navigation:not([aria-hidden="true"]) button[aria-label="More actions"]',
        ),
      'The compact overflow control should become interactive.',
    );
    await userEvent.click(overflow);
    const menu = await waitFor(
      () =>
        Array.from(canvasElement.ownerDocument.querySelectorAll<HTMLElement>('[role="menu"]')).find(
          (candidate) => candidate.textContent?.includes('New customer'),
        ) ?? null,
      'The compact action menu should open.',
    );
    assert(
      menu.textContent?.includes('New customer') &&
        menu.textContent.includes('Export') &&
        menu.textContent.includes('Refresh'),
      'Compact presentation should move every page action into overflow.',
    );
    await userEvent.keyboard('{Escape}');
    assert(document.activeElement === overflow, 'Closing overflow should restore trigger focus.');
  },
};

export const MobileBackHeader: Story = {
  ...MobileLongWorkspace,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open Orbit Finance' }));
    await canvas.findByRole('heading', { name: 'Orbit Finance' });
    assert(
      canvas.getByRole('button', { name: 'Back' }),
      'The Secondary layer should keep Back outside page actions.',
    );
  },
};

export const SecondaryStackDesktop: Story = {
  render: () => <ShellInteractionFixture width={1280} />,
};

export const SecondaryStackMobile: Story = {
  render: () => <ShellInteractionFixture width={390} />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const CombinedMobileStress: Story = {
  render: () => <ShellInteractionFixture combined width={390} />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
