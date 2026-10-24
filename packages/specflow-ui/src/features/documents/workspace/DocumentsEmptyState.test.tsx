// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { DocumentsEmptyState, suggestedDocuments } from './DocumentsEmptyState';

afterEach(cleanup);

const docs = [
  { id: 'a', path: 'docs/a.md' },
  { id: 'b', path: 'b.md', required: true },
  ...['c', 'd', 'e', 'f'].map((id) => ({ id, path: `docs/${id}.md` })),
];

describe('documents empty state', () => {
  it('suggests required documents first and at most five', () => {
    expect(suggestedDocuments(docs).map((document) => document.id)).toEqual([
      'b',
      'a',
      'c',
      'd',
      'e',
    ]);
  });

  it('shows one line and buttons that open a document, nothing opens by itself', () => {
    const onOpen = vi.fn();
    render(
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <DocumentsEmptyState documents={docs} onOpen={onOpen} />
      </LocalizationProvider>,
    );
    expect(screen.getByText('Choose a document from the tree')).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Open b.md' }));
    expect(onOpen).toHaveBeenCalledWith('b');
  });

  it('shows only the line for an empty tree', () => {
    render(
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <DocumentsEmptyState documents={[]} onOpen={() => undefined} />
      </LocalizationProvider>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
