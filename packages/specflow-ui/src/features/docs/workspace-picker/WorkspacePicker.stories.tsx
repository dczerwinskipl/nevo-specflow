import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { withLocale } from '../../../i18n/StoryLocalization';
import { ContextSwitcherTrigger } from '../../../shared/context-switcher';
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

/** Closed: the dirty, long-named worktree with its bound Specification, its status in its own slot. */
export const Closed: Story = {
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('button', { name: /Workspace/ });
    await expect(trigger).toBeVisible();
    await expect(within(trigger).getByText('Local changes')).toBeVisible();
    await expect(trigger).toHaveAccessibleName(new RegExp(sso.name));
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

/** Screenshot state: the list left open, local changes explained once under it. */
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Workspace/ }));
    const dialog = await within(document.body).findByRole('dialog', { name: 'Change workspace' });
    await waitFor(() =>
      expect(
        within(dialog).getByText(
          'Local changes: reading and search include uncommitted changes, new files too',
        ),
      ).toBeVisible(),
    );
    await expect(within(dialog).getAllByText('Local changes')).toHaveLength(1);
  },
};

const longName =
  'feature-workspace-aware-documentation-readers-search-results-refinements-after-owner-review-mobile';
const longTitle = 'Workspace-aware documentation reader with search refinement for mobile review';
const repoDirty = item('ws-repo', 'repo', { kind: 'primary', path: '/work/repo', dirty: true });
const repoClean = item('ws-repo', 'repo', { kind: 'primary', path: '/work/repo', dirty: false });
const dogfooding = item('ws-dogfooding', 'test-dogfooding-docs', {
  path: '/work/repo-wt/test-dogfooding-docs',
  dirty: false,
  specifications: [{ specId: 'dog', title: 'Test dogfooding docs' }],
});
const mobile = item('ws-mobile', longName, {
  path: `/work/repo-wt/${longName}`,
  dirty: true,
  specifications: [{ specId: 'doc-143', title: longTitle }],
});
const desktop = item('ws-desktop', longName.replace(/-mobile$/, '-desktop'), {
  path: `/work/repo-wt/${longName.replace(/-mobile$/, '-desktop')}`,
  dirty: false,
  specifications: [{ specId: 'doc-143', title: longTitle }],
});
const spike = item('ws-spike', 'spike-provider-limits', {
  path: '/work/repo-wt/spike-provider-limits',
  available: false,
  unavailableReason: 'checkout-unavailable',
});
const fromRepo = (current: WorkspaceListItem, ...others: WorkspaceListItem[]): WorkspaceList => ({
  projectFolderId: 'ws-repo',
  workspaces: [current, ...others],
});

/** The real list of the long-name screenshots: two worktrees that differ only at the end. */
const longList = fromRepo(repoDirty, dogfooding, mobile, desktop, spike);

/** Open on the long-named worktree: full names wrap, short statuses, one footer explanation. */
export const OpenLongNames: Story = {
  args: { workspaces: longList, initial: mobile.workspaceId },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Workspace/ }));
    const dialog = await within(document.body).findByRole('dialog', { name: 'Change workspace' });
    await waitFor(() => expect(within(dialog).getByText(desktop.name)).toBeVisible());
    await expect(within(dialog).getByText('Folder unavailable')).toBeVisible();
  },
};

interface SpecificationCase {
  readonly title: string;
  readonly name: string;
  readonly displayKey?: string;
}

interface WorkspaceCase {
  readonly title: string;
  readonly workspaces: WorkspaceList;
  readonly selected: string;
  readonly sessionWorkspaceId?: string;
}

const specificationCases: readonly SpecificationCase[] = [
  { title: 'With a key', name: 'Workspace-aware documentation reader', displayKey: 'DOC-143' },
  { title: 'Without a key', name: 'Workspace-aware documentation reader' },
  { title: 'Long title', name: longTitle, displayKey: 'DOC-143' },
];

