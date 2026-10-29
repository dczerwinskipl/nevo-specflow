import {
  documentContentFixture,
  saveResultFixture,
} from '../../../../test-support/documents/fixtures';
import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EditorView } from '@codemirror/view';
import { expect, fn, waitFor, within } from 'storybook/test';
import { Button, WorkspaceHeader } from '@nevo/ui';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { invokeDocumentAction } from './documentHeaderActions.stories-support';
import { DocumentEditor } from './DocumentEditor';
import { DocumentEditorProvider, useDocumentEditor } from './DocumentEditorProvider';
import { documentHeaderModel } from './documentHeaderModel';
import { readPreviewAnchor } from './previewScroll';
import { OutlineButton } from '../outline/OutlineButton';
import { withLocale } from '../../../i18n/StoryLocalization';
import { useTranslation } from 'react-i18next';

/*
 * Contract of the document Edit/Preview toggle (header) and of the shared reading position (S1-S11).
 * The fixture is a real DocumentEditorProvider + DocumentEditor + WorkspaceHeader, so the DS
 * resolves the wide/narrow header from the measured frame width.
 */

const sections = Array.from({ length: 16 }, (_, index) => index + 1);
const codeLines = Array.from({ length: 40 }, (_, index) => `const value${index} = ${index};`);
const longMarkdown = [
  '# Długi dokument',
  '',
  ...sections.flatMap((section) => [
    `## Sekcja ${section}`,
    '',
    `Akapit otwierający sekcję ${section}. `.repeat(6),
    '',
    `Drugi akapit sekcji ${section}, który zawija się w wąskim panelu i zajmuje kilka linii podglądu. `.repeat(
      3,
    ),
    '',
    ...Array.from({ length: 8 }, (_, index) => [
      `Punkt ${index + 1} sekcji ${section}.`,
      '',
    ]).flat(),
    ...(section === 5
      ? ['| Kolumna | Wartość |', '| --- | --- |', '| a | 1 |', '| b | 2 |', '| c | 3 |', '']
      : []),
    ...(section === 8 ? ['```ts', ...codeLines, '```', ''] : []),
    ...(section === 11 ? ['- punkt pierwszy', '- punkt drugi', '- punkt trzeci', ''] : []),
  ]),
].join('\n');
const textDocument = Array.from(
  { length: 160 },
  (_, index) => `Linia ${index + 1} dokumentu tekstowego bez mapy źródła.`,
).join('\n');

interface Source {
  id: string;
  filename: string;
  content: string;
}
const documents: Record<string, Source> = {
  a: { id: 'a', filename: 'a.md', content: longMarkdown },
  b: {
    id: 'b',
    filename: 'b.md',
    content: sections.map((s) => `## B ${s}\n\nTreść B ${s}.\n`).join('\n'),
  },
  txt: { id: 'txt', filename: 'notes.txt', content: textDocument },
  tail: {
    id: 'tail',
    filename: 'tail.md',
    content: [
      '# Dokument z krótkim ogonem',
      '',
      ...Array.from({ length: 30 }, (_, index) => `Akapit wypełniający numer ${index + 1}.\n`),
      '## Przedostatnia',
      '',
      'Krótko.',
      '',
      '## Ostatnia',
      '',
      'Krótko.',
    ].join('\n'),
  },
  short: {
    id: 'short',
    filename: 'short.md',
    content: 'Krótki dokument bez nagłówków.\n\nDrugi akapit tego dokumentu.',
  },
  props: {
    id: 'props',
    filename: 'props.md',
    content: [
      '---',
      'title: Ocena',
      'owner: zespół',
      '---',
      '',
      'Dokument z samymi właściwościami.',
    ].join('\n'),
  },
  withProps: {
    id: 'withProps',
    filename: 'with-props.md',
    content: ['---', 'title: Ocena', 'owner: zespół', '---', '', longMarkdown].join('\n'),
  },
};

function Header() {
  const { actions, dirty } = documentHeaderModel(useDocumentEditor(), useTranslation().t);

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <WorkspaceHeader
          title="dokument"
          actions={actions}
          menu="complete"
          labels={{ moreActions: 'Więcej akcji' }}
          status={dirty ? <span role="status">Niezapisane zmiany</span> : undefined}
        />
      </div>
      <OutlineButton />
    </div>
  );
}

