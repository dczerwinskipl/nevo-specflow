import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import type { DocumentTree as Tree } from '@nevo/specflow-contracts/documents';
import { useState } from 'react';
import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, fn, spyOn, waitFor, within } from 'storybook/test';
import { HttpClientError } from '@nevo/http-client';
import { TooltipProvider } from '@nevo/ui';
import { DocumentsExplorer, type DocumentOperation } from './DocumentsExplorer';
import type { PlannedDocument } from './documentTreePolicy';
import { withLocale } from '../../../i18n/StoryLocalization';

/*
 * Document tree explorer contract: no root row, natural order (folders A-Z, then files A-Z; the required
 * document is only marked, never pinned), compact single-line rows with a reserved menu slot, per-node
 * menus with one wrapped reason, an empty folder that is a plain row with a hint only when opened, the
 * opened document as the only selected row, inline create/rename with Polish validation. The
 * runtime/Engine is replaced by spies.
 */

const protectedActions = {
  rename: { available: false, reason: 'protected' },
  move: { available: false, reason: 'protected' },
  delete: { available: false, reason: 'protected' },
  classify: { available: false },
} as const;
const blocked = { available: false, reason: 'branch-protected' } as const;
const readOnly = { rename: blocked, move: blocked, delete: blocked };
const adr =
  'architektura/decyzje/adr-001-deterministyczna-admisja-zadan-i-granice-wykonania-agentow.md';

/** The protected overview sits among the root files by name: importance never reorders the tree. */
const tree: Tree = documentTreeFixture({
  folders: ['notatki', 'architektura', 'architektura/decyzje'],
  documents: [
    { id: 'adr', path: adr },
    { id: 'ctx', path: 'architektura/kontekst-systemu.md' },
    { id: 'zeta', path: 'zeta.md' },
    { id: 'alfa', path: 'alfa.txt' },
    { id: 'spec', path: 'specification.md', protected: true, actions: protectedActions },
  ],
});
const readOnlyTree: Tree = {
  ...tree,
  folders: tree.folders.map((folder) => ({ ...folder, actions: readOnly })),
  documents: tree.documents.map((item) => ({
    ...item,
    actions: { ...readOnly, classify: { available: false } },
  })),
  capabilities: {
    createFile: blocked,
    createFolder: blocked,
    import: blocked,
    classify: blocked,
    formats: ['md', 'txt'],
  },
};

interface Props {
  tree?: Tree;
  width?: number;
  onAdd?: (documents: PlannedDocument[], folders?: string[]) => Promise<void>;
  onOperate?: (operation: DocumentOperation) => Promise<void>;
  active?: string;
  onSelect?: (id: string) => void;
}
function Fixture({
  tree: value = tree,
  width = 360,
  onAdd = () => Promise.resolve(),
  onOperate = () => Promise.resolve(),
  active = 'ctx',
  onSelect,
}: Props) {
  const [current, setCurrent] = useState(active);
  return (
    <TooltipProvider>
      <div style={{ width, padding: 8 }}>
        <DocumentsExplorer
          tree={value}
          active={current}
          onSelect={(id) => {
            setCurrent(id);
            onSelect?.(id);
          }}
          onAdd={onAdd}
          onOperate={onOperate}
        />
        <output aria-label="Aktywny dokument">{current}</output>
      </div>
    </TooltipProvider>
  );
}

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Contracts/Document tree explorer',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const rect = (element: Element) => element.getBoundingClientRect();
const rowOf = (element: Element) => element.closest('li')!.firstElementChild as HTMLElement;

