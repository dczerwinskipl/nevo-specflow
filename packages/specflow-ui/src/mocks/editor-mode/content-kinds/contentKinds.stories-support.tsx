import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  Columns2,
  Download,
  Maximize2,
  Scan,
  ListOrdered,
  Undo2,
  WrapText,
  Pencil,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button, Icon, MarkdownDocument, cn, ScrollArea, Typography } from '@nevo/ui';
import { fileName, type ContentKind, type MockDocument } from './fixtures.stories-support';
import type { TabAction } from '../tab-host/types.stories-support';
import type { EditorSession } from './useEditorSession.stories-support';

/*
 * CONTENT layer (see tab-host/types for the whole picture). Renderer Registry: ContentKind ->
 * ContentDescriptor { kind, views, viewMinWidth, defaultView, actions(view, ctx), Renderer }. This
 * layer owns markdown/code/image rendering, the editor (gutter, word wrap, split) and the per-tab
 * view; the tab host only receives render(), actions(), dirty and label through editorProvider.
 */

export type ViewId = 'preview' | 'edit' | 'split' | 'code' | 'image' | 'download';
export type MockLayout = 'wide' | 'compact' | 'narrow';

export interface ActionContext {
  files: EditorSession;
  doc: MockDocument;
  layout: MockLayout;
  dirty: boolean;
  /** Document area wide enough for the `split` view (see `viewMinWidth`). */
  splitAvailable: boolean;
  /** Current word-wrap preference; the header menu toggles it for every tab. */
  wrap: boolean;
  lineNumbers: boolean;
}
export interface RendererProps {
  doc: MockDocument;
  files: EditorSession;
  view: ViewId;
  /** Read-only hosts (Sessions context) never offer editing. */
  readOnly?: boolean;
  /** Narrow (stacked) layout. */
  narrow?: boolean;
  /** Editor preferences (not views, not per tab). */
  wrap: boolean;
  lineNumbers: boolean;
}
export interface ContentDescriptor {
  kind: ContentKind;
  /** Only kinds whose views differ (markdown: rendered vs source) list more than one. */
  views: readonly ViewId[];
  defaultView: ViewId;
  /** Views that exist only when the DOCUMENT AREA (not the viewport) is at least this wide, in px. */
  viewMinWidth?: Partial<Record<ViewId, number>>;
  actions: (view: ViewId, ctx: ActionContext) => ContentAction[];
  Renderer: ComponentType<RendererProps>;
}

const noop = () => undefined;

/* ------------------------------------------------------------------------------------------ */
/* Highlighting (tokens as in MarkdownSourceEditor: link / link-hover / muted)                  */
/* ------------------------------------------------------------------------------------------ */

/** Keeps an empty line one glyph tall. Any falsy highlight result (not only nullish) falls back. */
function nonEmpty(node: ReactNode): ReactNode {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string must fall back too
  return node || '​';
}

function mdLine(line: string): ReactNode {
  if (/^#{1,6}\s/.test(line))
    return <span className="font-semibold text-content-link">{line}</span>;
  if (/^(```|---)/.test(line)) return <span className="text-content-muted">{line}</span>;
  if (line.startsWith('>')) return <span className="text-content-muted">{line}</span>;
  const marker = /^(\s*(?:[-*]|\d+\.)\s)(.*)$/.exec(line);
  const body = marker ? marker[2]! : line;
  const parts = body.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('`') ? (
      <span key={index} className="bg-surface-selected text-content-link">
        {part}
      </span>
    ) : part.startsWith('**') ? (
      <span key={index} className="font-bold">
        {part}
      </span>
    ) : (
      part
    ),
  );
  return marker ? (
    <>
      <span className="text-content-link-hover">{marker[1]}</span>
      {parts}
    </>
  ) : (
    <>{parts}</>
  );
}

const csPattern =
  /(\/\/.*$|"(?:[^"\\]|\\.)*"|\b(?:using|namespace|public|private|class|const|readonly|async|await|return|var|new|if|throw|null|int|string|true|false)\b|\b\d+\b)/g;