function Fixture({
  width = 900,
  height = 600,
  initial = 'a',
}: {
  width?: number;
  height?: number;
  initial?: string;
}) {
  const [active, setActive] = useState(initial);
  const [visible, setVisible] = useState(true);
  const client = useMemo(() => new QueryClient(), []);
  const services = useMemo(() => {
    const base = createSpecFlowAppServices();

    return {
      ...base,
      demoDocumentsApi: {
        ...base.demoDocumentsApi,
        save: () => Promise.resolve(saveResultFixture('2')),
      },
    };
  }, []);
  const source = documents[active]!;

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div className="flex gap-2 p-2">
            <Button onClick={() => setVisible((value) => !value)}>Zamknij panel</Button>
            {Object.keys(documents).map((id) => (
              <Button key={id} variant="secondary" onClick={() => setActive(id)}>
                {`Dokument ${id}`}
              </Button>
            ))}
          </div>
          <div
            data-testid="panel"
            style={{ width, height }}
            className="flex flex-col overflow-hidden border border-border-default"
          >
            {visible && (
              <DocumentEditorProvider
                specId="scroll"
                document={documentContentFixture({
                  id: source.id,
                  title: source.filename,
                  path: source.filename,
                  content: source.content,
                  revision: '1',
                })}
              >
                <div className="shrink-0 border-b border-border-subtle p-2">
                  <Header />
                </div>
                <div className="min-h-0 flex-1">
                  <DocumentEditor />
                </div>
              </DocumentEditorProvider>
            )}
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Contracts/Document edit-preview and position',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
type Play = Parameters<NonNullable<Story['play']>>[0];

const previewOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-document-preview]');
const previewTopLine = (root: HTMLElement, text = longMarkdown) =>
  readPreviewAnchor(previewOf(root)!, text.split('\n').length);
const editorOf = (root: HTMLElement) => {
  const element = root.querySelector<HTMLElement>('.cm-editor');

  return element ? EditorView.findFromDOM(element)! : undefined;
};

const editorTopLine = (view: EditorView) =>
  view.state.doc.lineAt(
    view.lineBlockAtHeight(Math.max(0, view.scrollDOM.scrollTop - view.documentPadding.top)).from,
  ).number;
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
/**
 * A measured value once the layout holds it: the same on three frames in a row. Right after a
 * scroll the editor may still be measuring lines it had estimated, so a single read is a race.
 */
async function settled(read: () => number): Promise<number> {
  let last = read();
  let same = 0;
  for (let frame = 0; frame < 120 && same < 3; frame++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const next = read();
    same = next === last ? same + 1 : 0;
    last = next;
  }

  if (same < 3) {
    throw new Error(`The position did not settle (last ${last})`);
  }

  return last;
}

/** Scrolls the source so that `line` is at the top, the way a user reaches it (measured, not estimated). */
async function scrollEditorToLine(view: EditorView, line: number) {
  view.scrollDOM.dispatchEvent(new Event('wheel'));
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'start' }),
  });
  await frames();
  view.scrollDOM.dispatchEvent(new Event('scroll'));
  await frames();
}

/** A wheel gesture followed by the scroll, as a user would do it. */
async function userScroll(element: HTMLElement, top: number) {
  element.dispatchEvent(new Event('wheel'));
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
  await frames();
}

async function openEditor({ canvas, canvasElement, userEvent }: Play) {
  await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
  const textbox = await canvas.findByRole('textbox', { name: /^Treść / });
  const view = EditorView.findFromDOM(textbox.closest('.cm-editor')!)!;
  await waitFor(() => {
    if (!editorOf(canvasElement)) {
      throw new Error('Editor pending');
    }
  });
  await frames();

  return view;
}

async function waitForPreview(canvasElement: HTMLElement) {
  await waitFor(() => {
    if (!previewOf(canvasElement)?.querySelector('[data-source-line]')) {
      throw new Error('Preview pending');
    }
  });
  await frames();
}

