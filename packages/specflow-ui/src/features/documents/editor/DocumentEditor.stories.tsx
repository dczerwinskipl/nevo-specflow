import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { Button, WorkspaceHeader } from '@nevo/ui';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import type { DemoSaveInput } from '@nevo/specflow-contracts/demo';
import { invokeDocumentAction } from './documentHeaderActions.stories-support';
import { DocumentEditor } from './DocumentEditor';
import {
  DocumentEditorProvider,
  documentHeaderModel,
  useDocumentEditor,
} from './DocumentEditorProvider';
import { withLocale } from '../../../i18n/StoryLocalization';
import { useTranslation } from 'react-i18next';

/** Mirrors the workspace header: title, unsaved marker and the actions the workspace places. */
function DocumentHeader() {
  const { actions, dirty } = documentHeaderModel(useDocumentEditor(), useTranslation().t);
  return (
    <WorkspaceHeader
      title="specification.md"
      actions={actions}
      labels={{ moreActions: 'Więcej akcji' }}
      status={
        dirty ? (
          <span role="status">
            <span aria-hidden="true">•</span>
            <span className="sr-only">Niezapisane zmiany</span>
          </span>
        ) : undefined
      }
    />
  );
}
const record = {
  id: 'specification',
  title: 'Specification',
  filename: 'specification.md',
  content:
    '# Feature: Logowanie SSO\n\n## Problem\n\nPracownicy logują się przez firmowego dostawcę tożsamości.\n\n- Powrót do projektu\n\nUżyj `identity_token`.',
  revision: '1',
};
function EditorFixture({
  deferred = false,
  plainText = false,
  renameFormat = false,
  content,
}: {
  content?: string;
  deferred?: boolean;
  plainText?: boolean;
  renameFormat?: boolean;
}) {
  const [textFormat, setTextFormat] = useState(plainText);
  const [release, setRelease] = useState<(() => void) | null>(null);
  const client = useMemo(() => new QueryClient(), []);
  const services = useMemo(() => {
    const services = createSpecFlowAppServices();
    return {
      ...services,
      documentsApi: {
        ...services.documentsApi,
        save: (_spec: string, _document: string, _input: DemoSaveInput) =>
          deferred
            ? new Promise<{ revision: string }>((resolve) =>
                setRelease(() => () => {
                  resolve({ revision: '2' });
                  setRelease(null);
                }),
              )
            : Promise.resolve({ revision: '2' }),
      },
    };
  }, [deferred]);
  const [visible, setVisible] = useState(true);
  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div className="flex h-[650px] flex-col">
            <div className="shrink-0 p-2">
              <Button onClick={() => setVisible((v) => !v)}>
                {visible ? 'Zamknij panel' : 'Otwórz dokument'}
              </Button>
            </div>
            {renameFormat && (
              <Button onClick={() => setTextFormat((value) => !value)}>Zmień format</Button>
            )}
            {release && <Button onClick={release}>Potwierdź zapis</Button>}
            {visible && (
              <div className="min-h-0 flex-1">
                <DocumentEditorProvider
                  specId="sso"
                  document={
                    textFormat
                      ? { ...record, filename: 'CLIENT.TXT' }
                      : content === undefined
                        ? record
                        : { ...record, content }
                  }
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="shrink-0 border-b border-border-subtle p-2">
                      <DocumentHeader />
                    </div>
                    <div className="min-h-0 flex-1">
                      <DocumentEditor />
                    </div>
                  </div>
                </DocumentEditorProvider>
              </div>
            )}
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Contracts/Demo Markdown editor V4',
  component: EditorFixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EditorFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RetainedDraftAndGuard: Story = {
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const editor = canvas.getByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(editor);
    await userEvent.keyboard('{Control>}End{/Control}');
    await userEvent.type(editor, ' Retained draft');
    await expect(canvas.getByRole('status')).toHaveTextContent('Niezapisane zmiany');
    await userEvent.click(canvas.getByRole('button', { name: 'Zamknij panel' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz dokument' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'Retained draft',
    );
    await invokeDocumentAction(canvas, userEvent, 'Cofnij zmiany');
    // Unsaved changes is one AlertDialog: Continue (cancel), destructive Discard, primary Save.
    const dialog = within(document.body).getByRole('alertdialog');
    await expect(dialog).toHaveTextContent('Niezapisane zmiany');
    await expect(within(dialog).getByRole('button', { name: 'Odrzuć zmiany' })).toHaveClass(
      'text-action-danger',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kontynuuj edycję' }));
    await expect(canvas.getByRole('textbox')).toHaveTextContent('Retained draft');
    await invokeDocumentAction(canvas, userEvent, 'Cofnij zmiany');
    await userEvent.click(within(document.body).getByRole('button', { name: 'Odrzuć zmiany' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Zapisz$/ })).toBeDisabled();
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};
export const KeyboardSave: Story = {
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const editor = canvas.getByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(editor);
    await userEvent.type(editor, 'New source');
    const beforeTab = editor.textContent;
    await userEvent.keyboard('{Tab}');
    await expect(editor.textContent).toBe(beforeTab);
    // Focus leaves the editor asynchronously with the Tab default action.
    await waitFor(() => expect(editor).not.toHaveFocus(), { timeout: 5000 });
    await userEvent.click(editor);
    await userEvent.keyboard('x');
    await userEvent.keyboard('{Control>}z{/Control}');
    await expect(editor.textContent).toBe(beforeTab);
    await userEvent.keyboard('{Control>}s{/Control}');
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Zapisz$/ })).toBeDisabled();
  },
};