function codeLine(line: string): ReactNode {
  return line.split(csPattern).map((part, index) => {
    if (part.startsWith('//'))
      return (
        <span key={index} className="text-content-muted">
          {part}
        </span>
      );
    if (part.startsWith('"'))
      return (
        <span key={index} className="text-status-success">
          {part}
        </span>
      );
    if (/^\d+$/.test(part))
      return (
        <span key={index} className="text-status-attention">
          {part}
        </span>
      );
    if (/^[a-z]+$/.test(part) && index % 2 === 1)
      return (
        <span key={index} className="text-content-link">
          {part}
        </span>
      );
    return part;
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Editor look: gutter, current line, editor surface (textarea over a highlighted layer)        */
/* ------------------------------------------------------------------------------------------ */

const LINE_HEIGHT = 20;
const PAD = 12;

function Gutter({
  count,
  current,
  scrollTop,
  narrow = false,
  heights,
}: {
  narrow?: boolean;
  /** Rendered row heights when long lines wrap: the number sits on the first visual row only. */
  heights?: number[];
  count: number;
  current?: number;
  scrollTop: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: `calc(${narrow ? Math.max(2, String(count).length) : String(count).length}ch + ${narrow ? '1.125rem' : '0.875rem'})`,
      }}
      className={
        cn('shrink-0', narrow && 'text-[0.6875rem]') +
        ' select-none overflow-hidden border-r border-border-subtle bg-surface-subtle text-right font-mono text-content-muted' +
        (narrow ? '' : ' text-code-md')
      }
    >
      <div
        style={{ transform: `translateY(${-scrollTop}px)`, paddingTop: PAD, paddingBottom: PAD }}
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className={cn(
              narrow ? 'pl-3 pr-1.5' : 'pl-2 pr-1.5',
              index === current && 'text-content-primary',
            )}
            style={{ height: heights?.[index] ?? LINE_HEIGHT }}
          >
            {index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Editable source: darker editor surface, current-line highlight, mono, token colors. Line numbers
 * and long lines follow `wrap`, an editor preference (wrapped lines: number on the first visual row).
 */
function EditorSurface({
  label,
  value,
  onChange,
  highlight,
  wrap = false,
  narrow = false,
  lineNumbers = true,
  onScrollRatio,
  restore,
  remember,
}: {
  /** Scroll/line to restore on mount, and where to write them while editing. */
  restore?: { top: number; line: number };
  remember?: (patch: Partial<{ top: number; line: number }>) => void;
  lineNumbers?: boolean;
  onScrollRatio?: (ratio: number) => void;
  narrow?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  highlight: (line: string) => ReactNode;
  wrap?: boolean;
}) {
  const [scroll, setScroll] = useState({ top: restore?.top ?? 0, left: 0 });
  const [current, setCurrent] = useState(restore?.line ?? 0);
  const [areaWidth, setAreaWidth] = useState<number>();
  const area = useRef<HTMLTextAreaElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>();
  const rows = value.split('\n');
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !wrap) return undefined;
    const update = () => setAreaWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [wrap]);
  useLayoutEffect(() => {
    setHeights(wrap ? rowRefs.current.map((el) => el?.offsetHeight ?? LINE_HEIGHT) : undefined);
  }, [value, areaWidth, wrap]);
  useLayoutEffect(() => {
    if (restore && area.current) area.current.scrollTop = restore.top;
    // Mount only: later scrolls are written, not restored.
  }, []);
  const syncCurrent = () => {
    const el = area.current;
    if (!el) return;
    const line = el.value.slice(0, el.selectionStart).split('\n').length - 1;
    setCurrent(line);
    remember?.({ line });
  };
  return (
    <div className="flex min-h-0 flex-1 bg-canvas" data-editor-surface="true">
      {lineNumbers ? (
        <Gutter
          count={rows.length}
          current={current}
          scrollTop={scroll.top}
          narrow={narrow}
          heights={heights}
        />
      ) : null}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 font-mono text-code-md text-content-primary"
          style={{
            transform: `translate(${-scroll.left}px, ${-scroll.top}px)`,
            padding: PAD,
            ...(wrap ? { width: areaWidth } : { minWidth: '100%' }),
          }}
        >
          {rows.map((row, index) => (
            <div
              key={index}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              className={cn(
                wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
                index === current && 'bg-surface-hover',
              )}
              style={wrap ? { minHeight: LINE_HEIGHT } : { height: LINE_HEIGHT }}
            >
              {nonEmpty(highlight(row))}
            </div>
          ))}
        </div>
        <textarea
          ref={area}
          aria-label={label}
          spellCheck={false}
          wrap={wrap ? 'soft' : 'off'}
          value={value}
          data-editor-source="true"
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const el = event.currentTarget;
            setScroll({ top: el.scrollTop, left: el.scrollLeft });
            remember?.({ top: el.scrollTop });
            const range = el.scrollHeight - el.clientHeight;
            onScrollRatio?.(range > 0 ? el.scrollTop / range : 0);
          }}
          onSelect={syncCurrent}
          onKeyUp={syncCurrent}
          onClick={syncCurrent}
          className={cn(
            'absolute inset-0 size-full resize-none bg-transparent font-mono text-code-md text-transparent caret-content-primary outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
            wrap
              ? 'overflow-y-auto overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere]'
              : 'overflow-auto whitespace-pre',
          )}
          style={{ padding: PAD, lineHeight: `${LINE_HEIGHT}px` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Renderers                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function MarkdownRenderer({ doc, files, view, narrow, wrap, lineNumbers }: RendererProps) {
  const name = fileName(doc.path);
  const previewViewport = useRef<HTMLDivElement>(null);
  if (view === 'split')
    // Editor | rendered preview, 50/50, each column scrolls on its own; the preview follows the
    // editor proportionally (one-way scroll sync).
    return (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 basis-1/2 flex-col">
          <EditorSurface
            key={doc.id}
            restore={files.viewMemory(doc.id)}
            remember={(patch) => files.remember(doc.id, patch)}
            label={`Source of ${name}`}
            value={files.draftOf(doc.id)}
            onChange={(value) => files.edit(doc.id, value)}
            highlight={mdLine}
            wrap={wrap}
            lineNumbers={lineNumbers}
            onScrollRatio={(ratio) => {
              const el = previewViewport.current;
              if (el) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
            }}
          />
        </div>
        <div className="flex min-w-0 basis-1/2 flex-col border-l border-border-subtle">
          <ScrollArea
            aria-label={`Preview of ${name}`}
            className="min-h-0 flex-1"
            contentClassName="p-6"
            direction="vertical"
            viewportRef={previewViewport}
          >
            <MarkdownDocument
              className="[&_code]:break-words [&_pre]:w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
              source={files.draftOf(doc.id)}
            />
          </ScrollArea>
        </div>
      </div>
    );
  if (view === 'edit')
    return (
      <EditorSurface
        key={doc.id}
        restore={files.viewMemory(doc.id)}
        remember={(patch) => files.remember(doc.id, patch)}
        label={`Source of ${name}`}
        value={files.draftOf(doc.id)}
        onChange={(value) => files.edit(doc.id, value)}
        highlight={mdLine}
        wrap={wrap}
        lineNumbers={lineNumbers}
        narrow={narrow}
      />
    );
  return (
    <ScrollArea
      aria-label={`Preview of ${name}`}
      className="min-h-0 flex-1"
      contentClassName="p-6"
      direction="vertical"
    >
      <MarkdownDocument
        className="[&_code]:break-words [&_pre]:w-full [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        source={files.draftOf(doc.id)}
      />
    </ScrollArea>
  );
}

/** One view: an editor surface from the start (no view/edit modes), editable in place. */
function CodeRenderer({ doc, files, narrow, wrap, lineNumbers }: RendererProps) {
  return (
    <EditorSurface
      key={doc.id}
      restore={files.viewMemory(doc.id)}
      remember={(patch) => files.remember(doc.id, patch)}
      label={`Source of ${fileName(doc.path)}`}
      value={files.draftOf(doc.id)}
      onChange={(value) => files.edit(doc.id, value)}
      highlight={codeLine}
      narrow={narrow}
      wrap={wrap}
      lineNumbers={lineNumbers}
    />
  );
}

/** Placeholder image: Fit contains it in the area, otherwise it has a real size (natural x zoom). */
function ImageRenderer({ doc, files }: RendererProps) {
  const zoom = files.zooms[doc.id];
  const fit = zoom === undefined;
  return (
    <div
      role="group"
      aria-label={`Image ${fileName(doc.path)}`}
      tabIndex={0}
      className="grid min-h-0 flex-1 place-items-center overflow-auto p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
    >
      <div
        role="img"
        aria-label={`Preview of ${fileName(doc.path)} (placeholder)`}
        className="grid shrink-0 place-items-center rounded-composite border border-border-default bg-surface-subtle text-content-muted"
        style={
          fit
            ? { width: '100%', maxHeight: '100%', aspectRatio: '960 / 600' }
            : { width: 960 * zoom, height: 600 * zoom }
        }
      >
        <div className="grid justify-items-center gap-2">
          <Icon name="file" />
          <Typography variant="body-sm">{fit ? 'Fit' : `${Math.round(zoom * 100)}%`}</Typography>
        </div>
      </div>
    </div>
  );
}

function FallbackRenderer({ doc }: RendererProps) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <Typography variant="body-md" className="text-content-muted">
          {fileName(doc.path)} cannot be shown here.
        </Typography>
        <Button variant="secondary" size="sm" leadingIcon={Download}>
          Download
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Descriptors                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/*
 * ACTION MODEL (mock-level; the production header frame keeps its own rules):
 *   ContentAction { id, label, icon, group: 'display' | 'actions', promoted?, checked?, tone?,
 *                   disabled?, shortcut?, onPress }
 *   - The `...` menu lists EVERY action of the tab, in two groups: Display (toggles, state in the
 *     trailing slot) on top, Actions below. The leading icon names the action, never its state.
 *   - `promoted` (lower = more important; absent = menu only) is a SHORTCUT: the same action (same id
 *     and label) also appears as an icon in the header while the width budget allows (Wide 2,
 *     Compact 1, Narrow 1). Save when dirty is always promoted first (0). The duplicate is intended.
 *   - A shortcut hint (Ctrl+S) exists only where the key really works.
 *   editorProvider turns this into the host's TabAction list.
 */
export interface ContentAction {
  id: string;
  label: string;
  icon?: TabAction['icon'];
  group: 'display' | 'actions';
  promoted?: number;
  checked?: boolean;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  shortcut?: string;
  /** Save is the only primary (blue) action. */
  primary?: boolean;
  onPress: () => void;
}

/** Word wrap preference: shared by all tabs; default on for markdown and on Narrow, off for code. */
export const wrapFor = (files: EditorSession, doc: MockDocument, narrow: boolean) =>
  files.wrapPref ?? (doc.kind === 'md' || narrow);

/** Display options of the editor: toggles, state in the trailing slot. */
function displayActions(ctx: ActionContext): ContentAction[] {
  return [
    {
      id: 'word-wrap',
      label: 'Word wrap',
      icon: WrapText,
      group: 'display',
      checked: ctx.wrap,
      onPress: () => ctx.files.setWrapPref(!ctx.wrap),
    },
    {
      id: 'line-numbers',
      label: 'Line numbers',
      icon: ListOrdered,
      group: 'display',
      checked: ctx.lineNumbers,
      onPress: () => ctx.files.setLineNumbers(!ctx.lineNumbers),
    },
  ];
}

const saveActions = (ctx: ActionContext): ContentAction[] =>
  ctx.dirty
    ? [
        {
          id: 'save',
          label: 'Save',
          icon: 'save',
          group: 'actions',
          promoted: 0,
          primary: true,
          shortcut: 'Ctrl+S',
          onPress: () => ctx.files.save(ctx.doc.id),
        },
        {
          id: 'discard',
          label: 'Discard changes',
          icon: Undo2,
          group: 'actions',
          onPress: () => ctx.files.discard(ctx.doc.id),
        },
      ]
    : [];

/**
 * Markdown: [Edit <-> Preview] (pen in preview, eye in edit), the split icon when the document area
 * allows it, Save when dirty. Narrow edit keeps ONE fixed slot: Save replaces the mode toggle while
 * dirty (the toggle then lives in the menu), so the header never changes geometry.
 */
function mdActions(view: ViewId, ctx: ActionContext): ContentAction[] {
  const { files, doc, layout, dirty, splitAvailable } = ctx;
  if (!doc.editable) return [];
  const set = (next: ViewId) => () => files.setView(doc.id, next);
  const actions: ContentAction[] = [];
  if (view !== 'split') {
    const editing = view === 'edit';
    actions.push({
      id: 'mode',
      label: editing ? 'Preview' : 'Edit',
      icon: editing ? 'eye' : Pencil,
      group: 'actions',
      promoted: layout === 'narrow' && editing && dirty ? undefined : 1,
      onPress: set(editing ? 'preview' : 'edit'),
    });
  }
  if (splitAvailable)
    actions.push({
      id: 'split',
      label: view === 'split' ? 'Close split' : 'Split view',
      icon: Columns2,
      group: 'actions',
      promoted: 2,
      onPress: set(view === 'split' ? 'edit' : 'split'),
    });
  if (view === 'edit' || view === 'split') actions.unshift(...displayActions(ctx));
  actions.push(...saveActions(ctx));
  return actions;
}

/**
 * Image: one toggle in the header, the target of the click (Fit <-> 100%); the rest in the menu.
 * Icons name the action (Fit = scan frame, Actual size = maximize); state sits in the trailing slot
 * (a check on the active mode, the current zoom next to the zoom steps).
 */
function imageActions(_view: ViewId, ctx: ActionContext): ContentAction[] {
  const { files, doc } = ctx;
  const zoom = files.zooms[doc.id];
  const fit = zoom === undefined;
  const pct = fit ? undefined : `${Math.round(zoom * 100)}%`;
  return [
    {
      id: 'fit',
      label: 'Fit',
      icon: Scan,
      group: 'display',
      promoted: fit ? undefined : 1,
      checked: fit,
      onPress: () => files.zoomTo(doc.id, null),
    },
    {
      id: 'actual-size',
      label: 'Actual size (100%)',
      icon: Maximize2,
      group: 'display',
      promoted: fit ? 1 : undefined,
      checked: zoom === 1,
      onPress: () => files.zoomTo(doc.id, 1),
    },
    {
      id: 'zoom-in',
      label: 'Zoom in',
      icon: ZoomIn,
      group: 'display',
      shortcut: pct,
      onPress: () => files.zoom(doc.id, 0.25),
    },
    {
      id: 'zoom-out',
      label: 'Zoom out',
      icon: ZoomOut,
      group: 'display',
      shortcut: pct,
      onPress: () => files.zoom(doc.id, -0.25),
    },
    { id: 'download', label: 'Download', icon: Download, group: 'actions', onPress: noop },
  ];
}

export const contentRegistry: Record<ContentKind, ContentDescriptor> = {
  md: {
    kind: 'md',
    // Always opens in preview (reading). `split` is opt-in and exists only in a wide area.
    views: ['preview', 'edit', 'split'],
    defaultView: 'preview',
    viewMinWidth: { split: 1000 },
    actions: mdActions,
    Renderer: MarkdownRenderer,
  },
  // Code has a single view; editing is a property of the content (`doc.editable`), not a mode.
  // Save and the unsaved dot appear only once the draft differs.
  code: {
    kind: 'code',
    views: ['code'],
    defaultView: 'code',
    actions: (_view, ctx) =>
      ctx.doc.editable ? [...displayActions(ctx), ...saveActions(ctx)] : [],
    Renderer: CodeRenderer,
  },
  image: {
    kind: 'image',
    views: ['image'],
    defaultView: 'image',
    actions: imageActions,
    Renderer: ImageRenderer,
  },
  binary: {
    kind: 'binary',
    views: ['download'],
    defaultView: 'download',
    actions: () => [
      {
        id: 'download',
        label: 'Download',
        icon: Download,
        group: 'actions',
        promoted: 1,
        onPress: noop,
      },
    ],
    Renderer: FallbackRenderer,
  },
};

/** The view to show: a remembered `split` falls back to `edit` while the area is too narrow. */
export const effectiveView = (
  files: EditorSession,
  doc: MockDocument,
  splitAvailable: boolean,
): ViewId => {
  const view = viewOf(files, doc);
  return view === 'split' && !splitAvailable ? 'edit' : view;
};

export const viewOf = (files: EditorSession, doc: MockDocument): ViewId =>
  (files.views[doc.id] as ViewId | undefined) ?? contentRegistry[doc.kind].defaultView;