/** Header contract: exactly one mode action at a time, state-dependent, per header width. */
export const WideHeaderContract: Story = {
  args: { width: 900 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const edit = await canvas.findByRole('button', { name: 'Edytuj dokument' });
    await expect(canvas.queryByRole('button', { name: 'Pokaż podgląd' })).not.toBeInTheDocument();
    // An icon with a tooltip, not a text button.
    await expect(edit).toHaveTextContent('');
    await userEvent.hover(edit);
    await expect(
      await within(document.body).findByRole('tooltip', {}, { timeout: 3000 }),
    ).toHaveTextContent('Edytuj dokument');
    await userEvent.click(edit);
    await userEvent.unhover(edit);
    const preview = await canvas.findByRole('button', { name: 'Pokaż podgląd' });
    await expect(canvas.queryByRole('button', { name: 'Edytuj dokument' })).not.toBeInTheDocument();
    await expect(preview).toHaveTextContent('');
    // Save exists only while the draft differs.
    await expect(canvas.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument();
    const view = EditorView.findFromDOM(canvasElement.querySelector<HTMLElement>('.cm-editor')!)!;
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    await expect(await canvas.findByRole('button', { name: 'Zapisz' })).toBeVisible();
    // The complete menu lists every action once, promoted ones included.
    await userEvent.click(canvas.getByRole('button', { name: 'Więcej akcji' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Pokaż podgląd', 'ZapiszCtrl+S', 'Cofnij zmiany', 'Pokaż ścieżkę']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(preview);
    await expect(await canvas.findByRole('button', { name: 'Edytuj dokument' })).toBeVisible();
  },
};

export const NarrowHeaderContract: Story = {
  args: { width: 340 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    // View mode: the pencil is the single direct action (also on a narrow header).
    await expect(await canvas.findByRole('button', { name: 'Edytuj dokument' })).toBeVisible();
    // The complete menu repeats the promoted action and adds the path.
    await userEvent.click(canvas.getByRole('button', { name: 'Więcej akcji' }));
    await expect(
      within(await within(document.body).findByRole('menu'))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Spis treści', 'Edytuj dokument', 'Pokaż ścieżkę']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Edytuj dokument' }));
    // Edit mode, clean: the preview toggle keeps the slot.
    await expect(await canvas.findByRole('button', { name: 'Pokaż podgląd' })).toBeVisible();
    const view = EditorView.findFromDOM(canvasElement.querySelector<HTMLElement>('.cm-editor')!)!;
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    // Edit mode, dirty: Save replaces the toggle in the single direct slot; the toggle is in the menu.
    await expect(await canvas.findByRole('button', { name: 'Zapisz' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Pokaż podgląd' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Więcej akcji' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Pokaż podgląd', 'ZapiszCtrl+S', 'Cofnij zmiany', 'Pokaż ścieżkę']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pokaż podgląd' }));
    await expect(await canvas.findByRole('button', { name: 'Edytuj dokument' })).toBeVisible();
  },
};

/** S1 + S2: a preview scrolled to about 60% opens the editor at the same source line. */
export const PreviewPositionOpensEditorAtSameLine: Story = {
  play: async (context) => {
    const { canvasElement } = context;
    await waitForPreview(canvasElement);
    const preview = previewOf(canvasElement)!;
    await userScroll(preview, 0.6 * (preview.scrollHeight - preview.clientHeight));
    const read = previewTopLine(canvasElement);
    await expect(read.line).toBeGreaterThan(40);
    const view = await openEditor(context);
    await waitFor(() => expect(Math.abs(editorTopLine(view) - read.line!)).toBeLessThanOrEqual(1));
    // Not the proportional position: the source is much taller or shorter than the render.
    await expect(view.scrollDOM.scrollTop).toBeGreaterThan(0);
  },
};

/** S3 + S4: edit a few characters, toggle there and back: same fragment, draft kept, no jump. */
export const DirtyDraftKeepsPositionAcrossToggles: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    await waitForPreview(canvasElement);
    const preview = previewOf(canvasElement)!;
    await userScroll(preview, 0.4 * (preview.scrollHeight - preview.clientHeight));
    const view = await openEditor(context);
    const entered = editorTopLine(view);
    view.focus();
    await userEvent.keyboard('ZMIANA');
    await expect(canvas.getByText('Niezapisane zmiany')).toBeInTheDocument();
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await waitForPreview(canvasElement);
    await waitFor(() =>
      expect(Math.abs(previewTopLine(canvasElement).line! - entered)).toBeLessThanOrEqual(2),
    );
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const again = await openEditorOnly(canvasElement);
    await waitFor(() => expect(Math.abs(editorTopLine(again) - entered)).toBeLessThanOrEqual(1));
    await expect(again.state.doc.toString()).toContain('ZMIANA');
    await expect(canvas.getByText('Niezapisane zmiany')).toBeInTheDocument();
  },
};
async function openEditorOnly(root: HTMLElement) {
  await waitFor(() => {
    if (!editorOf(root)) {
      throw new Error('Editor pending');
    }
  });
  await frames();

  return editorOf(root)!;
}

