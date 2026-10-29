// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { DocumentsEmptyState } from './DocumentsEmptyState';

afterEach(cleanup);

function renderIn(language: 'en' | 'pl', ui: ReactNode) {
  return render(
    <LocalizationProvider instance={createSpecFlowI18n(language)}>{ui}</LocalizationProvider>,
  );
}

const isPrimary = (element: HTMLElement) => element.className.includes('bg-action-primary');

describe('documents empty state', () => {
  it('is the shared empty screen with the start actions, New document as the one primary', () => {
    const newDocument = vi.fn();
    const upload = vi.fn();
    const { container } = renderIn(
      'pl',
      <DocumentsEmptyState
        actions={[
          { id: 'documents-upload', label: 'Wgraj pliki', disabled: true, onPress: upload },
          { id: 'documents-new-file', label: 'Nowy dokument…', icon: 'file', onPress: newDocument },
        ]}
      />,
    );
    expect(container.querySelector('[data-empty-state="pane"]')).not.toBeNull();
    expect(screen.getByText('Brak otwartego dokumentu')).toBeTruthy();
    expect(screen.getByText('Wybierz dokument z drzewa albo utwórz nowy.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    const [first, second] = screen.getAllByRole('button');
    // The primary comes first and is the only filled action.
    expect(first!.textContent).toBe('Nowy dokument…');
    expect(isPrimary(first!)).toBe(true);
    expect(isPrimary(second!)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Nowy dokument…' }));
    expect(newDocument).toHaveBeenCalledOnce();
    // An action waiting for a running operation is disabled, not hidden.
    expect(screen.getByRole('button', { name: 'Wgraj pliki' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps Upload secondary when it is the only start action', () => {
    renderIn(
      'en',
      <DocumentsEmptyState
        actions={[{ id: 'documents-upload', label: 'Upload files', onPress: () => undefined }]}
      />,
    );
    expect(isPrimary(screen.getByRole('button', { name: 'Upload files' }))).toBe(false);
  });

  it('shows only the sentence, without "create", when the Specification allows no start action', () => {
    renderIn('en', <DocumentsEmptyState />);
    expect(screen.getByText('No document open')).toBeTruthy();
    expect(screen.getByText('Choose a document from the tree.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