export const NoRootRowAndNaturalOrder: Story = {
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('button', { name: /^specification\.md/ });
    // No redundant root row and no root menu: those live in the header.
    await expect(canvas.queryByRole('button', { name: /^Dokumenty$/ })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /Akcje: Dokumenty/ }),
    ).not.toBeInTheDocument();
    const topLevel = [...canvasElement.querySelector('ul')!.children].map((li) =>
      li.querySelector('button')!.textContent.replace('Wymagany', ''),
    );
    // Folders A-Z, then files A-Z; the required file stays among its siblings by name.
    await expect(topLevel).toEqual([
      'architektura',
      'notatki',
      'alfa.txt',
      'specification.md',
      'zeta.md',
    ]);
    // Top-level rows start at the container edge, and no row draws a guide line.
    const first = rect(canvas.getByRole('button', { name: /^architektura$/ }));
    await expect(first.left - rect(canvasElement.firstElementChild!).left).toBeLessThan(16);
    for (const name of [/^architektura$/, /^specification/, /^notatki$/, /^decyzje$/]) {
      const row = rowOf(canvas.getByRole('button', { name }));
      await expect(getComputedStyle(row, '::after').content).toBe('none');
      await expect(getComputedStyle(row, '::before').content).toBe('none');
    }
    // Rows are compact (one control height) and sit flush against each other.
    const folder = rect(canvas.getByRole('button', { name: /^architektura$/ }));
    const nested = rect(canvas.getByRole('button', { name: /^decyzje$/ }));
    await expect(folder.height).toBeLessThanOrEqual(33);
    await expect(nested.top - folder.bottom).toBeLessThanOrEqual(1);
  },
};

export const SingleLineRowsWithQuietRequiredMarker: Story = {
  play: async ({ canvas }) => {
    const longName = adr.split('/').at(-1)!;
    const longButton = await canvas.findByRole('button', { name: longName });
    const shortButton = canvas.getByRole('button', { name: /^zeta\.md$/ });
    const label = within(longButton).getByText(longName);
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(getComputedStyle(label).whiteSpace).toBe('nowrap');
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
    // Same rhythm for the 62 character name and a short one.
    await expect(rect(longButton).height).toBe(rect(shortButton).height);
    // The required row (badge) has the same height as the others.
    await expect(rect(canvas.getByRole('button', { name: /^specification\.md/ })).height).toBe(
      rect(shortButton).height,
    );
    // The full name stays in the DOM (accessible name) while the badge is a sibling of the label.
    await expect(longButton).toHaveAccessibleName(longName);
    const requiredButton = canvas.getByRole('button', { name: /^specification\.md/ });
    const badge = within(requiredButton).getByText('Wymagany');
    await expect(getComputedStyle(badge).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(label.contains(badge)).toBe(false);
    await expect(within(requiredButton).getByText('specification.md').contains(badge)).toBe(false);
    await expect(rect(badge).left).toBeGreaterThan(
      rect(within(requiredButton).getByText('specification.md')).right - 1,
    );
  },
};

export const TooltipOnlyForClippedNames: Story = {
  play: async ({ canvas, userEvent }) => {
    const longName = adr.split('/').at(-1)!;
    await userEvent.hover(await canvas.findByRole('button', { name: /^zeta\.md$/ }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(within(document.body).queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.unhover(canvas.getByRole('button', { name: /^zeta\.md$/ }));
    await userEvent.hover(canvas.getByRole('button', { name: longName }));
    await expect(
      await within(document.body).findByRole('tooltip', {}, { timeout: 3000 }),
    ).toHaveTextContent(longName);
  },
};

export const MenuSlotIsReservedAndRevealed: Story = {
  play: async ({ canvas }) => {
    const item = await canvas.findByRole('button', { name: /^zeta\.md$/ });
    const menu = canvas.getByRole('button', { name: 'Akcje: zeta.md' });
    const label = within(item).getByText('zeta.md');
    const atRest = rect(label).width;
    await expect(getComputedStyle(menu).opacity).toBe('0');
    await expect(rect(menu).width).toBeGreaterThan(0);
    // CSS :hover needs a real pointer; that reveal is verified on the real app (Playwright).
    // Still reachable by keyboard: focus reveals it.
    menu.focus();
    await waitFor(() => expect(getComputedStyle(menu).opacity).toBe('1'));
    await expect(rect(label).width).toBe(atRest);
    // The selected row keeps its slot visible.
    await expect(
      getComputedStyle(canvas.getByRole('button', { name: 'Akcje: kontekst-systemu.md' })).opacity,
    ).toBe('1');
  },
};

export const EmptyFolderIsAPlainRowWithAHintWhenOpened: Story = {
  play: async ({ canvas, userEvent }) => {
    const folder = await canvas.findByRole('button', { name: /^notatki$/ });
    // No permanent caption row: an empty folder is just a collapsed folder row.
    await expect(canvas.queryByText(/Pusty folder|Folder jest pusty/)).not.toBeInTheDocument();
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(folder);
    const hint = canvas.getByText('Folder jest pusty. Dodaj plik lub folder z menu.');
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(folder).toHaveAttribute('aria-describedby', hint.id);
    // A quiet inline hint, not a tree item: no icon, no button, no list item of its own.
    await expect(hint.querySelector('svg')).toBeNull();
    await expect(hint.closest('button')).toBeNull();
    await expect(hint.tabIndex).toBeLessThan(0);
    await expect(hint.closest('li')).toBe(folder.closest('li'));
    await expect(hint.parentElement?.tagName).not.toBe('UL');
    // Aligned to the folder name column.
    const folderLabel = within(folder).getByText('notatki');
    const range = document.createRange();
    range.selectNodeContents(hint);
    await expect(
      Math.abs(range.getBoundingClientRect().left - rect(folderLabel).left),
    ).toBeLessThanOrEqual(2);
    await expect(hint).toHaveClass('text-content-muted');
    await userEvent.click(folder);
    await expect(canvas.queryByText(/Folder jest pusty/)).not.toBeInTheDocument();
  },
};

export const HintDisappearsOnceSomethingIsAdded: Story = {
  args: { onAdd: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent }) => {
    const folder = await canvas.findByRole('button', { name: /^notatki$/ });
    await userEvent.click(folder);
    await expect(canvas.getByText(/Folder jest pusty/)).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'Akcje: notatki' }));
    await userEvent.click(
      within(await within(document.body).findByRole('menu')).getByRole('menuitem', {
        name: 'Nowy plik',
      }),
    );
    await canvas.findByRole('textbox', { name: 'Nazwa nowego pliku' });
    // While the name is typed the folder is open with its new child, without the hint.
    await expect(canvas.queryByText(/Folder jest pusty/)).not.toBeInTheDocument();
  },
};

