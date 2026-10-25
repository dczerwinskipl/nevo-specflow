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

describe('documents empty state', () => {
  it('shows one line and the start actions, no document list, nothing opens by itself', () => {
    const newDocument = vi.fn();
    const upload = vi.fn();
    renderIn(
      'pl',
      <DocumentsEmptyState
        actions={[
          { id: 'new', label: 'Nowy dokument…', icon: 'file', onPress: newDocument },
          { id: 'upload', label: 'Wgraj pliki', disabled: true, onPress: upload },
        ]}
      />,
    );
    expect(screen.getByText('Wybierz dokument z drzewa albo utwórz nowy.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Nowy dokument…' }));
    expect(newDocument).toHaveBeenCalledOnce();
    // An action waiting for a running operation is disabled, not hidden.
    expect(screen.getByRole('button', { name: 'Wgraj pliki' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows only the line, without "create", when the Specification allows no start action', () => {
    renderIn('en', <DocumentsEmptyState />);
    expect(screen.getByText('Choose a document from the tree.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
