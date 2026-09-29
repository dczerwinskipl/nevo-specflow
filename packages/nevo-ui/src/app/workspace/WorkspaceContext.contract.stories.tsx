import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceHeader } from './WorkspaceHeader';
import { AppWorkspaceProvider, useWorkspace } from './WorkspaceContext';

function FocusRestorationFixture() {
  const workspace = useWorkspace();
  const resolveGuard = useRef<((allow: boolean) => void) | null>(null);

  return (
    <div className="grid max-w-sm gap-3 p-6">
      <button
        type="button"
        onClick={() => {
          void workspace.setSecondary(
            { content: <div>Initial secondary</div> },
            {
              beforeClose: () =>
                new Promise<boolean>((resolve) => {
                  resolveGuard.current = resolve;
                }),
            },
          );
        }}
      >
        Open initial secondary
      </button>
      <button
        type="button"
        onClick={() => void workspace.setSecondary({ content: <div>Replacement secondary</div> })}
      >
        Replace secondary
      </button>
      <button type="button">Focus while guard is pending</button>
      <button type="button" onClick={() => resolveGuard.current?.(true)}>
        Allow replacement
      </button>
      <button type="button" onClick={() => void workspace.closeSecondary()}>
        Close replacement
      </button>
      <div data-secondary-state>{workspace.secondary?.surface.content}</div>
    </div>
  );
}

function StackFixture() {
  const workspace = useWorkspace();
  return (
    <div className="grid max-w-sm gap-3 p-6">
      <button
        type="button"
        onClick={() =>
          void workspace.pushSecondary({
            header: (
              <WorkspaceHeader
                actions={[
                  {
                    id: 'level-one-action',
                    label: 'Level one action',
                    icon: 'plus',
                    primary: true,
                    onPress: () => undefined,
                  },
                ]}
                title="Layer one"
              />
            ),
            content: <div>Stack level 1</div>,
          })
        }
      >
        Push level 1
      </button>
      <button
        type="button"
        onClick={() =>
          void workspace.pushSecondary({
            header: (
              <WorkspaceHeader
                actions={[
                  {
                    id: 'level-two-action',
                    label: 'Level two action',
                    icon: 'plus',
                    primary: true,
                    onPress: () => undefined,
                  },
                ]}
                title="Layer two"
              />
            ),
            content: <div>Stack level 2</div>,
          })
        }
      >
        Push level 2
      </button>
      <button type="button" onClick={() => void workspace.popSecondary()}>
        Pop level
      </button>
      <button type="button" onClick={() => void workspace.closeSecondary()}>
        Close stack
      </button>
      <output data-depth>{workspace.secondaryDepth}</output>
      <div data-secondary-header>{workspace.secondary?.surface.header}</div>
      <div data-secondary-state>{workspace.secondary?.surface.content}</div>
    </div>
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

const meta = {
  title: 'Nevo UI/Internal/Workspace/Focus restoration',
  tags: ['!dev', '!autodocs'],
  parameters: {
    a11y: { test: 'off' },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const ReplacementPreservesInitiatingFocus: Story = {
  render: () => (
    <AppWorkspaceProvider>
      <FocusRestorationFixture />
    </AppWorkspaceProvider>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open initial secondary' }));
    assert(canvas.getByText('Initial secondary'), 'The initial secondary should be open.');

    const replace = canvas.getByRole('button', { name: 'Replace secondary' });
    await userEvent.click(replace);
    await userEvent.click(canvas.getByRole('button', { name: 'Focus while guard is pending' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Allow replacement' }));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (canvas.queryByText('Replacement secondary')) break;
      await nextFrame();
    }
    assert(canvas.queryByText('Replacement secondary'), 'The replacement secondary should open.');

    await userEvent.click(canvas.getByRole('button', { name: 'Close replacement' }));
    await nextFrame();
    assert(
      document.activeElement === replace,
      'Closing the replacement should restore focus to the control that initiated replacement.',
    );
  },
};

export const PushAndPopRemainNavigationState: Story = {
  render: () => (
    <AppWorkspaceProvider>
      <StackFixture />
    </AppWorkspaceProvider>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Push level 1' }));
    const pushLevelTwo = canvas.getByRole('button', { name: 'Push level 2' });
    await userEvent.click(pushLevelTwo);
    assert(canvas.getByText('Stack level 2'), 'The top stack entry should be authoritative.');
    assert(canvas.getByRole('heading', { name: 'Layer two' }), 'Layer two should own its header.');
    assert(
      canvas.getByRole('button', { name: 'Level two action' }),
      'Layer two should own its action set.',
    );
    assert(
      canvasElement.querySelector('[data-depth]')?.textContent === '2',
      'The stack should contain two entries.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Pop level' }));
    await nextFrame();
    assert(canvas.getByText('Stack level 1'), 'Back should reveal the previous stack entry.');
    assert(
      canvas.getByRole('heading', { name: 'Layer one' }),
      'Back should restore layer one header.',
    );
    assert(
      canvas.getByRole('button', { name: 'Level one action' }),
      'Back should restore the previous action set.',
    );
    assert(
      canvasElement.querySelector('[data-depth]')?.textContent === '1',
      'Popping should remove exactly one entry.',
    );
    assert(
      document.activeElement === pushLevelTwo,
      'Back should restore focus to the control that pushed the popped layer.',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Close stack' }));
    await nextFrame();
    assert(
      canvasElement.querySelector('[data-depth]')?.textContent === '0',
      'Closing should clear the local stack.',
    );
  },
};

