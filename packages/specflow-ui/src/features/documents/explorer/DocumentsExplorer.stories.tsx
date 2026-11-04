import { Fixture, protectedActions } from './DocumentsExplorer.stories-support';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import type { DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { DocumentsExplorer } from './DocumentsExplorer';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { expectToast } from '../../../test-support/toast.stories-support';
import { invokeDocumentAction } from '../editor/documentHeaderActions.stories-support';
import { withLocale } from '../../../i18n/StoryLocalization';
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Features/Document Explorer',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  tags: ['!contract'],
  argTypes: {
    loseAck: { control: 'boolean' },
    concurrent: { control: 'boolean' },
    slowMs: { control: { type: 'number', min: 0, step: 100 } },
  },
};
/** Root-level creation lives in the Primary header menu (the first `Więcej akcji` in the document). */
async function chooseRootAction(
  canvas: StoryContext['canvas'],
  userEvent: StoryContext['userEvent'],
  name: string,
) {
  await userEvent.click((await canvas.findAllByRole('button', { name: 'Więcej akcji' }))[0]!);
  await userEvent.click(await within(document.body).findByRole('menuitem', { name }));
}

export const DocumentsAndInline: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('button', { name: 'Akcje: notes' });
    await expect(canvas.queryByRole('button', { name: /^Dokumenty$/ })).not.toBeInTheDocument();
    await settleViewport();
    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: notes' }));
    await settleViewport();
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Nowy folder' }));
    const name = canvas.getByRole('textbox', { name: 'Nazwa nowego folderu' });
    await waitFor(() => expect(name).toHaveFocus());
    await userEvent.type(name, 'client-notes');
    await settleViewport();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: 'Akcje: client-notes' })).toBeVisible();
    await expect(canvas.getByLabelText('Liczba operacji')).toHaveTextContent('1');
    // The active document (specification.md) opens in Preview by default.
    await settleViewport();
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await settleViewport(390, 844);
    await userEvent.click(canvas.getByRole('button', { name: /^specification.md/ }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toBeVisible();
    await settleViewport(390, 844);
  },
};
export const InlineErrorsAndCancellation: Story = {
  play: async ({ canvas, userEvent }) => {
    await chooseRootAction(canvas, userEvent, 'Nowy folder');
    await waitFor(() =>
      expect(canvas.getByRole('textbox', { name: 'Nazwa nowego folderu' })).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    await expect(
      canvas.queryByRole('textbox', { name: 'Nazwa nowego folderu' }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByLabelText('Liczba operacji')).toHaveTextContent('0');
    await chooseRootAction(canvas, userEvent, 'Nowy folder');
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Nazwa nowego folderu' }),
      'bad-name',
    );
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('textbox', { name: 'Nazwa nowego folderu' })).toHaveValue(
      'bad-name',
    );
    // The refusal is said at the field (over the rows below), once the Runtime answered.
    await waitFor(() => expect(within(document.body).getByRole('alert')).toHaveTextContent(/\S/));
    // It fades in: wait for the shown state, not a single read.
    await waitFor(() => expect(within(document.body).getByRole('alert')).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: specification.md' }));
    // The protected overview offers no dead items: its "..." is the note that says why.
    const note = await within(document.body).findByRole('dialog', {
      name: 'Akcje: specification.md',
    });
    await expect(note).toHaveTextContent(/Przegląd to główny dokument/);
  },
};

export const LostInlineAcknowledgement: Story = {
  render: () => <Fixture loseAck />,
  play: async ({ canvas, userEvent }) => {
    await chooseRootAction(canvas, userEvent, 'Nowy folder');
    const input = await canvas.findByRole('textbox', { name: 'Nazwa nowego folderu' });
    await userEvent.type(input, 'lost');
    await userEvent.keyboard('{Enter}');
    await expect(input).toBeDisabled();
    await expect(input).toHaveValue('lost');
    await expect(canvas.getByRole('button', { name: 'Akcje: notes' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik tej operacji' }));
    await expect(canvas.getByRole('button', { name: 'Akcje: lost' })).toBeVisible();
    await expect(canvas.getByLabelText('Tożsamość prób')).toHaveTextContent('same');
    await expect(canvas.getAllByRole('button', { name: 'Akcje: lost' })).toHaveLength(1);
  },
};
export const ConfirmationKeepsObservedRevision: Story = {
  render: () => <Fixture concurrent />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: decisions.md' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Usuń' }));
    await userEvent.click(within(document.body).getByRole('button', { name: 'Usuń' }));
    await expect(canvas.getByLabelText('Wysłana rewizja')).toHaveTextContent('1');
    // Irreversible delete is an AlertDialog with a destructive action.
    const confirmation = within(document.body).getByRole('alertdialog');
    await expect(confirmation).toHaveTextContent('Dokument lub folder zmienił się');
    await expect(within(confirmation).getByRole('button', { name: 'Usuń' })).toHaveClass(
      'text-action-danger',
    );
    await userEvent.click(within(document.body).getByRole('button', { name: 'Anuluj' }));
    await expect(canvas.getByRole('button', { name: /^decisions\.md/ })).toBeVisible();
  },
};

export const FolderAcknowledgementRestoresFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    await chooseRootAction(canvas, userEvent, 'Nowy folder');
    const field = await canvas.findByRole('textbox', { name: 'Nazwa nowego folderu' });
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.type(field, 'plans');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'plans' })).toHaveFocus());
    await expect(canvas.getByLabelText('Liczba operacji')).toHaveTextContent('1');
    // The result is a toast; the toast does not take focus from the new folder.
    await expectToast('Utworzono folder plans');
    await expect(canvas.getByRole('button', { name: 'plans' })).toHaveFocus();
  },
};

export const MoveRootNamedFolder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: decisions.md' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Przenieś' }));
    await userEvent.click(within(document.body).getByRole('combobox', { name: 'Folder docelowy' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: '__root' }));
    await userEvent.click(within(document.body).getByRole('button', { name: 'Przenieś' }));
    await expect(canvas.getByLabelText('Folder wysłanej operacji')).toHaveTextContent('__root');
    await expectToast('Przeniesiono decisions.md');
  },
};

/**
 * Folder rename, move and delete send the FOLDER revision (`folders[].revision`), never the tree
 * revision; the fixture refuses anything else with `DOCUMENT_REVISION_CONFLICT`, as the Engine does.
 */
export const FolderOperationsSendFolderRevision: Story = {
  play: async ({ canvas, userEvent }) => {
    const sent = () => canvas.getByLabelText('Wysłana rewizja');
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: notes' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Zmień nazwę' }));
    const name = await canvas.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.clear(name);
    await userEvent.type(name, 'archive');
    await userEvent.keyboard('{Enter}');
    await expectToast('Zmieniono nazwę na archive');
    await expect(sent()).toHaveTextContent('folder:notes:1');

    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: notes' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Przenieś' }));
    await userEvent.click(within(document.body).getByRole('combobox', { name: 'Folder docelowy' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: '__root' }));
    await userEvent.click(within(document.body).getByRole('button', { name: 'Przenieś' }));
    await expectToast('Przeniesiono notes');
    await expect(sent()).toHaveTextContent('folder:notes:1');

    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: __root' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Usuń' }));
    await userEvent.click(
      within(within(document.body).getByRole('alertdialog')).getByRole('button', { name: 'Usuń' }),
    );
    await expectToast('Usunięto __root');
    await expect(sent()).toHaveTextContent('folder:__root:1');
  },
};

/**
 * A running operation is a small spinner in the tree's root header once it takes a while (never a
 * text line under the tree); it goes as soon as the operation ends.
 */
export const SlowOperationShowsASpinnerInTheRootHeader: Story = {
  render: () => <Fixture slowMs={1500} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const spinner = () => canvasElement.querySelector('[data-testid="documents-tree-busy"]');
    await expect(spinner()).toBeNull();
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: notes' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Usuń' }));
    await userEvent.click(
      within(within(document.body).getByRole('alertdialog')).getByRole('button', { name: 'Usuń' }),
    );
    // The confirmation may still hide the page from the accessibility tree while it closes.
    const header = canvas.getByRole('heading', { name: 'Dokumenty specyfikacji', hidden: true });
    await waitFor(() => expect(header.parentElement!.contains(spinner())).toBe(true));
    await expect(canvas.queryByText('Przetwarzanie…')).toBeNull();
    // The confirmation stays (busy) until the operation ends, then the result is a toast.
    await waitFor(() => expect(within(document.body).queryByRole('alertdialog')).toBeNull(), {
      timeout: 5000,
    });
    await expectToast('Usunięto notes');
    await waitFor(() => expect(spinner()).toBeNull());
  },
};

