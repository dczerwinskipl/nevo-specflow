import { documentTreeFixture } from '../../../test-support/documents/fixtures';
import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppShell,
  DrawerTrigger,
  Icon,
  IconButton,
  Typography,
  WorkspaceHeader,
  cn,
  workspaceSurfaceClassName,
} from '@nevo/ui';
import {
  DocumentsExplorer,
  documentRootActions,
  type DocumentTreeController,
} from '../../features/documents/explorer/DocumentsExplorer';
import { NotificationProvider } from '../../shared/notifications/notifications';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { contentRegistry, type MockLayout } from './content-kinds/contentKinds.stories-support';
import { editorProvider, headerBudget } from './content-kinds/editorProvider.stories-support';
import {
  mockDocuments,
  presets,
  treeFolders,
  type TabPreset,
} from './content-kinds/fixtures.stories-support';
import { useEditorSession } from './content-kinds/useEditorSession.stories-support';
import { MockNavigation } from './MockNavigation.stories-support';
import {
  PaneHeader,
  TabHostBody,
  TabHostHeader,
  TabHostNarrowHeader,
  UnsavedChangesDialog,
} from './tab-host/TabHost.stories-support';
import { useTabHost } from './tab-host/useTabHost.stories-support';

export type { MockLayout } from './content-kinds/contentKinds.stories-support';

/*
 * Concept and interaction demo. The layout is hand-composed (own sections, 25/75 and 1/3-2/3
 * proportions, PaneHeader, width measuring) and does not prove AppWorkspace geometry; verify against
 * the real AppWorkspace during Documents integration.
 *
 * Composition only: the Documents shell (tree + document area) wires the generic tab host
 * (tab-host/) to the editor content layer (content-kinds/) through `editorProvider`.
 */

/* Shell thresholds mirrored from the real AppShell/AppWorkspace (presentation mock, not responsive code). */
const WIDE_SHELL_MIN_WIDTH = 1108;
const WIDE_WORKSPACE_MIN_WIDTH = 1080;
const SPLIT_WORKSPACE_MIN_WIDTH = 840;

export type NarrowPage = 'tree' | 'document';

