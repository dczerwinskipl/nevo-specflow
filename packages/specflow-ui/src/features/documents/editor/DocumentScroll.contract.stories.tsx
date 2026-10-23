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
};

function Header() {
  const { actions, dirty } = documentHeaderModel(useDocumentEditor(), useTranslation().t);
  return (
    <WorkspaceHeader
      title="dokument"
      actions={actions}
      menu="complete"
      labels={{ moreActions: 'Więcej akcji' }}
      status={dirty ? <span role="status">Niezapisane zmiany</span> : undefined}
    />
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
      documentsApi: { ...base.documentsApi, save: () => Promise.resolve({ revision: '2' }) },
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
                document={{
                  id: source.id,
                  title: source.filename,
                  filename: source.filename,
                  content: source.content,
                  revision: '1',
                }}
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
    if (!editorOf(canvasElement)) throw new Error('Editor pending');
  });
  await frames();
  return view;
}
async function waitForPreview(canvasElement: HTMLElement) {
  await waitFor(() => {
    if (!previewOf(canvasElement)?.querySelector('[data-source-line]'))
      throw new Error('Preview pending');
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
    ).toEqual(['Edytuj dokument', 'Pokaż ścieżkę']);
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
    await expect(canvas.getByRole('status')).toHaveTextContent('Niezapisane zmiany');
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await waitForPreview(canvasElement);
    await waitFor(() =>
      expect(Math.abs(previewTopLine(canvasElement).line! - entered)).toBeLessThanOrEqual(2),
    );
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const again = await openEditorOnly(canvasElement);
    await waitFor(() => expect(Math.abs(editorTopLine(again) - entered)).toBeLessThanOrEqual(1));
    await expect(again.state.doc.toString()).toContain('ZMIANA');
    await expect(canvas.getByRole('status')).toHaveTextContent('Niezapisane zmiany');
  },
};
async function openEditorOnly(root: HTMLElement) {
  await waitFor(() => {
    if (!editorOf(root)) throw new Error('Editor pending');
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
    const entered = editorTopLine(view);
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
    const entered = editorTopLine(view);
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
