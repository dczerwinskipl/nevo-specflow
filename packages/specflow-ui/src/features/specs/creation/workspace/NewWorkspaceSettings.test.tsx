// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { NewWorkspaceSettings } from './NewWorkspaceSettings';
import { createOptionsFixture } from '../creationOptions.stories-support';
import { buildCreateRequest } from './createRequest.test-support';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';
import { revalidate } from './workspaceValidation';

const options = createOptionsFixture('default');
const operationId = '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77';
let latest: WorkspaceChoice = initialWorkspaceChoice;

function Harness({ title }: { title: string }) {
  const [choice, setChoice] = useState<WorkspaceChoice>({
    ...initialWorkspaceChoice,
    tile: 'new',
    settingsOpen: true,
  });
  latest = choice;
  return (
    <NewWorkspaceSettings
      options={options}
      choice={choice}
      update={setChoice}
      errors={revalidate(choice, options)}
      title={title}
      onAnnounce={vi.fn()}
      onRequestFocus={vi.fn()}
    />
  );
}

const request = (title: string) => buildCreateRequest(latest, options, title, operationId);
const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name });
const toggle = (name: RegExp) => fireEvent.click(screen.getByRole('switch', { name }));

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

function renderSettings(title = 'Payment limits') {
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <Harness title={title} />
    </LocalizationProvider>,
  );
}

describe('New workspace settings prefill their switches with the effective defaults', () => {
  it('slug: prefilled from the title, follows it, sends nothing until it differs', () => {
    renderSettings();
    toggle(/Edit the name \(slug\)/);
    expect(field('Slug').value).toBe('payment-limits');
    expect(request('Payment limits')).not.toHaveProperty('slug');

    fireEvent.change(field('Slug'), { target: { value: 'my-limits' } });
    expect(field('Slug').value).toBe('my-limits');
    expect(request('Payment limits')).toMatchObject({ slug: 'my-limits' });

    // Typing the default back is not an override any more.
    fireEvent.change(field('Slug'), { target: { value: 'payment-limits' } });
    expect(request('Payment limits')).not.toHaveProperty('slug');
  });

  it('slug: an invalid value shows an inline error', () => {
    renderSettings();
    toggle(/Edit the name \(slug\)/);
    fireEvent.change(field('Slug'), { target: { value: 'Not Valid' } });
    expect(screen.getByText(/Use lowercase letters, digits and single hyphens/)).toBeTruthy();
    fireEvent.change(field('Slug'), { target: { value: '' } });
    expect(screen.getByText('Enter a slug or turn this option off.')).toBeTruthy();
  });

  it('branch name: prefilled with the generated default, sent only once edited to something else', () => {
    renderSettings();
    toggle(/Use your own branch name/);
    expect(field('New branch name').value).toBe('feature/payment-limits');
    expect(request('Payment limits').target).toEqual({ kind: 'new-worktree' });

    fireEvent.change(field('New branch name'), { target: { value: 'feature/own' } });
    expect(request('Payment limits').target).toEqual({
      kind: 'new-worktree',
      branch: 'feature/own',
    });
  });

  it('start from and merge into: prefilled (no empty states) and not sent while default', () => {
    renderSettings();
    toggle(/Start from a different branch/);
    expect(screen.queryByText('Choose a branch')).toBeNull();
    toggle(/Merge later into a different workspace/);
    expect(screen.queryByText('Choose a workspace')).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(request('T').target).toEqual({ kind: 'new-worktree' });
  });

  it('switching a toggle off restores the default and sends nothing', () => {
    renderSettings();
    toggle(/Edit the name \(slug\)/);
    fireEvent.change(field('Slug'), { target: { value: 'my-limits' } });
    toggle(/Use your own branch name/);
    fireEvent.change(field('New branch name'), { target: { value: 'feature/own' } });
    expect(request('Payment limits')).toMatchObject({
      slug: 'my-limits',
      target: { branch: 'feature/own' },
    });

    toggle(/Edit the name \(slug\)/);
    toggle(/Use your own branch name/);
    expect(latest.slug).toEqual(initialWorkspaceChoice.slug);
    expect(latest.branch).toEqual(initialWorkspaceChoice.branch);
    expect(request('Payment limits')).toEqual({
      title: 'Payment limits',
      operationId,
      target: { kind: 'new-worktree' },
    });

    // Switching on again starts from the default, not from the discarded edit.
    toggle(/Edit the name \(slug\)/);
    expect(field('Slug').value).toBe('payment-limits');
  });
});

describe('unavailable settings', () => {
  it('mark the switch unavailable with the design-system pattern and keep the reason readable', () => {
    render(
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <NewWorkspaceSettings
          options={{ ...options, baseRefs: [] }}
          choice={{ ...initialWorkspaceChoice, tile: 'new', settingsOpen: true }}
          update={vi.fn()}
          errors={{}}
          title="Payment limits"
          onAnnounce={vi.fn()}
          onRequestFocus={vi.fn()}
        />
      </LocalizationProvider>,
    );
    const base = screen.getByRole('switch', { name: /different branch/ });
    // Unavailable, not disabled: it stays reachable by keyboard and its reason is its description.
    expect(base.getAttribute('aria-disabled')).toBe('true');
    const reason = screen.getByText('There are no local branches to choose from.');
    // The reason is not faded with the control: no ancestor of it carries an opacity class.
    expect(reason.closest('[class*="opacity-"]')).toBeNull();
    expect(reason.className).toContain('text-content-secondary');
  });
});