export interface EditorModeMockProps {
  /** Frame width in px (the mock is NOT responsive; each story pins one width). */
  width: number;
  height?: number;
  preset?: TabPreset;
  /** Overrides the active tab of the preset. */
  active?: string;
  /** Overrides the view of the active tab (for example `edit`). */
  activeView?: string;
  /** Narrow only: which stacked page is visible first. */
  narrowPage?: NarrowPage;
  /** Opens the Unsaved changes dialog for the first dirty tab on first render. */
  dialog?: boolean;
  /** Comparison frames only: keep the split below the 840px threshold (the product stacks). */
  splitOverride?: boolean;
  /** Comparison frames only: fixed tree width in px instead of 25% / 1/3. */
  treeWidth?: number;
}

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    // Thresholds apply to the border-box of the shell workspace region (the parent), as in AppWorkspace.
    const region = element.parentElement ?? element;
    const update = () => setWidth(region.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function layoutFor(width: number | undefined): MockLayout {
  if (width === undefined || width >= WIDE_WORKSPACE_MIN_WIDTH) return 'wide';
  return width >= SPLIT_WORKSPACE_MIN_WIDTH ? 'compact' : 'narrow';
}

function NavigationButton() {
  return (
    <DrawerTrigger asChild>
      <IconButton aria-label="Open navigation" icon="menu" variant="ghost" />
    </DrawerTrigger>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Tree: the product explorer with static data                                                  */
/* ------------------------------------------------------------------------------------------ */

const no = { available: false, reason: 'protected' } as const;
const mockTreeData: DocumentTree = documentTreeFixture({
  folders: [...treeFolders],
  documents: mockDocuments.map((doc) => ({
    id: doc.id,
    path: doc.path,
    ...(doc.required
      ? {
          protected: true,
          actions: { rename: no, move: no, delete: no, classify: { available: false } },
        }
      : {}),
  })),
});

/** The Primary-like tree header, exactly as the product builds it (title, subtitle, root actions). */
function TreeHeader({
  controller,
  leading,
  bordered = true,
}: {
  controller: RefObject<DocumentTreeController | null>;
  leading?: ReactNode;
  bordered?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <PaneHeader leading={leading} bordered={bordered}>
      <WorkspaceHeader
        title="Documents"
        subtitle="Single sign-on"
        actions={documentRootActions(controller, mockTreeData.capabilities, false, t)}
        labels={{ moreActions: 'More actions' }}
      />
    </PaneHeader>
  );
}

function TreeList({
  controller,
  activeId,
  onOpen,
}: {
  controller: RefObject<DocumentTreeController | null>;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3" data-mock-tree="true">
      {/* The explorer confirms operations with toasts. */}
      <NotificationProvider>
        <DocumentsExplorer
          tree={mockTreeData}
          controllerRef={controller}
          active={activeId ?? undefined}
          onSelect={onOpen}
          onAdd={() => Promise.resolve()}
          onOperate={() => Promise.resolve()}
        />
      </NotificationProvider>
    </div>
  );
}

const emptyState = (
  <div className="grid h-full place-items-center p-6 text-center">
    <div>
      <Icon name="file-search" className="mx-auto text-content-muted" />
      <Typography as="p" variant="title-sm" className="mt-2">
        Select a document
      </Typography>
    </div>
  </div>
);

/* ------------------------------------------------------------------------------------------ */
/* Workspace                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function EditorWorkspace({
  preset = 'mixed',
  active,
  activeView,
  narrowPage = 'tree',
  dialog = false,
  splitOverride = false,
  treeWidth,
  persistentNav,
}: EditorModeMockProps & { persistentNav: boolean }) {
  const base = presets[preset];
  const start = active ?? base.active;
  const session = useEditorSession({
    dirty: base.dirty,
    views: { ...base.views, ...(start && activeView ? { [start]: activeView } : {}) },
  });
  const controller = useRef<DocumentTreeController>(null);
  const [page, setPage] = useState<NarrowPage>(narrowPage);
  const { ref, width } = useMeasuredWidth();
  const measuredLayout = layoutFor(width);
  const layout = splitOverride && measuredLayout === 'narrow' ? 'compact' : measuredLayout;
  const scope = 'editor-mock';
  // Split needs a wide DOCUMENT AREA (measured here), not a wide viewport.
  const docRef = useRef<HTMLElement>(null);
  const [docWidth, setDocWidth] = useState(0);
  const stacked = layout === 'narrow';
  useLayoutEffect(() => {
    const el = docRef.current;
    if (!el) return undefined;
    const update = () => setDocWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stacked]);
  const splitAvailable = docWidth >= (contentRegistry.md.viewMinWidth?.split ?? Infinity);
  const content = editorProvider(session, { layout, splitAvailable });
  const host = useTabHost(
    { open: base.open, active: start },
    content,
    dialog ? (base.dirty[0] ?? null) : null,
  );
  const hamburger = persistentNav ? undefined : <NavigationButton />;
  const openFromTree = (id: string) => {
    host.openItem(id);
    if (stacked) setPage('document');
  };

  return (
    <div
      ref={ref}
      data-workspace-fit="available"
      data-mock-layout={layout}
      onKeyDown={(event) => {
        // Ctrl/Cmd+S saves the active file (the only global shortcut the mock wires).
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          if (host.active && session.isDirty(host.active)) session.save(host.active);
        }
      }}
      className={cn(
        'flex h-full w-full min-w-0',
        layout === 'compact' && !persistentNav && workspaceSurfaceClassName,
        stacked && 'flex-col',
      )}
    >
      {stacked ? (
        page === 'tree' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <TreeHeader controller={controller} leading={hamburger} bordered={false} />
            <div
              data-mock-page="tree"
              className={cn(
                workspaceSurfaceClassName,
                'flex min-h-0 flex-1 flex-col overflow-clip rounded-t-surface border border-b-0 border-workspace-edge',
              )}
            >
              <TreeList controller={controller} activeId={host.active} onOpen={openFromTree} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" data-mock-page="document">
            <TabHostNarrowHeader host={host} content={content} onBack={() => setPage('tree')} />
            <div
              className={cn(
                workspaceSurfaceClassName,
                'min-h-0 flex-1 overflow-clip rounded-t-surface border border-b-0 border-workspace-edge',
              )}
            >
              <TabHostBody
                host={host}
                content={content}
                scope={scope}
                empty={emptyState}
                panelled={false}
              />
            </div>
          </div>
        )
      ) : (
        <>
          <section
            aria-label="Documents"
            className="flex min-h-0 min-w-0 flex-none flex-col"
            style={{ width: treeWidth ?? (layout === 'wide' ? '25%' : '33.3333%') }}
            data-mock-region="tree"
          >
            <TreeHeader controller={controller} leading={hamburger} />
            <TreeList controller={controller} activeId={host.active} onOpen={host.openItem} />
          </section>
          <section
            aria-label="Document"
            className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border-subtle"
            data-mock-region="document"
            ref={docRef}
          >
            <TabHostHeader
              host={host}
              content={content}
              scope={scope}
              label="Opened documents"
              budget={headerBudget(layout)}
            />
            <div className="min-h-0 flex-1">
              <TabHostBody host={host} content={content} scope={scope} empty={emptyState} />
            </div>
          </section>
        </>
      )}
      <UnsavedChangesDialog host={host} content={content} />
    </div>
  );
}

/** The mock entry point: real AppShell frame at a pinned width + the Documents Editor mode. */
export function EditorModeMock(props: EditorModeMockProps) {
  const { width, height = 900 } = props;
  const persistentNav = width >= WIDE_SHELL_MIN_WIDTH;
  const key = JSON.stringify([
    props.preset,
    props.active,
    props.activeView,
    props.narrowPage,
    props.dialog,
    props.treeWidth,
  ]);
  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<MockNavigation />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Specification navigation' }}
        >
          <EditorWorkspace key={key} {...props} persistentNav={persistentNav} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
