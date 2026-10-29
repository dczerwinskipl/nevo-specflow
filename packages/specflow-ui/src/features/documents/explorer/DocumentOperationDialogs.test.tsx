// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { DocumentOperationDialogs } from './DocumentOperationDialogs';

afterEach(cleanup);

function renderRemoval(dirtyIds: readonly string[]) {
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <DocumentOperationDialogs
        tree={documentTreeFixture()}
        request={{
          action: 'remove-registration',
          kind: 'document',
          id: 'backend',
          path: 'backend.md',
          expectedRevision: 't',
        }}
        target=""
        busy={false}
        unknown={false}
        error=""
        dirtyIds={dirtyIds}
        onTargetChange={() => undefined}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />
    </LocalizationProvider>,
  );
}

describe('Remove registration', () => {
  it('says plainly that unsaved changes of the missing document will be lost', () => {
    renderRemoval(['backend']);
    expect(screen.getByText('Your unsaved changes to backend.md will be lost.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove and discard changes' })).toBeTruthy();
  });

  it('says nothing about changes when there are none', () => {
    renderRemoval([]);
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove registration' })).toBeTruthy();
  });
});
