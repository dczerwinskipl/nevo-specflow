import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { withLocale } from '../../../i18n/StoryLocalization';
import { WorkspacePicker } from './WorkspacePicker';

const item = (
  id: string,
  name: string,
  extra: Partial<WorkspaceListItem> = {},
): WorkspaceListItem => ({
  workspaceId: id,
  kind: 'linked',
  name,
  path: `/work/${name}`,
  available: true,
  isRuntimeWorkspace: false,
  specifications: [],
  ...extra,
});

const main = item('ws-main', 'nevo-specflow', {
  kind: 'primary',
  path: '/work/nevo-specflow',
  isRuntimeWorkspace: true,
});
const sso = item('ws-sso', 'ui-1234-single-sign-on-with-the-corporate-identity-provider', {
  path: '/work/nevo-specflow/.nevo/worktrees/ui-1234',
  dirty: true,
  specifications: [{ specId: 'sso', title: 'Single sign-on with the corporate identity provider' }],
});
const reader = item('ws-reader', 'docs-reader', {
  specifications: [{ specId: 'dr', title: 'Czytnik dokumentacji projektu' }],
});
const gone = item('ws-gone', 'old-indexer', {
  available: false,
  unavailableReason: 'checkout-unavailable',
});

const list = (...workspaces: WorkspaceListItem[]): WorkspaceList => ({
  projectFolderId: main.workspaceId,
  workspaces,
});

function Harness({
  workspaces,
  initial,
  sessionWorkspaceId,
}: {
  workspaces: WorkspaceList;
  initial: string;
  sessionWorkspaceId?: string;
}) {
  const [selected, setSelected] = useState(initial);

  return (
    <div className="w-72 p-3">
      <WorkspacePicker
        workspaces={workspaces}
        selectedWorkspaceId={selected}
        onSelect={setSelected}
        sessionWorkspaceId={sessionWorkspaceId}
      />
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Shared/WorkspacePicker',
  component: Harness,
  decorators: [withLocale('en')],
  parameters: { layout: 'centered' },
  args: { workspaces: list(main, sso, reader, gone), initial: 'ws-sso' },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: the dirty, long-named worktree with its bound Specification. */
export const Closed: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /Workspace/ })).toBeVisible();
    await expect(canvas.getByText('Uncommitted changes are included')).toBeVisible();
  },
};

/** The Session's workspace is named on the trigger. */
export const SessionWorkspace: Story = {
  args: { initial: 'ws-main', sessionWorkspaceId: 'ws-main' },
};

/** A single workspace renders nothing: the reader handles that case. */
export const SingleWorkspace: Story = {
  args: { workspaces: list(main), initial: 'ws-main' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

/** Open by keyboard: focus on the selected option, wrapping arrows, unavailable reason, Escape. */
export const KeyboardOpen: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: /Workspace/ });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Change workspace' });
    const options = within(dialog).getAllByRole('option');
    await expect(options).toHaveLength(4);
    await waitFor(() => expect(options[1]).toHaveFocus());
    await expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(within(dialog).getByText('Selected')).toBeVisible());
    await waitFor(() => expect(within(dialog).getByText('Folder unavailable')).toBeVisible());
    await expect(options[3]).toHaveAttribute('aria-disabled', 'true');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(options[3]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(options[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(options[3]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect(options[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(options[3]).toHaveFocus();

    // An unavailable workspace cannot be picked.
    await userEvent.keyboard('{Enter}');
    await expect(options[1]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Enter picks the focused workspace, closes the list and returns focus to the trigger. */
export const PickByKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: /Workspace/ });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const body = within(document.body);
    await body.findByRole('dialog', { name: 'Change workspace' });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(trigger).toHaveTextContent('docs-reader'));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveTextContent('Worktree · Czytnik dokumentacji projektu');
  },
};

/** Screenshot state: the list left open. */
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Workspace/ }));
    await within(document.body).findByRole('dialog', { name: 'Change workspace' });
  },
};