/** S5: a 40 line code block (taller or shorter when rendered) maps by block and offset, not by proportion. */
export const CodeBlockMapsByBlockAndOffset: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const view = await openEditor(context);
    const fence = longMarkdown.split('\n').indexOf('```ts') + 1;
    const target = fence + 21;
    await scrollEditorToLine(view, target);
    await expect(Math.abs(editorTopLine(view) - target)).toBeLessThanOrEqual(1);
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await waitForPreview(canvasElement);
    const line = previewTopLine(canvasElement).line!;
    // Inside the code block, near its middle: neither the block start nor an unrelated proportion.
    await waitFor(() =>
      expect(Math.abs(previewTopLine(canvasElement).line! - target)).toBeLessThanOrEqual(4),
    );
    await expect(line).toBeGreaterThan(fence);
  },
};

/** S6: unsaved changes survive closing and reopening the panel; mode and position come back. */
export const CloseAndReopenRestoresModeAndPosition: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const view = await openEditor(context);
    await scrollEditorToLine(view, 120);
    const entered = await settled(() => editorTopLine(view));
    // Put the caret on the visible line so typing does not scroll the view.
    view.dispatch({ selection: { anchor: view.state.doc.line(entered + 2).from } });
    view.focus();
    await userEvent.keyboard('SZKIC');
    await frames();
    await userEvent.click(canvas.getByRole('button', { name: 'Zamknij panel' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Zamknij panel' }));
    const reopened = await openEditorOnly(canvasElement);
    await waitFor(() => expect(Math.abs(editorTopLine(reopened) - entered)).toBeLessThanOrEqual(1));
    await expect(reopened.state.doc.toString()).toContain('SZKIC');
  },
};

/** S7: A -> B -> A returns to the last position of A. */
export const SwitchingDocumentsRestoresLastPosition: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    const preview = previewOf(canvasElement)!;
    await userScroll(preview, 0.5 * (preview.scrollHeight - preview.clientHeight));
    const before = previewTopLine(canvasElement).line!;
    await userEvent.click(canvas.getByRole('button', { name: 'Dokument b' }));
    await canvas.findByRole('heading', { name: 'B 1' });
    await userEvent.click(canvas.getByRole('button', { name: 'Dokument a' }));
    await waitForPreview(canvasElement);
    await waitFor(() =>
      expect(Math.abs(previewTopLine(canvasElement).line! - before)).toBeLessThanOrEqual(1),
    );
  },
};

/**
 * S8: the mobile keyboard shrinks the visual viewport. Emulated by shrinking the panel and firing
 * the visualViewport resize: the anchor must not move, the toggle must not jump to the top and the
 * editor must stop holding the keyboard.
 */
export const MobileKeyboardDoesNotMoveTheAnchor: Story = {
  args: { width: 340, height: 620 },
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const view = await openEditor(context);
    await scrollEditorToLine(view, 200);
    const entered = await settled(() => editorTopLine(view));
    view.focus();
    // The keyboard takes the lower half of the screen.
    const panel = canvas.getByTestId('panel');
    panel.style.height = '300px';
    window.visualViewport?.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    await frames();
    // Layout shrank the scroller; the stored anchor is still the one the user left.
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await waitForPreview(canvasElement);
    panel.style.height = '620px';
    window.visualViewport?.dispatchEvent(new Event('resize'));
    await frames();
    await waitFor(() =>
      expect(Math.abs(previewTopLine(canvasElement).line! - entered)).toBeLessThanOrEqual(2),
    );
    await expect(previewOf(canvasElement)!.scrollTop).toBeGreaterThan(200);
    await expect(document.activeElement?.closest('.cm-editor') ?? null).toBeNull();
  },
};