/**
 * A rename that changes only the letter case, refused by a case-insensitive file system: the reason
 * is in the rename field and the typed name stays; nothing suggests a refresh.
 */
export const CaseOnlyRenameIsExplainedInTheField: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: decisions.md' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Zmień nazwę' }));
    const name = await canvas.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Decisions.md');
    await userEvent.keyboard('{Enter}');
    const alert = await within(document.body).findByRole('alert');
    await expect(alert).toHaveTextContent(
      'Zmiana samej wielkości liter nie jest obsługiwana na tym systemie plików.',
    );
    await expect(alert).not.toHaveTextContent(/odśwież/i);
    await expect(name).toHaveValue('Decisions.md');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
  },
};

/** Rename and delete confirm with a toast; nothing is left as a status line under the tree. */
export const OperationResultsAreToasts: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: decisions.md' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Zmień nazwę' }));
    const name = await canvas.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.clear(name);
    await userEvent.type(name, 'choices.md');
    await userEvent.keyboard('{Enter}');
    await expectToast('Zmieniono nazwę na choices.md');
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: choices.md' }));
    await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Usuń' }));
    await userEvent.click(
      within(within(document.body).getByRole('alertdialog')).getByRole('button', { name: 'Usuń' }),
    );
    // The latest result replaces the previous toast.
    await expectToast('Usunięto choices.md');
    await expect(within(document.body).queryByText('Zmieniono nazwę na choices.md')).toBeNull();
    // No status line under the tree repeats the result.
    await expect(
      canvas.queryAllByRole('status').filter((node) => node.textContent?.includes('Usunięto')),
    ).toHaveLength(0);
  },
};
const nestedTree: Tree = documentTreeFixture({
  folders: ['guides', 'guides/onboarding', 'empty-folder'],
  documents: [
    { id: 'specification', path: 'specification.md', protected: true, actions: protectedActions },
    { id: 'overview', path: 'guides/overview.md' },
    {
      id: 'onboarding-long',
      // A realistic type title (the default would repeat the long stem as the label).
      type: 'guide',
      path: 'guides/onboarding/a-very-long-descriptive-onboarding-guide-filename-for-connector-wrap-testing.md',
    },
  ],
});
const renderNested = (width: number, active?: string) => () => (
  <NotificationProvider>
    <div style={{ padding: 16, width, maxWidth: '100%' }}>
      <DocumentsExplorer
        tree={nestedTree}
        active={active}
        onSelect={() => undefined}
        onAdd={() => Promise.resolve()}
        onOperate={() => Promise.resolve()}
      />
    </div>
  </NotificationProvider>
);
/**
 * The compact explorer composition at depth: a nested folder chain (`guides` -> `guides/onboarding`),
 * a long filename that keeps most of the row, a required file among the root files, an empty folder
 * that only shows its hint after it is opened, and no selected row without an open document.
 */
