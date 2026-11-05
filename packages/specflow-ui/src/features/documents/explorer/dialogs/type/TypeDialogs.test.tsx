// @vitest-environment jsdom
import type { ReactNode } from 'react';
import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentTreeFixture } from '../../../../../../test-support/documents/fixtures';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../../i18n';
import { AssignTypeDialog } from './AssignTypeDialog';
import { NewDocumentDialog } from './NewDocumentDialog';

afterEach(cleanup);

const type = (id: string, title: string) => ({
  id,
  title,
  description: 'd',
  useWhen: 'u',
  instructions: 'i',
});
const entry = (id: string, filename: string, include: 'always' | 'optional') => ({
  id,
  type: id,
  title: id,
  filename,
  include,
  content: '',
});
const catalogue: ArchetypeCatalogue = {
  revision: 'r1',
  documentTypes: [type('overview', 'Overview'), type('decisions', 'Decisions'), type('ux', 'UX')],
  archetypes: [
    {
      id: 'team',
      version: 1,
      title: 'Team',
      description: 'd',
      useWhen: 'u',
      requirements: [{ documentType: 'overview', minCount: 1 }],
      documents: [
        entry('overview', 'overview.md', 'always'),
        entry('decisions', 'decision-log.md', 'optional'),
        entry('ux', 'ux.md', 'optional'),
      ],
    },
  ],
};
const common = {
  tree: documentTreeFixture({
    archetype: { id: 'team', version: 1, title: 'Team' },
    documents: [],
  }),
  catalogue: { isPending: false, retry: () => undefined, data: catalogue },
  busy: false,
  error: { message: 'unconfirmed' },
  onClose: () => undefined,
};
const inLocale = (node: ReactNode) =>
  render(<LocalizationProvider instance={createSpecFlowI18n('en')}>{node}</LocalizationProvider>);

describe('the type stays fixed in the unknown state, so a resubmit replays the same body', () => {
  it('New document: the chooser and the name are disabled and Create resubmits the same path', async () => {
    const onSubmit = vi.fn(() => Promise.resolve({ ok: false as const }));
    inLocale(
      <NewDocumentDialog
        {...common}
        unknown
        request={{ folder: '', type: 'decisions' }}
        specificationTitle="S"
        onSubmit={onSubmit}
      />,
    );
    const name = screen.getByRole<HTMLInputElement>('textbox');
    expect(name.disabled).toBe(true);
    const ux = screen.getByRole<HTMLButtonElement>('radio', { name: /UX/ });
    expect(ux.disabled).toBe(true);
    fireEvent.click(ux);
    expect(name.value).toBe('decision-log.md');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await act(() => Promise.resolve());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'decision-log.md', type: 'decisions' }),
    );
  });

  it('New document: the chooser is enabled while nothing is pending', () => {
    inLocale(
      <NewDocumentDialog
        {...common}
        unknown={false}
        request={{ folder: '', type: 'decisions' }}
        specificationTitle="S"
        onSubmit={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(screen.getByRole<HTMLButtonElement>('radio', { name: /UX/ }).disabled).toBe(false);
  });

  it('Assign type: the chooser is disabled', () => {
    inLocale(
      <AssignTypeDialog
        {...common}
        unknown
        request={{ id: 'd', path: 'a.md' }}
        onSubmit={() => Promise.resolve({ ok: false })}
      />,
    );
    const radios = screen.getAllByRole<HTMLButtonElement>('radio');
    expect(radios.length).toBeGreaterThan(1);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
  });
});
