import type { ContentKind } from '@nevo/specflow-contracts/documents';
import type { TFunction } from 'i18next';
import type { WorkspaceHeaderAction } from '@nevo/ui';
import { hasTextDraft, kindIdOf } from './kindId';
import type { DocumentEditorSession } from '../editor/DocumentEditorProvider';

/**
 * Content kinds of the Documents workspace. A kind declares the views its documents have and the
 * header actions of each view; the tab host knows none of it. Text documents (markdown, plain text)
 * have a draft and Save; images and other files are viewed only: no draft, never dirty.
 *
 * - `preview` / `edit`: rendered markdown and its editable source;
 * - `source`: plain text that cannot be changed here, shown as read-only text;
 * - `image`: the image from the raw route (never inline SVG markup);
 * - `file`: a file that cannot be shown (binary, or text above the read limit) with Download.
 */
export type DocumentView = 'preview' | 'edit' | 'source' | 'image' | 'file';

export type DocumentKindId = 'markdown' | 'text' | 'image' | 'file';

export interface DocumentActionContext {
  session: DocumentEditorSession;
  t: TFunction;
}

/** What decides a document's kind: its name, its content kind and whether its text was delivered. */
export interface DocumentKindInput {
  path: string;
  kind?: ContentKind;
  content?: string;
  /** False for text that can be viewed but not changed here (shown as read-only source). */
  editable?: boolean;
}

export interface DocumentContentKind {
  id: DocumentKindId;
  matches: (document: DocumentKindInput) => boolean;
  /** The document has a text draft (edit, save, unsaved changes). */
  text: boolean;
  /** Only kinds whose views differ list more than one. */
  views: readonly DocumentView[];
  /** The views left when the document is read-only (never an edit view). */
  readOnlyViews: readonly DocumentView[];
  defaultView: DocumentView;
  /**
   * Actions of the content for one view. `direct` promotes an action to the header (it also stays
   * in the complete menu); everything else is menu-only.
   */
  actions: (view: DocumentView, context: DocumentActionContext) => WorkspaceHeaderAction[];
}

const noop = () => undefined;

function saveActions(view: DocumentView, { session, t }: DocumentActionContext) {
  // Save and Discard exist only while the draft differs; the header keeps its geometry because
  // the direct slots are decided by the host's budget, not by what is present.
  if (!session.dirty) return [];
  return [
    {
      id: 'document-save',
      // While the commit runs Save says so and is unavailable; the editor stays editable.
      label: session.saving ? t('documents.save.saving') : t('documents.actions.save'),
      icon: 'save',
      primary: true,
      direct: 'always',
      group: 'actions',
      // The shortcut is a hint only where the key works: the source editor binds it.
      shortcut: view === 'edit' ? 'Ctrl+S' : undefined,
      // Unavailable while the commit runs or a refusal blocks it, without dropping the keyboard
      // focus of whoever pressed it (`aria-disabled`, presses ignored).
      busy: session.saving || session.saveBlocked,
      onPress: () => void session.save({ restoreFocus: true }),
    },
    {
      id: 'document-discard',
      label: t('documents.actions.discard'),
      icon: 'close',
      group: 'actions',
      disabled: session.saving,
      onPress: session.requestDiscard,
    },
  ] satisfies WorkspaceHeaderAction[];
}

/**
 * Markdown: Edit <-> Preview (pencil in preview, eye in edit; the icon names the action). While
 * editing with unsaved changes Save takes the only direct slot of a narrow header and the mode
 * action moves to the menu. A read-only document offers no Edit.
 */
const markdown: DocumentContentKind = {
  id: 'markdown',
  matches: (document) => hasTextDraft(document) && kindIdOf(document.path) === 'markdown',
  text: true,
  views: ['preview', 'edit'],
  readOnlyViews: ['preview'],
  defaultView: 'preview',
  actions: (view, context) => {
    const { session, t } = context;
    const editing = view === 'edit';
    const mode: WorkspaceHeaderAction[] =
      session.readOnlyReason !== undefined
        ? []
        : [
            {
              id: editing ? 'document-preview' : 'document-edit',
              label: editing ? t('documents.actions.preview') : t('documents.actions.edit'),
              icon: editing ? 'eye' : 'edit',
              presentation: 'icon',
              group: 'actions',
              direct: editing && session.dirty ? 'wide' : 'always',
              // In the menu, closing must not return focus to its trigger: the mode change moves
              // focus into the document content itself.
              onMenuClosed: noop,
              onPress: session.toggleEditing,
            },
          ];
    // Markdown the Runtime reports as not editable (for example an archived specification) can be
    // downloaded, as its read-only line says.
    const download = session.document.editable ? [] : [downloadAction(context, false)];
    return [...mode, ...saveActions(view, context), ...download];
  },
};

/**
 * Plain text (any text that is not markdown): one source view, read-only when it cannot be changed
 * (whitespace kept, never rendered as prose). A file that cannot be edited here offers Download, as
 * its read-only line says. Markdown that cannot be edited stays markdown (a preview, no Edit).
 */
const text: DocumentContentKind = {
  id: 'text',
  matches: (document) => hasTextDraft(document) && kindIdOf(document.path) === 'text',
  text: true,
  views: ['edit'],
  readOnlyViews: ['source'],
  defaultView: 'edit',
  actions: (view, context) =>
    context.session.document.editable
      ? saveActions(view, context)
      : [downloadAction(context, false)],
};

function downloadAction(
  { session, t }: DocumentActionContext,
  promoted: boolean,
): WorkspaceHeaderAction {
  return {
    id: 'document-download',
    label: t('documents.actions.download'),
    icon: 'download',
    group: 'actions',
    // The only action of an image tab is promoted; a file's Download is the body's button, so the
    // header keeps it in the menu and the two never differ in weight.
    ...(promoted ? { primary: true } : { direct: 'never' as const }),
    onPress: session.download,
  };
}

/** An image: fitted to the area or at its actual size, and Download. Never dirty. */
const image: DocumentContentKind = {
  id: 'image',
  matches: (document) => document.kind === 'image',
  text: false,
  views: ['image'],
  readOnlyViews: ['image'],
  defaultView: 'image',
  actions: (_view, context) => [
    {
      id: 'document-actual-size',
      label: context.t('documents.image.actualSize'),
      icon: 'actual-size',
      group: 'display',
      checked: context.session.actualSize,
      onPress: context.session.toggleActualSize,
    },
    downloadAction(context, true),
  ],
};

/** A file that cannot be shown here (binary, or text above the read limit): information + Download. */
const file: DocumentContentKind = {
  id: 'file',
  matches: (document) => document.kind !== 'image' && !hasTextDraft(document),
  text: false,
  views: ['file'],
  readOnlyViews: ['file'],
  defaultView: 'file',
  actions: (_view, context) => [downloadAction(context, false)],
};

/** Most specific first; plain text is the fallback of every text document. */
export const documentContentKinds: readonly DocumentContentKind[] = [image, file, text, markdown];

export function documentKindOf(document: DocumentKindInput | undefined): DocumentContentKind {
  const input = document ?? { path: '', content: '' };
  return documentContentKinds.find((kind) => kind.matches(input)) ?? text;
}

/** The view on screen: the draft's mode, limited to the views the kind has (read-only ones when read-only). */
export function documentViewOf(
  kind: DocumentContentKind,
  draft: { editing: boolean },
  readOnly = false,
): DocumentView {
  const views = readOnly ? kind.readOnlyViews : kind.views;
  const wanted: DocumentView = draft.editing ? 'edit' : kind.defaultView;
  return views.includes(wanted) ? wanted : (views[0] ?? kind.defaultView);
}