/** S9: entering edit mode on a touch screen does not focus the editor (no keyboard, no jump). */
export const TouchEntryDoesNotFocusTheEditor: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes('pointer: coarse') ? { ...original(query), matches: true } : original(query);
    try {
      await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
      await openEditorOnly(canvasElement);
      await frames();
      await frames();
      await expect(document.activeElement?.closest('.cm-editor') ?? null).toBeNull();
      await expect(document.activeElement).toHaveAttribute('data-document-source');
    } finally {
      window.matchMedia = original;
    }
  },
};

/** S10: plain text has one view: it opens as the source editor, with no preview and no mode switch. */
export const PlainTextIsEditOnly: Story = {
  args: { initial: 'txt' },
  play: async ({ canvas, canvasElement }) => {
    const view = await openEditorOnly(canvasElement);
    await expect(view.state.doc.toString()).toBe(textDocument);
    await expect(previewOf(canvasElement)).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Edytuj dokument' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Pokaż podgląd' })).not.toBeInTheDocument();
  },
};

/** S11: lines removed far below the view before the toggle: the anchor is clamped, nothing throws. */
export const RemovedLinesClampTheAnchor: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const view = await openEditor(context);
    await scrollEditorToLine(view, 300);
    view.dispatch({ changes: { from: view.state.doc.line(60).from, to: view.state.doc.length } });
    await frames();
    const errors = fn();
    window.addEventListener('error', errors);
    try {
      await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
      await waitForPreview(canvasElement);
      await userEvent.click(await canvas.findByRole('button', { name: 'Edytuj dokument' }));
      const again = await openEditorOnly(canvasElement);
      await expect(editorTopLine(again)).toBeLessThanOrEqual(again.state.doc.lines);
      await expect(errors).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', errors);
    }
  },
};

/**
 * Wide panel (measured on the panel): the text keeps its 760 px measure, and the contents list and
 * the properties sit beside it, sticky, instead of folded above the text.
 */
export const WidePanelShowsContentsColumn: Story = {
  args: { width: 1400, height: 700, initial: 'withProps' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    const nav = await canvas.findByRole('navigation', { name: 'Spis treści' });
    const aside = nav.closest('aside')!;
    await expect(aside.querySelector('[data-document-properties]')).not.toBeNull();
    // No folded block: the list is directly visible and no data-source-line stands for line 1.
    await expect(aside.querySelector('[data-source-line]')).toBeNull();
    await expect(within(nav).getAllByRole('link').length).toBeGreaterThan(10);
    const text = canvasElement.querySelector<HTMLElement>('[data-source-line="6"]')!;
    const measure = text.parentElement!.getBoundingClientRect().width;
    await expect(measure).toBeLessThanOrEqual(761);
    const gap =
      nav.getBoundingClientRect().left - text.parentElement!.getBoundingClientRect().right;
    await expect(gap).toBeLessThan(80);
    // A click scrolls to the heading, marks it as current and keeps the panel position shared.
    const link = within(nav).getByRole('link', { name: 'Sekcja 9' });
    await userEvent.click(link);
    await waitFor(() => expect(previewOf(canvasElement)!.scrollTop).toBeGreaterThan(500));
    await waitFor(() => expect(link).toHaveAttribute('aria-current', 'location'));
    await expect(within(nav).getAllByRole('link', { current: 'location' })).toHaveLength(1);
    // The column stays in view while the text scrolls.
    await expect(nav.getBoundingClientRect().top).toBeLessThan(200);
  },
};

/**
 * A panel below the column threshold has no column and no inline box: the header icon opens the
 * contents as a sheet. Choosing a heading closes it, scrolls and focuses the heading; closing
 * without a choice returns focus to the icon.
 */
