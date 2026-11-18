// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import {
  IntegrationBranchChoice,
  integrationTargetSetting,
  yamlScalar,
} from './IntegrationBranchChoice';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type TargetMissing = Extract<RepositoryBlocker, { kind: 'integration-target-missing' }>;

const blocker: TargetMissing = {
  kind: 'integration-target-missing',
  sourceCheckout: 'linked',
  candidates: [
    { branch: 'release/2026.11', facts: ['remote-default', 'started-from'], remote: 'origin' },
    { branch: 'develop', facts: ['primary-checkout'] },
  ],
  otherBranches: ['main'],
  otherBranchCount: 1,
};

function renderChoice(value: TargetMissing = blocker) {
  return render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <IntegrationBranchChoice blocker={value} specTitle="SSO sign-in" />
    </LocalizationProvider>,
  );
}

const setting = () => screen.getByLabelText('Setting for .nevo/config.yaml').textContent;

describe('IntegrationBranchChoice', () => {
  it('offers each candidate with its facts, chooses none and writes no branch', () => {
    renderChoice();

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(screen.getByText('Remote default (origin) · SSO sign-in started from it')).toBeTruthy();
    expect(screen.getByText('Checked out in the main folder')).toBeTruthy();
    expect(setting()).toBe('git:\n  integrationTargetBranch: <choose a branch>');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Copy setting' }).disabled).toBe(
      true,
    );
    expect(screen.getByText('Choose a branch first')).toBeTruthy();
  });

  it('copies the setting with the chosen branch', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderChoice();

    fireEvent.click(screen.getByRole('radio', { name: 'develop' }));
    expect(setting()).toBe('git:\n  integrationTargetBranch: develop');
    const copy = screen.getByRole<HTMLButtonElement>('button', { name: 'Copy setting' });
    expect(copy.disabled).toBe(false);
    fireEvent.click(copy);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('git:\n  integrationTargetBranch: develop'),
    );
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('says so when no local branch can receive the Close', () => {
    renderChoice({ ...blocker, candidates: [], otherBranches: [], otherBranchCount: 0 });

    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy setting' })).toBeNull();
    expect(screen.getByText(/No local branch can receive it/)).toBeTruthy();
  });
});

describe('the integration branch setting', () => {
  it('is two lines of YAML that keep the branch a string', () => {
    expect(integrationTargetSetting(undefined, '<choose a branch>')).toBe(
      'git:\n  integrationTargetBranch: <choose a branch>',
    );
    expect(yamlScalar('release/2026.11')).toBe('release/2026.11');
    // Names YAML would read as a boolean, a number or syntax are quoted.
    expect(yamlScalar('yes')).toBe('"yes"');
    expect(yamlScalar('1.0')).toBe('"1.0"');
    expect(yamlScalar('#hotfix')).toBe('"#hotfix"');
  });
});
