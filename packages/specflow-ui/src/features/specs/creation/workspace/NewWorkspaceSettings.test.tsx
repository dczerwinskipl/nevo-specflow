// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { NewWorkspaceSettings } from './NewWorkspaceSettings';
import { createOptionsFixture } from '../options/creationOptions.stories-support';
import { buildCreateRequest } from './model/createRequest.test-support';
import { initialWorkspaceChoice, type WorkspaceChoice } from './model/workspaceChoice';
import { revalidate } from './model/workspaceValidation';

const options = createOptionsFixture('default');
const operationId = '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77';
let latest: WorkspaceChoice = initialWorkspaceChoice;

function Harness({
  title,
  options: harnessOptions = options,
}: {
  title: string;
  options?: typeof options;
}) {
  const [choice, setChoice] = useState<WorkspaceChoice>({ ...initialWorkspaceChoice, tile: 'new' });
  latest = choice;

  return (
    <NewWorkspaceSettings
      options={harnessOptions}
      choice={choice}
      update={setChoice}
      errors={revalidate(choice, harnessOptions)}
      title={title}
      onAnnounce={vi.fn()}
      onRequestFocus={vi.fn()}
    />
  );
}

const request = (title: string) => buildCreateRequest(latest, options, title, operationId);
const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });
/** The one action of a decision row ("Change" or "Restore default"). */
const rowAction = (row: string) =>
  within(screen.getByRole('group', { name: row })).getByRole('button');
const act = (row: string, label: 'Change' | 'Restore default') => {
  const action = rowAction(row);
  expect(action.textContent).toBe(label);
  fireEvent.click(action);
};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSettings(title = 'Payment limits', harnessOptions = options) {
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <Harness title={title} options={harnessOptions} />
    </LocalizationProvider>,
  );
}