export const NarrowPanelOpensContentsAsSheet: Story = {
  args: { width: 800, height: 700, initial: 'withProps' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    await expect(canvasElement.querySelector('aside')).toBeNull();
    await expect(canvas.queryByRole('button', { name: /Spis treści/ })).toBeNull();
    // Properties stay one collapsed row in the flow.
    await expect(canvas.getByRole('button', { name: /Właściwości/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const icon = await canvas.findByRole('button', { name: 'Otwórz spis treści' });
    await userEvent.click(icon);
    const sheet = await within(document.body).findByRole('dialog', { name: 'Spis treści' });
    await expect(sheet).toBeVisible();
    // A compact tree of headings, like the file tree: the title alone (no file name under it),
    // the deeper level indented, normal weight everywhere, rows 32-36 px.
    await expect(within(sheet).queryByText('with-props.md')).toBeNull();
    const top = within(sheet).getByRole('link', { name: 'Długi dokument' });
    const section = within(sheet).getByRole('link', { name: 'Sekcja 1' });
    await expect(section.getBoundingClientRect().left).toBeGreaterThan(
      top.getBoundingClientRect().left + 8,
    );
    await expect(Number(getComputedStyle(top).fontWeight)).toBe(400);
    await expect(Number(getComputedStyle(section).fontWeight)).toBe(400);
    // The current section (the first at the top) is marked and holds focus.
    const current = within(sheet).getByRole('link', { current: 'location' });
    await waitFor(() => expect(current).toHaveFocus());
    // A quiet tint and a 2 px accent bar, not the selected-item block.
    const bar = getComputedStyle(current, '::before');
    await expect(bar.width).toBe('2px');
    await expect(bar.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    for (const link of within(sheet).getAllByRole('link')) {
      const height = link.getBoundingClientRect().height;
      await expect(height).toBeGreaterThanOrEqual(32);
      // Wrapped titles may take two lines; a single line stays one compact row.
      if (link.textContent.length < 20) {
        await expect(height).toBeLessThanOrEqual(36);
      }
    }

    await userEvent.click(within(sheet).getByRole('link', { name: 'Sekcja 3' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(previewOf(canvasElement)!.scrollTop).toBeGreaterThan(200));
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Sekcja 3'));
    // Closing without a choice gives focus back to the icon.
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz spis treści' }));
    await within(document.body).findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Otwórz spis treści' })).toHaveFocus(),
    );
  },
};

export const NarrowPanelMenuStartsWithContents: Story = {
  args: { width: 800, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Więcej akcji' }));
    const menu = await within(document.body).findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    await expect(items[0]).toHaveTextContent('Spis treści');
    await userEvent.click(items[0]!);
    await within(document.body).findByRole('dialog', { name: /Spis treści/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    // The menu item that opened the sheet is gone: focus lands on the header, not on the page body.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    // A clean start (no heading chosen before): focus is on the header, never inside the document.
    await expect(document.activeElement?.closest('[data-document-preview]') ?? null).toBeNull();
  },
};

export const EditingHidesTheContentsIcon: Story = {
  args: { width: 800, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    await canvas.findByRole('button', { name: 'Otwórz spis treści' });
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await waitFor(() =>
      expect(canvas.queryByRole('button', { name: 'Otwórz spis treści' })).toBeNull(),
    );
  },
};

/**
 * Wrap lines (Display group of the `...` menu) exists only with the source editor shown: on by
 * default on a narrow pane, a checked toggle that changes the editor in place and is kept in this
 * browser for that pane class.
 */
export const WrapLinesIsADisplayToggleOfTheSourceEditor: Story = {
  args: { width: 390, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    localStorage.removeItem('nevo-specflow.documents.wrapLines');
    await waitForPreview(canvasElement);
    const menuItem = async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Więcej akcji' }));

      return within(document.body).queryByRole('menuitemcheckbox', { name: 'Zawijaj wiersze' });
    };

    // Preview: nothing to wrap, no toggle.
    await expect(await menuItem()).toBeNull();
    await userEvent.keyboard('{Escape}');
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const scroller = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLElement>('.cm-scroller');
      if (!found) {
        throw new Error('No source editor yet');
      }

      return found;
    });
    await expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth + 1);
    const item = (await menuItem())!;
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(item);
    // Long lines now run on: the editor scrolls sideways instead of wrapping.
    await waitFor(() => expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth + 40));
    await expect(item.isConnected ? item : null).toBeNull();
    await expect(
      JSON.parse(localStorage.getItem('nevo-specflow.documents.wrapLines') ?? '{}'),
    ).toEqual({ narrow: false });
    await expect(await menuItem()).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard('{Escape}');
    localStorage.removeItem('nevo-specflow.documents.wrapLines');
  },
};

/**
 * The column threshold: 840 px of panel (measured on the panel, not the viewport). The text keeps
 * about 65 characters, the column is 28% of the panel, and nothing pushes the panel sideways (the
 * document has a table).
 */
export const ColumnAppearsAtThePanelThreshold: Story = {
  args: { width: 900, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement }) => {
    await waitForPreview(canvasElement);
    const nav = await canvas.findByRole('navigation', { name: 'Spis treści' });
    await expect(nav).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Otwórz spis treści' })).toBeNull();
    const text = canvasElement.querySelector<HTMLElement>('[data-source-line="1"]')!;
    await expect(text.getBoundingClientRect().width).toBeGreaterThanOrEqual(520);
    const panel = previewOf(canvasElement)!;
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
    // The column fits its own width: even the document title (the longest row) does not spread out.
    const aside = nav.closest('aside')!;
    await expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(
      aside.getBoundingClientRect().right + 1,
    );
    await expect(aside.getBoundingClientRect().right).toBeLessThanOrEqual(
      panel.getBoundingClientRect().right,
    );
  },
};

export const NoColumnJustBelowTheThreshold: Story = {
  args: { width: 820, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement }) => {
    await waitForPreview(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Otwórz spis treści' })).toBeVisible();
    await expect(canvasElement.querySelector('aside')).toBeNull();
  },
};

/** At the end of the document the last section is the current one, whether or not its heading reached the top. */
export const SheetMarksTheLastSectionAtTheEnd: Story = {
  args: { width: 800, height: 600, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Otwórz spis treści' }));
    let sheet = await within(document.body).findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('link', { name: 'Sekcja 16' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    const panel = previewOf(canvasElement)!;
    // The chosen heading is reached with a smooth scroll: wait for where it ends.
    await waitFor(
      () =>
        expect(panel.scrollTop + panel.clientHeight).toBeGreaterThanOrEqual(panel.scrollHeight - 2),
      { timeout: 4000 },
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz spis treści' }));
    sheet = await within(document.body).findByRole('dialog');
    await expect(within(sheet).getByRole('link', { current: 'location' })).toHaveTextContent(
      'Sekcja 16',
    );
    await userEvent.keyboard('{Escape}');
  },
};

/**
 * After a pointer the chosen heading takes focus without a ring (the browser still calls it
 * :focus-visible, so the marker carries the rule) and a short tint; after the keyboard the ring stays.
 */
export const ChosenHeadingHasNoFocusRingAfterAPointer: Story = {
  args: { width: 800, height: 600, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Otwórz spis treści' }));
    const sheet = await within(document.body).findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('link', { name: 'Sekcja 4' }));
    await waitFor(() => expect(document.activeElement?.tagName).toMatch(/^H[1-4]$/));
    const heading = document.activeElement as HTMLElement;
    await expect(heading).toHaveTextContent('Sekcja 4');
    await expect(heading).toHaveAttribute('data-quiet-focus');
    await expect(getComputedStyle(heading).outlineStyle).toBe('none');
  },
};

export const ChosenHeadingKeepsTheFocusRingAfterTheKeyboard: Story = {
  args: { width: 800, height: 600, initial: 'a' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    const icon = await canvas.findByRole('button', { name: 'Otwórz spis treści' });
    icon.focus();
    await userEvent.keyboard('{Enter}');
    const sheet = await within(document.body).findByRole('dialog');
    const current = within(sheet).getByRole('link', { current: 'location' });
    await waitFor(() => expect(current).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement?.tagName).toMatch(/^H[1-4]$/));
    await expect((document.activeElement as HTMLElement).matches(':focus-visible')).toBe(true);
  },
};

/** A heading the reader chose stays current until the next manual scroll, even when a short tail ends the page. */
export const ChosenSectionStaysCurrentUntilTheNextManualScroll: Story = {
  args: { width: 800, height: 400, initial: 'tail' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    const panel = previewOf(canvasElement)!;
    await userEvent.click(await canvas.findByRole('button', { name: 'Otwórz spis treści' }));
    let sheet = await within(document.body).findByRole('dialog');
    await userEvent.click(within(sheet).getByRole('link', { name: 'Przedostatnia' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    // The short tail cannot scroll the chosen heading to the top: the page is at its end.
    // The chosen heading is reached with a smooth scroll: wait for where it ends.
    await waitFor(
      () =>
        expect(panel.scrollTop + panel.clientHeight).toBeGreaterThanOrEqual(panel.scrollHeight - 2),
      { timeout: 4000 },
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz spis treści' }));
    sheet = await within(document.body).findByRole('dialog');
    await expect(within(sheet).getByRole('link', { current: 'location' })).toHaveTextContent(
      'Przedostatnia',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    // Reading on by hand hands the choice back to the position.
    panel.dispatchEvent(new Event('wheel'));
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz spis treści' }));
    sheet = await within(document.body).findByRole('dialog');
    await expect(within(sheet).getByRole('link', { current: 'location' })).toHaveTextContent(
      'Ostatnia',
    );
    await userEvent.keyboard('{Escape}');
  },
};

/** The properties are a plain row (no frame around empty space), 44 px of hit area, in the flow and in the column. */
export const PropertiesAreAPlainRowInTheFlow: Story = {
  args: { width: 800, height: 600, initial: 'withProps' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForPreview(canvasElement);
    const block = canvasElement.querySelector<HTMLElement>('[data-document-properties]')!;
    const style = getComputedStyle(block);
    await expect(style.borderLeftWidth).toBe('0px');
    await expect(style.borderTopWidth).toBe('0px');
    const trigger = canvas.getByRole('button', { name: /Właściwości/ });
    // The hit area is the design system one (a pseudo-element grown to the touch target size).
    await expect(getComputedStyle(trigger, '::after').position).toBe('absolute');
    await userEvent.click(trigger);
    await expect(await canvas.findByText('zespół')).toBeVisible();
    await expect(getComputedStyle(block).borderLeftWidth).toBe('0px');
  },
};

export const PropertiesRowInTheColumnAlignsWithTheFirstHeading: Story = {
  args: { width: 1400, height: 600, initial: 'withProps' },
  play: async ({ canvasElement }) => {
    await waitForPreview(canvasElement);
    const block = canvasElement.querySelector<HTMLElement>('aside [data-document-properties]')!;
    await expect(getComputedStyle(block).borderLeftWidth).toBe('0px');
    const heading = canvasElement.querySelector<HTMLElement>(':is(h1)[data-source-line="6"]')!;
    const delta = Math.abs(block.getBoundingClientRect().top - heading.getBoundingClientRect().top);
    await expect(delta).toBeLessThanOrEqual(4);
  },
};

export const ShortDocumentWithoutHeadingsReservesNoColumn: Story = {
  args: { width: 1400, height: 500, initial: 'short' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('Krótki dokument bez nagłówków.');
    await expect(canvas.queryByRole('button', { name: 'Otwórz spis treści' })).toBeNull();
    await expect(canvasElement.querySelector('aside')).toBeNull();
    await expect(canvas.queryByRole('navigation', { name: 'Spis treści' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: /Spis treści/ })).toBeNull();
  },
};

export const OnlyPropertiesStillUseTheColumn: Story = {
  args: { width: 1400, height: 500, initial: 'props' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('Dokument z samymi właściwościami.');
    const aside = canvasElement.querySelector('aside');
    await expect(aside).not.toBeNull();
    await expect(canvas.queryByRole('navigation', { name: 'Spis treści' })).toBeNull();
    await expect(aside!.querySelector('[data-document-properties]')).not.toBeNull();
  },
};

/** The panel of a 1440 px window (about 877 px) gets the column, with the text above 520 px. */
export const ColumnAtThePanelOfA1440Window: Story = {
  args: { width: 879, height: 700, initial: 'a' },
  play: async ({ canvas, canvasElement }) => {
    await waitForPreview(canvasElement);
    await canvas.findByRole('navigation', { name: 'Spis treści' });
    const text = canvasElement.querySelector<HTMLElement>('[data-source-line="1"]')!;
    await expect(text.getBoundingClientRect().width).toBeGreaterThanOrEqual(520);
    const panel = previewOf(canvasElement)!;
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
  },
};
