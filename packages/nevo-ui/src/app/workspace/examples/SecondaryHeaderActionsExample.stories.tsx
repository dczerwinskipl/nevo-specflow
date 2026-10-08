import { useState, useSyncExternalStore } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../../../components';
import {
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  WorkspaceHeaderIdentity,
  defineSecondaryStack,
  useSecondaryNavigation,
  type SecondaryData,
  type SecondaryScreenProps,
} from '../../index';
import { AppShell } from '../../shell/AppShell';

interface HeaderData {
  version: number;
  lastAction: string;
  recordAction: (action: string) => void;
}
interface EditorPages {
  details: Record<never, never>;
}
let nextMount = 0;

function createSource() {
  let snapshot = { version: 1, lastAction: 'None' };
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    recordAction: (action: string) => {
      snapshot = {
        version: action === 'Refresh' ? snapshot.version + 1 : snapshot.version,
        lastAction: action,
      };
      for (const listener of listeners) listener();
    },
  };
}
type Source = ReturnType<typeof createSource>;

function InspectorHeader({ data }: SecondaryScreenProps<HeaderData, EditorPages['details']>) {
  // This product header knows nothing about navigation actions or overflow.
  return <WorkspaceHeaderIdentity headingLevel={2} title={`Record revision ${data.version}`} />;
}

function InspectorContent({ data }: SecondaryScreenProps<HeaderData, EditorPages['details']>) {
  const [mount] = useState(() => ++nextMount);
  return (
    <div className="grid gap-4 p-5">
      <output data-header-test-version>{data.version}</output>
      <output data-header-test-action>{data.lastAction}</output>
      <output data-header-test-mount>{mount}</output>
      <div style={{ height: 900 }}>Long content to scroll beneath the mobile header.</div>
    </div>
  );
}

function createInspectorStack(source: Source) {
  function useInspectorData(): SecondaryData<HeaderData> {
    const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    return { status: 'ready', data: { ...snapshot, recordAction: source.recordAction } };
  }
  return defineSecondaryStack<Record<never, never>, HeaderData, EditorPages>({
    id: 'header-actions-contract',
    initial: 'details',
    useData: useInspectorData,
    screens: {
      details: {
        title: 'Editor',
        header: InspectorHeader,
        component: InspectorContent,
        actionLabels: { moreActions: 'Screen actions', menuScope: 'Editor' },
        actions: ({ data }) => [
          {
            id: 'save',
            label: 'Save',
            icon: 'save',
            primary: true,
            onPress: () => data.recordAction('Save'),
          },
          {
            id: 'refresh',
            label: 'Refresh',
            icon: 'refresh',
            onPress: () => data.recordAction('Refresh'),
          },
          {
            id: 'open-full',
            label: 'Open full view',
            icon: 'open-full',
            onPress: () => data.recordAction('Open full view'),
          },
        ],
      },
    },
  });
}

function HeaderActionsWorkspace() {
  const [source] = useState(createSource);
  const [stack] = useState(() => createInspectorStack(source));
  const navigation = useSecondaryNavigation();
  return (
    <AppWorkspace split="primary">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Primary records" />}>
        <div className="p-4">
          <Button onClick={() => void navigation.open(stack, {})}>Open editor</Button>
        </div>
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary header="Activity">Default Secondary</AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

function HeaderActionsFixture({ width }: { width: number }) {
  return (
    <div style={{ width, maxWidth: '100%', height: 700 }}>
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Global navigation</div>} style={{ height: 700, width: '100%' }}>
          <HeaderActionsWorkspace />
        </AppShell>
      </AppWorkspaceProvider>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Workspace/Secondary header actions',
  component: HeaderActionsFixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HeaderActionsFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function settleFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function findMenuItem(container: Document, label: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((element) =>
    element.textContent?.includes(label),
  );
}

export const DesktopCustomHeaderActions: Story = {
  args: { width: 1400 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open editor' }));
    assert(
      canvas.getByRole('heading', { name: 'Record revision 1' }),
      'Custom header should render',
    );
    const mount = canvasElement.querySelector('[data-header-test-mount]')?.textContent;
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    assert(
      canvasElement.querySelector('[data-header-test-action]')?.textContent === 'Save',
      'Desktop primary action must execute',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Screen actions' }));
    const refresh = findMenuItem(canvasElement.ownerDocument, 'Refresh');
    assert(refresh, 'Refresh should be in desktop overflow');
    await userEvent.click(refresh);
    assert(
      canvasElement.querySelector('[data-header-test-version]')?.textContent === '2',
      'Desktop refresh should resolve current data',
    );
    assert(
      canvasElement.querySelector('[data-header-test-mount]')?.textContent === mount,
      'Header action refresh must not remount content',
    );
  },
};

export const MobileCollapsedCustomHeaderActions: Story = {
  args: { width: 390 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open editor' }));
    assert(canvas.getByRole('button', { name: 'Back' }), 'System Back must remain independent');
    const viewport = canvasElement.querySelector<HTMLElement>(
      '[data-workspace-surface="secondary"] .mobile-workspace-scroll',
    );
    assert(viewport, 'Secondary must expose a mobile scroll viewport');
    const mount = canvasElement.querySelector('[data-header-test-mount]')?.textContent;
    viewport.scrollTop = 150;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await settleFrame();
    await settleFrame();
    assert(
      canvasElement.querySelector('[data-header-covered="true"]'),
      'Scrolling should collapse the mobile header',
    );
    const trigger = canvasElement.querySelector<HTMLButtonElement>(
      '.mobile-floating-navigation:not([aria-hidden="true"]) button[aria-label="Screen actions"]',
    );
    assert(trigger, 'Collapsed custom header must expose the declared action menu');
    await userEvent.click(trigger);
    const doc = canvasElement.ownerDocument;
    for (const label of ['Save', 'Refresh', 'Open full view', 'Close secondary content']) {
      assert(findMenuItem(doc, label), `Missing compact action: ${label}`);
    }
    const save = findMenuItem(doc, 'Save');
    assert(save, 'Save action must be available');
    await userEvent.click(save);
    assert(
      canvasElement.querySelector('[data-header-test-action]')?.textContent === 'Save',
      'Compact Save must execute',
    );

    await userEvent.click(trigger);
    const refresh = findMenuItem(doc, 'Refresh');
    assert(refresh, 'Refresh action must be available');
    await userEvent.click(refresh);
    assert(
      canvasElement.querySelector('[data-header-test-version]')?.textContent === '2',
      'Compact Refresh must use current data',
    );
    assert(
      canvasElement.querySelector('[data-header-test-mount]')?.textContent === mount,
      'Refreshing must not remount the editor',
    );

    await userEvent.click(trigger);
    const openFull = findMenuItem(doc, 'Open full view');
    assert(openFull, 'Open full view must be available');
    await userEvent.click(openFull);
    assert(
      canvasElement.querySelector('[data-header-test-action]')?.textContent === 'Open full view',
      'Compact Open full view must execute',
    );
    assert(
      canvas.getByRole('button', { name: 'Back' }),
      'Back must remain available after custom actions',
    );
  },
};