describe('New workspace settings: three decision rows that start from the effective defaults', () => {
  it('shows Start from, Merge into and Branch name, each with one Change action and no switch', () => {
    renderSettings();
    for (const row of ['Start from', 'Merge into', 'Branch name']) {
      expect(rowAction(row).textContent).toBe('Change');
    }

    expect(screen.queryByRole('switch')).toBeNull();
    // The worktree folder is one truncated line with the full path as its tooltip.
    expect(screen.getByTitle(options.worktreesRoot.path).className).toContain('truncate');
  });

  it('slug: prefilled from the title, follows it, sends nothing until it differs', () => {
    renderSettings();
    act('Branch name', 'Change');
    expect(field('Slug').value).toBe('payment-limits');
    expect(request('Payment limits')).not.toHaveProperty('slug');

    fireEvent.change(field('Slug'), { target: { value: 'my-limits' } });
    expect(field('Slug').value).toBe('my-limits');
    expect(request('Payment limits')).toMatchObject({ slug: 'my-limits' });

    // Typing the default back is not an override any more.
    fireEvent.change(field('Slug'), { target: { value: 'payment-limits' } });
    expect(request('Payment limits')).not.toHaveProperty('slug');
  });

  it('slug: an invalid value shows an inline error that names the row action', () => {
    renderSettings();
    act('Branch name', 'Change');
    fireEvent.change(field('Slug'), { target: { value: 'Not Valid' } });
    expect(screen.getByText(/Use lowercase letters, digits and single hyphens/)).toBeTruthy();
    fireEvent.change(field('Slug'), { target: { value: '' } });
    expect(screen.getByText('Enter a slug or choose “Restore default”.')).toBeTruthy();
    expect(field('Slug').getAttribute('aria-invalid')).toBe('true');
  });

  it('branch name: prefilled with the generated default, sent only once edited to something else', () => {
    renderSettings();
    act('Branch name', 'Change');
    expect(field('New branch name').value).toBe('feature/payment-limits');
    expect(request('Payment limits').target).toEqual({ kind: 'new-worktree' });

    fireEvent.change(field('New branch name'), { target: { value: 'feature/own' } });
    expect(request('Payment limits').target).toEqual({
      kind: 'new-worktree',
      branch: 'feature/own',
    });

    // A cleared name says so at the field, naming the row action, not a switch.
    fireEvent.change(field('New branch name'), { target: { value: '' } });
    expect(screen.getByText('Enter a branch name or choose “Restore default”.')).toBeTruthy();
    expect(field('New branch name').getAttribute('aria-invalid')).toBe('true');
  });

  it('start from and merge into: prefilled (no empty states) and not sent while default', () => {
    renderSettings();
    act('Start from', 'Change');
    expect(screen.queryByText('Choose a branch')).toBeNull();
    // The value is the listed full ref; the field shows its branch name.
    expect(latest.base.ref).toBe('refs/heads/develop');
    const base = screen.getByRole('combobox', { name: 'Start from' }).textContent;
    expect(base).toContain('develop');
    expect(base).not.toContain('refs/heads/');
    act('Merge into', 'Change');
    expect(screen.queryByText('Choose a workspace')).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(request('T').target).toEqual({ kind: 'new-worktree' });
  });

  it('Restore default restores the default and sends nothing', () => {
    renderSettings();
    act('Branch name', 'Change');
    fireEvent.change(field('Slug'), { target: { value: 'my-limits' } });
    fireEvent.change(field('New branch name'), { target: { value: 'feature/own' } });
    expect(request('Payment limits')).toMatchObject({
      slug: 'my-limits',
      target: { branch: 'feature/own' },
    });

    act('Branch name', 'Restore default');
    expect(latest.slug).toEqual(initialWorkspaceChoice.slug);
    expect(latest.branch).toEqual(initialWorkspaceChoice.branch);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(request('Payment limits')).toEqual({
      title: 'Payment limits',
      operationId,
      target: { kind: 'new-worktree' },
    });

    // Changing again starts from the default, not from the discarded edit.
    act('Branch name', 'Change');
    expect(field('Slug').value).toBe('payment-limits');
  });

  it('every row action is named for its row, starting with its visible text', () => {
    renderSettings();
    act('Branch name', 'Change');
    expect(rowAction('Start from').getAttribute('aria-label')).toBe('Change: Start from');
    expect(rowAction('Merge into').getAttribute('aria-label')).toBe('Change: Merge into');
    expect(rowAction('Branch name').getAttribute('aria-label')).toBe(
      'Restore default: Branch name',
    );
    for (const row of ['Start from', 'Merge into', 'Branch name']) {
      const action = rowAction(row);
      expect(action.getAttribute('aria-label')!.startsWith(action.textContent)).toBe(true);
    }
  });

  it('every row action looks the same: one quiet button, never a pressed toggle', () => {
    renderSettings();
    act('Branch name', 'Change');
    const actions = ['Start from', 'Merge into', 'Branch name'].map(rowAction);
    expect(new Set(actions.map((action) => action.className)).size).toBe(1);
    for (const action of actions) {
      expect(action.getAttribute('aria-pressed')).toBeNull();
      expect(action.getAttribute('aria-expanded')).toBeNull();
    }
  });
});

describe('the branch preview', () => {
  it('writes the parts that exist only once created as words, never as template tokens', () => {
    renderSettings('Payment limits', { ...options, branchPattern: 'feature/{key}-{slug}' });
    const row = screen.getByRole('group', { name: 'Branch name' });
    expect(row.textContent).not.toContain('<key>');
    expect(row.textContent).toContain('feature/key-payment-limits');
    expect(within(row).getByText('key').className).toContain('italic');
    expect(
      within(row).getByText('The specification key is assigned when it is created.'),
    ).toBeTruthy();
    expect(within(row).getByTitle('feature/…-payment-limits')).toBeTruthy();
  });
});

describe('unavailable settings', () => {
  it('a row with nothing to choose from has no action and says why, at full strength', () => {
    renderSettings('Payment limits', { ...options, baseRefs: [] });
    const row = screen.getByRole('group', { name: 'Start from' });
    expect(within(row).queryByRole('button')).toBeNull();
    const reason = within(row).getByText('There are no local branches to choose from.');
    expect(reason.closest('[class*="opacity-"]')).toBeNull();
  });
});

describe('flagged settings', () => {
  it('a protected generated branch is said on the row; the fields stay while the owner types', () => {
    renderSettings('Payment limits', createOptionsFixture('new-branch-protected'));
    const row = screen.getByRole('group', { name: 'Branch name' });
    expect(within(row).getByText(/is protected/)).toBeTruthy();
    act('Branch name', 'Change');
    fireEvent.change(field('New branch name'), { target: { value: 'release/hotfix' } });
    // The unflagged name does not close the row: it stays changed until Restore default.
    fireEvent.change(field('New branch name'), { target: { value: 'feature' } });
    expect(field('New branch name').value).toBe('feature');
  });
});