const workspaceCases: readonly WorkspaceCase[] = [
  {
    title: 'Project folder, clean',
    workspaces: fromRepo(repoClean, dogfooding),
    selected: 'ws-repo',
  },
  {
    title: 'Project folder, local changes',
    workspaces: fromRepo(repoDirty, dogfooding),
    selected: 'ws-repo',
  },
  {
    title: 'Project folder from a Session, local changes',
    workspaces: fromRepo(repoDirty, dogfooding),
    selected: 'ws-repo',
    sessionWorkspaceId: 'ws-repo',
  },
  {
    title: 'Worktree bound to a Specification',
    workspaces: fromRepo(repoDirty, dogfooding),
    selected: dogfooding.workspaceId,
  },
  {
    title: 'Unavailable worktree (an explicit pick)',
    workspaces: fromRepo(repoDirty, spike),
    selected: spike.workspaceId,
  },
  {
    title: 'Worktree, 98-character name, local changes',
    workspaces: longList,
    selected: mobile.workspaceId,
  },
];

/**
 * The Specification switcher's trigger as `SpecificationSwitcher` composes the shared trigger (its
 * label, the title as a prose name, the key as the only segment, no status). The switcher itself
 * needs the router and the catalogue; the Application Shell stories cover it in place.
 */
function SpecificationTrigger({ name, displayKey }: SpecificationCase) {
  const { t } = useTranslation();

  return (
    <div className="rounded-control bg-surface-subtle" data-board-case="specification">
      <ContextSwitcherTrigger
        label={t('applicationNavigation.currentSpecification')}
        name={name}
        segments={displayKey ? [displayKey] : []}
      />
    </div>
  );
}

function CaseTitle({ children }: { children: string }) {
  return (
    <Typography as="p" variant="body-sm" className="text-content-muted">
      {children}
    </Typography>
  );
}

/** Both switchers of the shared context switcher, side by side (stacked on Narrow). */
function SwitchersBoard() {
  return (
    <div className="grid grid-cols-1 gap-8 p-4 md:grid-cols-[20rem_20rem]">
      <section className="grid content-start gap-3" aria-label="Specification switcher">
        <Typography as="h2" variant="title-sm">
          Specification switcher
        </Typography>
        {specificationCases.map((item) => (
          <div key={item.title} className="grid gap-1">
            <CaseTitle>{item.title}</CaseTitle>
            <SpecificationTrigger {...item} />
          </div>
        ))}
      </section>
      <section className="grid content-start gap-3" aria-label="Workspace picker">
        <Typography as="h2" variant="title-sm">
          Workspace picker
        </Typography>
        {workspaceCases.map((item) => (
          <div key={item.title} className="grid gap-1" data-board-case="workspace">
            <CaseTitle>{item.title}</CaseTitle>
            <WorkspacePicker
              workspaces={item.workspaces}
              selectedWorkspaceId={item.selected}
              sessionWorkspaceId={item.sessionWorkspaceId}
              onSelect={() => undefined}
            />
          </div>
        ))}
      </section>
    </div>
  );
}

const boardPlay: Story['play'] = async ({ canvasElement }) => {
  const heights = (selector: string) =>
    [...canvasElement.querySelectorAll<HTMLElement>(`${selector} button`)].map(
      (button) => button.getBoundingClientRect().height,
    );
  // 72 px with a detail line, 56 px without one (the Specification without a key).
  await waitFor(() => expect(heights('[data-board-case="workspace"]')).toEqual(Array(6).fill(72)));
  await expect(heights('[data-board-case="specification"]')).toEqual([72, 56, 72]);
};

/** The Specification switcher and the workspace picker side by side, in English. */
export const SwitchersSideBySide: Story = {
  render: () => <SwitchersBoard />,
  parameters: { layout: 'fullscreen' },
  play: boardPlay,
};

/** The same board in Polish (the owner's review language). */
export const SwitchersSideBySidePolish: Story = {
  render: () => <SwitchersBoard />,
  decorators: [withLocale('pl')],
  parameters: { layout: 'fullscreen' },
  play: boardPlay,
};
