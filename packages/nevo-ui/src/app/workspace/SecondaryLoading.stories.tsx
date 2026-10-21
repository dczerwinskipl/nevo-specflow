import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from '../shell/AppShell';
import { AppWorkspace, WorkspaceHeader } from './AppWorkspace';
import { AppWorkspaceProvider, useSecondaryNavigation } from './WorkspaceContext';
import { defineSecondaryStack } from './SecondaryStack';

const Presentation = createContext<{ value?: ReactNode }>({});
const pendingStack = defineSecondaryStack<
  Record<never, never>,
  string,
  { pending: Record<never, never> }
>({
  id: 'loading-contract',
  initial: 'pending',
  useData: () => ({ status: 'loading', presentation: useContext(Presentation).value }),
  screens: {
    pending: { title: 'Pending detail', component: () => <div>Ready must never be mounted</div> },
  },
});
function FixtureInner({ mode }: { mode: 'custom' | 'fallback' | 'null' }) {
  const navigation = useSecondaryNavigation();
  const [openCount, setOpenCount] = useState(0);
  return (
    <Presentation.Provider
      value={{
        value:
          mode === 'custom' ? (
            <div role="status">Product loading</div>
          ) : mode === 'null' ? null : undefined,
      }}
    >
      <div className="h-dvh">
        <AppShell navigation={<div>Navigation</div>}>
          <AppWorkspace split="primary">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Primary" />}>
              <button
                onClick={() => {
                  setOpenCount(openCount + 1);
                  void navigation.open(pendingStack, {});
                }}
              >
                Open pending detail
              </button>
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
      </div>
    </Presentation.Provider>
  );
}
function Fixture({ mode = 'custom' }: { mode?: 'custom' | 'fallback' | 'null' }) {
  return (
    <AppWorkspaceProvider>
      <FixtureInner mode={mode} />
    </AppWorkspaceProvider>
  );
}
const meta = {
  title: 'Nevo UI/Workspace/Secondary loading',
  component: Fixture,
  parameters: { layout: 'fullscreen' },
  tags: ['contract'],
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Custom: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open pending detail' }));
    await canvas.findByRole('status', { name: '' });
    if (!canvas.getByText('Product loading')) throw new Error('Custom presentation missing');
    if (canvas.queryByText('Loading…')) throw new Error('Unexpected default loading status');
    if (canvas.queryByText('Ready must never be mounted'))
      throw new Error('Ready component mounted without data');
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    if (canvas.queryByText('Product loading'))
      throw new Error('Loading presentation survived Close');
  },
};
export const Fallback: Story = {
  args: { mode: 'fallback' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open pending detail' }));
    await canvas.findByText('Loading…');
  },
};
export const ExplicitNull: Story = {
  args: { mode: 'null' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open pending detail' }));
    await canvas.findByText('Pending detail');
    if (canvas.queryByText('Loading…')) throw new Error('Unexpected default loading status');
    if (canvas.queryByText('Ready must never be mounted'))
      throw new Error('Ready component mounted without data');
  },
};