export const NoDocumentOpenMeansNoSelectedRow: Story = {
  args: { active: '' },
  play: async ({ canvas }) => {
    await canvas.findByRole('button', { name: /^specification\.md/ });
    // The required document is marked, not selected, until it is actually open.
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(0);
  },
};

export const OnlyTheOpenedDocumentIsSelected: Story = {
  args: { active: 'spec' },
  play: async ({ canvas }) => {
    const required = await canvas.findByRole('button', { name: /^specification\.md/ });
    await expect(required).toHaveAttribute('aria-current', 'true');
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(1);
  },
};

async function openMenu(
  canvas: StoryContext['canvas'],
  userEvent: StoryContext['userEvent'],
  name: string,
) {
  await userEvent.click(await canvas.findByRole('button', { name: `Akcje: ${name}` }));
  return within(await within(document.body).findByRole('menu'));
}

export const MenusPerNodeType: Story = {
  play: async ({ canvas, userEvent }) => {
    // Folder: creation + file operations, nothing hidden.
    const folder = await openMenu(canvas, userEvent, 'architektura');
    await expect(folder.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Nowy plik',
      'Nowy folder',
      'Wgraj pliki',
      'Zmień nazwę',
      'Przenieś',
      'Usuń',
    ]);
    await expect(folder.queryByText(/niedostępne|wymagany/i)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // File: no creation entries (they do not apply) and no "Open": the row itself opens it.
    const file = await openMenu(canvas, userEvent, 'zeta.md');
    await expect(file.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Zmień nazwę',
      'Przenieś',
      'Usuń',
    ]);
    await userEvent.keyboard('{Escape}');
    // Required: policy-blocked actions stay visible but disabled, one wrapped reason.
    const requiredMenu = await openMenu(canvas, userEvent, 'specification.md');
    for (const name of ['Zmień nazwę', 'Przenieś', 'Usuń'])
      await expect(requiredMenu.getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    await expect(requiredMenu.queryByRole('menuitem', { name: 'Otwórz' })).not.toBeInTheDocument();
    const note = requiredMenu.getByText(/Dokument wymagany przez workflow/);
    await expect(within(document.body).getByRole('menu')).toHaveAttribute(
      'aria-describedby',
      note.id,
    );
    await expect(requiredMenu.getAllByText(/wymagany/i)).toHaveLength(1);
    // The reason wraps: it is taller than a single line and not clipped.
    await expect(note.scrollWidth).toBeLessThanOrEqual(note.clientWidth + 1);
    await expect(note.getBoundingClientRect().height).toBeGreaterThan(24);
  },
};