export const DarkMarkdownHighlight: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const spans = [...canvasElement.querySelectorAll<HTMLElement>('.cm-content span')];
    const heading = spans.find((span) => span.textContent?.includes('Feature: Logowanie SSO'));
    const list = spans.find((span) => span.textContent?.includes('Powrót do projektu'));
    const code = spans.find((span) => span.textContent === 'identity_token');
    if (!heading || !list || !code) throw new Error('Markdown syntax spans are missing');
    const source = canvasElement.querySelector<HTMLElement>('.cm-content')!;
    const ordinary = getComputedStyle(source).color;
    const colors = [heading, list, code].map((span) => getComputedStyle(span).color);
    for (const color of colors) await expect(color).not.toBe(ordinary);
    await expect(new Set(colors).size).toBe(3);
  },
};

export const EditsDuringSave: Story = {
  render: () => <EditorFixture deferred />,
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const editor = canvas.getByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(editor);
    await userEvent.type(editor, ' Submitted');
    await invokeDocumentAction(canvas, userEvent, 'Zapisz');
    await userEvent.type(editor, ' UnsavedLater');
    await userEvent.click(canvas.getByRole('button', { name: 'Potwierdź zapis' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'UnsavedLater',
    );
    await expect(canvas.getByRole('status')).toHaveTextContent('Niezapisane zmiany');
    await invokeDocumentAction(canvas, userEvent, 'Zapisz');
    await userEvent.click(canvas.getByRole('button', { name: 'Potwierdź zapis' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Zapisz$/ })).toBeDisabled();
  },
};

export const PlainTextImport: Story = {
  render: () => <EditorFixture plainText />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    // An opened editable document defaults to Preview.
    await expect(canvasElement.querySelector('pre')).toHaveTextContent('# Feature: Logowanie SSO');
    await expect(
      canvas.queryByRole('heading', { name: 'Feature: Logowanie SSO' }),
    ).not.toBeInTheDocument();
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await expect(canvas.getByRole('textbox', { name: 'Treść CLIENT.TXT' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Pogrubienie' })).not.toBeInTheDocument();
    await expect(canvas.queryByText('Tekst · Ctrl/⌘ S')).not.toBeInTheDocument();
  },
};

export const DirtyDraftPreview: Story = {
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const editor = canvas.getByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(editor);
    await userEvent.keyboard('{Control>}End{/Control}');
    await userEvent.type(editor, '\n\n## Niezapisany fragment\n\n');
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await expect(canvas.getByRole('heading', { name: 'Niezapisany fragment' })).toBeVisible();
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await expect(canvas.getByRole('textbox')).toHaveTextContent('Niezapisany fragment');
  },
};

export const RenameChangesLanguageWithoutLosingDraft: Story = {
  render: () => <EditorFixture renameFormat />,
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Treść specification.md' }),
      'KeepThisDraft',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Zmień format' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść CLIENT.TXT' })).toHaveTextContent(
      'KeepThisDraft',
    );
    await expect(canvas.queryByRole('button', { name: 'Pogrubienie' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Zmień format' }));
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'KeepThisDraft',
    );
    await expect(document.querySelector('.cm-content span')).not.toBeNull();
  },
};