async function verifyNestedExplorer(
  canvas: StoryContext['canvas'],
  userEvent: StoryContext['userEvent'],
) {
  const rowOf = (name: RegExp) => canvas.getByRole('button', { name }).parentElement!;
  const iconLeft = (name: RegExp, index = 0) =>
    canvas.getByRole('button', { name }).querySelectorAll('svg')[index]!.getBoundingClientRect()
      .left;
  // Folders start disclosed; the empty one is collapsed with no caption row.
  await expect(canvas.getByRole('button', { name: /^onboarding$/ })).toBeVisible();
  await expect(canvas.getByText(/connector-wrap-testing\.md/)).toBeVisible();
  await expect(canvas.queryByText(/Pusty folder|Folder jest pusty/)).not.toBeInTheDocument();
  // Hierarchy comes from the indent step, not from guide lines.
  for (const name of [/^guides$/, /^onboarding$/, /^specification\.md/]) {
    await expect(getComputedStyle(rowOf(name), '::before').content).toBe('none');
    await expect(getComputedStyle(rowOf(name), '::after').content).toBe('none');
  }

  // The main file (protected) leads, then folders A-Z, then files.
  const top = [...canvas.getAllByRole('list')[0]!.children].map(
    (li) => li.querySelector('button .truncate')!.textContent,
  );
  await expect(top).toEqual(['specification.md', 'empty-folder', 'guides']);
  // Chevron + folder icon + name columns align across levels.
  // The main file starts like a folder: its glyph in the chevron column, its name right after it,
  // where a folder's own icon starts.
  await expect(Math.abs(iconLeft(/^specification\.md/) - iconLeft(/^guides$/, 0))).toBeLessThan(1);
  const nameLeft = (name: RegExp) =>
    canvas.getByRole('button', { name }).querySelector('.truncate')!.getBoundingClientRect().left;
  await expect(Math.abs(nameLeft(/^specification\.md/) - iconLeft(/^guides$/, 1))).toBeLessThan(1);
  await expect(Math.abs(iconLeft(/^overview\.md/) - iconLeft(/^onboarding$/, 1))).toBeLessThan(1);
  // The deepest long name keeps more than half of its row.
  const long = canvas.getByRole('button', { name: /^a-very-long-descriptive/ });
  const name = within(long).getByText(/^a-very-long-descriptive/, { selector: '.truncate' });
  await expect(name.getBoundingClientRect().width).toBeGreaterThan(
    long.getBoundingClientRect().width / 2,
  );
  await expect(name.scrollWidth).toBeGreaterThanOrEqual(name.clientWidth);
  // The empty folder opens on request and shows a quiet, non-interactive hint.
  const empty = canvas.getByRole('button', { name: /^empty-folder$/ });
  await expect(empty).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(empty);
  const hint = canvas.getByText('Folder jest pusty. Dodaj plik lub folder z menu.');
  await expect(empty).toHaveAttribute('aria-describedby', hint.id);
  await expect(hint.querySelector('svg')).toBeNull();
  await expect(hint.closest('button')).toBeNull();
  await userEvent.click(empty);
  await expect(canvas.queryByText(/Folder jest pusty/)).not.toBeInTheDocument();
}

export const NestedExplorerDesktop: Story = {
  render: renderNested(1440),
  play: async ({ canvas, userEvent }) => {
    await verifyNestedExplorer(canvas, userEvent);
    // No document is open: nothing is selected, not even the required document.
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(0);
  },
};
export const NestedExplorerMobile: Story = {
  render: renderNested(390),
  play: async ({ canvas, userEvent }) => {
    await verifyNestedExplorer(canvas, userEvent);
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(0);
  },
};
export const NestedExplorerNarrowSelected: Story = {
  render: renderNested(480, 'onboarding-long'),
  play: async ({ canvas }) => {
    const current = canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current'));
    await expect(current).toHaveLength(1);
    await expect(current[0]).toHaveAccessibleName(/^a-very-long-descriptive/);
  },
};

export const MixedImportReasons: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.removeAttribute('accept');
    await userEvent.upload(input, [
      new File(['# Valid'], 'interview.md'),
      new File(['duplicate'], 'specification.md'),
      new File(['x'], 'sketch.pdf'),
      new File(['x'], '.hidden.md'),
      new File([new Uint8Array([255])], 'invalid.txt'),
      new File(['a'.repeat(200001)], 'large-text.txt'),
    ]);
    await expect(await canvas.findByText(/Wgrano pliki: 1/)).toHaveTextContent(
      'specification.md: ta ścieżka już istnieje',
    );
    await expect(canvas.getByText(/Wgrano pliki: 1/)).toHaveTextContent(
      'sketch.pdf: obsługiwane formaty to .md i .txt',
    );
    await expect(canvas.getByText(/Wgrano pliki: 1/)).toHaveTextContent(
      '.hidden.md: nazwa nie może zaczynać się od kropki',
    );
    await expect(canvas.queryByRole('button', { name: 'Ponów import' })).toBeNull();
    await expect(canvas.getByText(/Wgrano pliki: 1/)).toHaveTextContent(
      'invalid.txt: nie udało się odczytać tekstu UTF-8',
    );
    await expect(canvas.getByText(/Wgrano pliki: 1/)).toHaveTextContent(
      'large-text.txt: treść przekracza 200 000 znaków',
    );
  },
};