export const ReadOnlyExplainsOnceInTheMenu: Story = {
  args: { tree: readOnlyTree },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText(/Ta operacja jest niedostępna/)).toBeVisible();
    const menu = await openMenu(canvas, userEvent, 'architektura');
    for (const name of [
      'Nowy plik',
      'Nowy folder',
      'Wgraj pliki',
      'Zmień nazwę',
      'Przenieś',
      'Usuń',
    ])
      await expect(menu.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    await expect(menu.getAllByText(/Ta operacja jest niedostępna/)).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    // The row stays openable.
    await expect(canvas.getByRole('button', { name: /^zeta\.md$/ })).toBeEnabled();
  },
};

export const SelectionExpandAndFocusAreSeparate: Story = {
  args: { onSelect: fn() },
  play: async ({ canvas, userEvent, args }) => {
    const current = await canvas.findByRole('button', { name: /^kontekst-systemu\.md$/ });
    await expect(current).toHaveAttribute('aria-current', 'true');
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(1);
    // Collapsing and expanding folders never selects or deselects.
    await userEvent.click(canvas.getByRole('button', { name: /^architektura$/ }));
    await expect(args.onSelect).not.toHaveBeenCalled();
    await expect(canvas.getByLabelText('Aktywny dokument')).toHaveTextContent('ctx');
    await userEvent.click(canvas.getByRole('button', { name: /^architektura$/ }));
    await expect(
      await canvas.findByRole('button', { name: /^kontekst-systemu\.md$/ }),
    ).toHaveAttribute('aria-current', 'true');
    // Focus alone does not select.
    canvas.getByRole('button', { name: /^zeta\.md$/ }).focus();
    await expect(canvas.getByRole('button', { name: /^zeta\.md$/ })).not.toHaveAttribute(
      'aria-current',
    );
    await userEvent.click(canvas.getByRole('button', { name: /^zeta\.md$/ }));
    await expect(args.onSelect).toHaveBeenCalledWith('zeta');
    await expect(
      canvas.getAllByRole('button').filter((b) => b.hasAttribute('aria-current')),
    ).toHaveLength(1);
  },
};

async function startFile(
  canvas: StoryContext['canvas'],
  userEvent: StoryContext['userEvent'],
  folder = 'architektura',
) {
  const menu = await openMenu(canvas, userEvent, folder);
  await userEvent.click(menu.getByRole('menuitem', { name: 'Nowy plik' }));
  return canvas.findByRole('textbox', { name: 'Nazwa nowego pliku' });
}

export const InlineCreateValidationAndExtension: Story = {
  args: { onAdd: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    // Invalid characters: Polish message, value and focus kept, the Engine is not called.
    const input = await startFile(canvas, userEvent);
    await userEvent.type(input, 'a/b{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Nazwa nie może zawierać znaków \\ / : * ? " < > |',
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveValue('a/b');
    await expect(input.getAttribute('aria-describedby')).toBe(canvas.getByRole('alert').id);
    await expect(args.onAdd).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, 'a.pdf{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Obsługiwane formaty to .md i .txt.',
    );
    // No extension -> .md; Enter commits.
    await userEvent.clear(input);
    await userEvent.type(input, 'notes{Enter}');
    await waitFor(() =>
      expect(args.onAdd).toHaveBeenCalledWith(
        [{ path: 'architektura/notes.md', title: 'notes', content: '' }],
        [],
      ),
    );
  },
};

