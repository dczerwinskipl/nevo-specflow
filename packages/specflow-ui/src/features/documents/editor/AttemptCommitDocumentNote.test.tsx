// @vitest-environment jsdom
import type { DocumentAttemptCommit } from '@nevo/specflow-contracts/documents';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { DocumentEditor } from './DocumentEditor';
import { DocumentEditorProvider, useDocumentEditor } from './DocumentEditorProvider';
import { documentHeaderModel } from './documentHeaderModel';

const hold: DocumentAttemptCommit = {
  reason: 'attempt-commit-failed',
  code: 'MANUAL_COMMIT_CONFLICT',
  attemptId: '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02',
  subject: { specId: 'sso' },
  step: 'requirements',
  attempt: 1,
  stepTitle: 'Requirements',
  count: 2,
  paths: ['overview.md', 'specification.yaml'],
};

function SaveState() {
  const session = useDocumentEditor();
  const actions = documentHeaderModel(session, useTranslation().t).actions;

  return (
    <>
      <output data-testid="save">{session?.saveBlocked ? 'blocked' : 'possible'}</output>
      <output data-testid="actions">{actions.map((action) => action.id).join(' ')}</output>
    </>
  );
}

function renderHeld() {
  const base = createSpecFlowAppServices();
  const retryAttemptCommit = vi.fn(() => Promise.resolve({ postActions: [] }));
  const services = {
    ...base,
    workflowExecutionApi: { ...base.workflowExecutionApi, retryAttemptCommit },
  } as typeof base;
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <DocumentEditorProvider
              specId="sso"
              document={documentContentFixture({
                id: 'overview',
                title: 'Overview',
                path: 'overview.md',
                content: '# Requirements by the agent\n',
                revision: '1',
              })}
              readOnlyReason="attempt-commit"
              attemptCommit={hold}
            >
              <SaveState />
              <DocumentEditor />
            </DocumentEditorProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );

  return { retryAttemptCommit };
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(cleanup);

describe('a document an agent attempt commit holds', () => {
  it('says so before any edit, with Save unavailable and Retry commit of that attempt', async () => {
    const { retryAttemptCommit } = renderHeld();

    expect(screen.getByRole('alert').textContent).toContain(
      "The agent's work on this document in Requirements is not committed yet",
    );
    expect(screen.getByRole('alert').textContent).toContain('MANUAL_COMMIT_CONFLICT');
    expect(screen.queryByText(/Read-only:/u)).toBeNull();
    // Read-only before the click: no Edit is offered and Save would be refused.
    expect(screen.getByTestId('save').textContent).toBe('blocked');
    expect(screen.getByTestId('actions').textContent).not.toMatch(/edit|save/u);

    fireEvent.click(screen.getByRole('button', { name: 'Retry commit' }));
    await waitFor(() =>
      expect(retryAttemptCommit).toHaveBeenCalledWith(
        { specId: 'sso' },
        { step: 'requirements', attempt: 1 },
      ),
    );
  });
});
