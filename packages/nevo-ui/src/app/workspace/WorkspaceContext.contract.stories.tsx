import { useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from '../shell/AppShell';
import { AppWorkspace } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useSecondaryLeaveGuard,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';

type Pages = {
  first: Record<never, never>;
  second: Record<never, never>;
  guarded: Record<never, never>;
};

function FirstScreen() {
  const navigation = useSecondaryStack<Pages>();
  return (
    <div>
      <p>Stack level 1</p>
      <button type="button" onClick={() => void navigation.navTo('second')}>
        Push level 2
      </button>
    </div>
  );
}
function SecondScreen() {
  return <p>Stack level 2</p>;
}
function GuardedScreen() {
  const [allow, setAllow] = useState(false);
  useSecondaryLeaveGuard(useCallback(() => allow, [allow]));
  return (
    <div>
      <p>Protected editor</p>
      <button type="button" onClick={() => setAllow(true)}>
        Allow exit
      </button>
    </div>
  );
}

const demoStack = defineSecondaryStack<Record<never, never>, string, Pages>({
  id: 'workspace-contract',
  initial: 'first',
  useData: () => ({ status: 'ready', data: 'contract' }),
  screens: {
    first: { title: 'Layer one', component: FirstScreen },
    second: { title: 'Layer two', component: SecondScreen },
    guarded: { title: 'Protected editor', component: GuardedScreen },
  },
});
const guardedStack = defineSecondaryStack<
  Record<never, never>,
  string,
  { guarded: Record<never, never> }
>({
  id: 'guarded-contract',
  initial: 'guarded',
  useData: () => ({ status: 'ready', data: 'contract' }),
  screens: {
    guarded: { title: 'Protected editor', component: GuardedScreen },
  },
});

function ContractWorkspace() {
  const navigation = useSecondaryNavigation();
  return (
    <AppShell navigation={<div>Navigation</div>} style={{ height: 600, width: 1280 }}>
      <AppWorkspace split="primary">
        <AppWorkspace.Primary header="Primary">
          <div className="grid gap-3 p-5">
            <button type="button" onClick={() => void navigation.open(demoStack, {})}>
              Open first secondary
            </button>
            <button type="button" onClick={() => void navigation.open(guardedStack, {})}>
              Open guarded secondary
            </button>
          </div>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary header="Default">
          <p>Default secondary content</p>
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

const meta = {
  title: 'Nevo UI/Internal/Workspace/Navigation contracts',
  tags: ['contract', '!autodocs'],
  parameters: { a11y: { test: 'off' } },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function frame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export const PushPopAndFocus: Story = {
  render: () => (
    <AppWorkspaceProvider>
      <ContractWorkspace />
    </AppWorkspaceProvider>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open first secondary' }));
    assert(canvas.getByText('Stack level 1'), 'First page must appear');
    const push = canvas.getByRole('button', { name: 'Push level 2' });
    await userEvent.click(push);
    assert(canvas.getByText('Stack level 2'), 'Second page must appear');
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
    await frame();
    assert(canvas.getByText('Stack level 1'), 'Back must restore the previous page');
    assert(
      document.activeElement?.textContent === 'Push level 2',
      'Back must restore focus to the initiating control',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    assert(canvas.getByText('Default secondary content'), 'Close must reveal default Secondary');
  },
};

export const GuardBlocksCloseAndReplacement: Story = {
  render: () => (
    <AppWorkspaceProvider>
      <ContractWorkspace />
    </AppWorkspaceProvider>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open guarded secondary' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    assert(canvas.getByText('Protected editor'), 'The guard must prevent closing');
    await userEvent.click(canvas.getByRole('button', { name: 'Open first secondary' }));
    assert(canvas.getByText('Protected editor'), 'The guard must prevent replacement');
    await userEvent.click(canvas.getByRole('button', { name: 'Allow exit' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    assert(canvas.getByText('Default secondary content'), 'A passing guard must allow closing');
  },
};