export const InlineCancelEmptyAndBlur: Story = {
  args: { onAdd: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    // Escape cancels and returns focus to the source folder.
    await startFile(canvas, userEvent);
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /^architektura$/ })).toHaveFocus(),
    );
    // An empty name creates nothing.
    await startFile(canvas, userEvent);
    await userEvent.keyboard('   {Enter}');
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
    await expect(args.onAdd).not.toHaveBeenCalled();
    // Blur with a non-empty name commits instead of losing it.
    const input = await startFile(canvas, userEvent);
    await userEvent.type(input, 'kept');
    await userEvent.click(canvas.getByLabelText('Aktywny dokument'));
    await waitFor(() =>
      expect(args.onAdd).toHaveBeenCalledWith(
        [{ path: 'architektura/kept.md', title: 'kept', content: '' }],
        [],
      ),
    );
  },
};

export const WindowBlurKeepsTheTypedName: Story = {
  args: { onAdd: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    const input = await startFile(canvas, userEvent);
    await userEvent.type(input, 'notat');
    // Alt-tab: the input blurs while the document no longer has focus.
    const hasFocus = spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      input.blur();
      await new Promise((resolve) => setTimeout(resolve, 150));
      await expect(args.onAdd).not.toHaveBeenCalled();
      await expect(canvas.getByRole('textbox')).toHaveValue('notat');
    } finally {
      hasFocus.mockRestore();
    }
    // Back in the window, Enter still commits.
    canvas.getByRole('textbox').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(args.onAdd).toHaveBeenCalledWith(
        [{ path: 'architektura/notat.md', title: 'notat', content: '' }],
        [],
      ),
    );
  },
};

const conflict = () =>
  Promise.reject(
    new HttpClientError('Conflict', {
      kind: 'http',
      status: 409,
      data: { error: 'demo_document_path_conflict' },
    }),
  );
export const FailedCreateKeepsTheTypedName: Story = {
  args: { onAdd: fn(conflict) },
  play: async ({ canvas, userEvent }) => {
    const input = await startFile(canvas, userEvent);
    await userEvent.type(input, 'duplicate{Enter}');
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Ta ścieżka już istnieje');
    await expect(input).toHaveValue('duplicate');
    await expect(input).toBeEnabled();
    await expect(input).toHaveFocus();
  },
};

export const RenameKeepsTheExtensionAndShowsTheFullName: Story = {
  args: { onOperate: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    const menu = await openMenu(canvas, userEvent, 'alfa.txt');
    await userEvent.click(menu.getByRole('menuitem', { name: 'Zmień nazwę' }));
    const input = await canvas.findByRole<HTMLInputElement>('textbox', { name: 'Nowa nazwa' });
    await expect(input).toHaveValue('alfa.txt');
    // The stem is selected so typing keeps the extension; the input is not ellipsised.
    await waitFor(() => expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]));
    await expect(getComputedStyle(input).textOverflow).not.toBe('ellipsis');
    await userEvent.keyboard('beta{Enter}');
    await waitFor(() =>
      expect(args.onOperate).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'rename', documentId: 'alfa', name: 'beta.txt' }),
      ),
    );
  },
};

export const RenameToTheSameNameIsACancel: Story = {
  args: { onOperate: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    const menu = await openMenu(canvas, userEvent, 'alfa.txt');
    await userEvent.click(menu.getByRole('menuitem', { name: 'Zmień nazwę' }));
    await canvas.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvas.queryByRole('textbox')).not.toBeInTheDocument());
    await expect(args.onOperate).not.toHaveBeenCalled();
  },
};

export const RenameWithoutExtensionUsesTheCurrentOne: Story = {
  args: { onOperate: fn(() => Promise.resolve()) },
  play: async ({ canvas, userEvent, args }) => {
    const menu = await openMenu(canvas, userEvent, 'alfa.txt');
    await userEvent.click(menu.getByRole('menuitem', { name: 'Zmień nazwę' }));
    const input = await canvas.findByRole('textbox', { name: 'Nowa nazwa' });
    await userEvent.clear(input);
    await userEvent.type(input, 'gamma{Enter}');
    await waitFor(() =>
      expect(args.onOperate).toHaveBeenCalledWith(expect.objectContaining({ name: 'gamma.txt' })),
    );
  },
};