/** The color a DS field (`bg-surface-control`) paints, read from a probe so no value is hard-coded. */
function fieldFill() {
  const probe = document.createElement('div');
  probe.className = 'bg-surface-control';
  document.body.append(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

export const EditSurfaceDiffersFromPage: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Preview stays on the page surface: no fill, no field border.
    const preview = await waitFor(() => {
      const node = canvasElement.querySelector('[data-document-preview]');
      if (!node) throw new Error('Preview pending');
      return node;
    });
    const previewStyle = getComputedStyle(preview.closest('.scroll-area') ?? preview);
    await expect(previewStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(previewStyle.borderTopWidth).toBe('0px');
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    // Edit mode: the editable area uses the field fill, a control border and the field radius.
    const surface = canvasElement.querySelector<HTMLElement>('[data-document-source]')!;
    const style = getComputedStyle(surface);
    await expect(style.backgroundColor).toBe(fieldFill());
    await expect(style.backgroundColor).not.toBe(previewStyle.backgroundColor);
    await expect(style.borderTopWidth).toBe('1px');
    await expect(style.borderTopLeftRadius).not.toBe('0px');
    // Focus draws the DS focus ring on the same surface.
    await userEvent.click(canvas.getByRole('textbox', { name: 'Treść specification.md' }));
    await waitFor(() => expect(getComputedStyle(surface).outlineWidth).toBe('2px'));
    // Back to preview: the page surface returns.
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await waitFor(() => expect(canvasElement.querySelector('[data-document-source]')).toBeNull());
  },
};

export const FullPathFromHeaderOverflow: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // No always-on path line: the full path is one explicit header overflow action away.
    await expect(canvasElement.querySelector('[data-document-path]')).toBeNull();
    await invokeDocumentAction(canvas, userEvent, 'Pokaż ścieżkę');
    const dialog = await within(document.body).findByRole('dialog', { name: 'Ścieżka dokumentu' });
    await expect(dialog.querySelector('[data-document-path]')).toHaveTextContent(
      'specification.md',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kopiuj ścieżkę' }));
    // Clipboard access depends on the browser permission: either outcome is announced.
    await expect(await within(dialog).findByRole('status')).toHaveTextContent(
      /Skopiowano|Nie udało się skopiować/,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
  },
};

const frontmatterSource = [
  '---',
  'title: Ocena ryzyka',
  'tags: [admisja, ryzyko]',
  'owner:',
  '  name: Anna',
  '---',
  '# Treść dokumentu',
  '',
  'Pierwszy akapit.',
].join(String.fromCharCode(10));

export const FrontmatterPreviewAndRawEdit: Story = {
  render: () => <EditorFixture content={frontmatterSource} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Preview: the raw block is hidden; a collapsed, read-only Properties block stands in for it.
    const heading = await canvas.findByRole('heading', { name: 'Treść dokumentu' });
    await expect(canvasElement.textContent).not.toContain('---');
    // Source lines are counted from the file start: the heading is on line 7.
    await expect(heading).toHaveAttribute('data-source-line', '7');
    const toggle = canvas.getByRole('button', { name: /Właściwości/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('Ocena ryzyka')).not.toBeVisible();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(await canvas.findByText('Ocena ryzyka')).toBeVisible();
    await expect(canvas.getByText('admisja, ryzyko')).toBeVisible();
    await expect(canvas.getByText('{"name":"Anna"}')).toBeVisible();
    // Edit mode shows the unchanged source, frontmatter included.
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const editor = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await expect(editor).toHaveTextContent('title: Ocena ryzyka');
    await expect(editor).toHaveTextContent('---');
  },
};

export const InvalidFrontmatterRendersAsBefore: Story = {
  render: () => (
    <EditorFixture
      content={['---', 'a: [1, 2', '---', '# Zwykły nagłówek'].join(String.fromCharCode(10))}
    />
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Zwykły nagłówek' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Właściwości/ })).toBeNull();
  },
};

export const HeaderActionsAndFocus: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // One header carries identity and actions; the editor has no toolbar or path disclosure.
    await expect(canvasElement.querySelector('[role="toolbar"]')).toBeNull();
    await expect(canvas.queryByRole('button', { name: /^Ścieżka dokumentu/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument();
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    // Save is present only while editing and enabled only for a dirty draft.
    await expect(canvas.getByRole('button', { name: 'Zapisz' })).toBeDisabled();
    const input = canvas.getByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.type(input, 'dirty');
    await expect(canvas.getByRole('button', { name: 'Zapisz' })).toBeEnabled();
    await invokeDocumentAction(canvas, userEvent, 'Zapisz');
    await waitFor(() => expect(input).toHaveFocus());
    await expect(canvas.getByRole('button', { name: 'Zapisz' })).toBeDisabled();
    await userEvent.type(input, 'discard');
    await invokeDocumentAction(canvas, userEvent, 'Cofnij zmiany');
    await userEvent.click(within(document.body).getByRole('button', { name: 'Odrzuć zmiany' }));
    await waitFor(() => expect(input).toHaveFocus());
  },
};
