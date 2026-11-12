import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { BookOpen, ChevronsUpDown, FileText, Lock } from 'lucide-react';
import {
  APP_NAVIGATION_INLINE_PADDING,
  Alert,
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  Button,
  Collapsible,
  EmptyState,
  Icon,
  IconButton,
  InlineNote,
  InputGroup,
  Link,
  MarkdownDocument,
  NavigationRow,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
  Skeleton,
  TextInput,
  Typography,
  WorkspaceHeader,
  cn,
  defineSecondaryStack,
  treeBranchClassName,
  treeGlyphSlotClassName,
  treeItemClassName,
  treeItemLabelClassName,
  treeItemLabelTruncateClassName,
  treeLeafItemClassName,
  treeNodeClassName,
  treeRootClassName,
  treeRowClassName,
  treeStateLabelClassName,
  useSecondaryNavigation,
  useSecondaryStack,
  useWorkspaceCapabilities,
  type MarkdownDocumentLinkProps,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { NevoBrandLogo, defaultNevoBrand } from '../../brand';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { LoadingPresentation } from '../../app/loading/LoadingPresentation';
import { DocumentOutline } from '../../shared/document-reading/DocumentOutline';
import { DocumentOutlineSheet } from '../../shared/document-reading/DocumentOutlineSheet';
import {
  markdownOutline,
  outlineColumnMinWidth,
  outlineColumnWidth,
} from '../../shared/document-reading/markdownOutline';
import { DocumentProperties } from '../../shared/document-reading/DocumentProperties';
import {
  docsFor,
  inactiveDocs,
  isNonAuthoritative,
  search,
  sectionsOf,
  skippedDocsFor,
  workspaces,
  type MockSkipped,
  type MockDoc,
  type MockWorkspace,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/documentation-reader.md).
 * Static fixtures, local state instead of routes, no backend. It uses the real AppShell /
 * AppWorkspace / WorkspaceHeader, the tree recipes, MarkdownDocument and the Documents contents
 * column and sheet, so the geometry is the product's. Not responsive by pinning: the frame is the
 * viewport, so resize the browser (or the Playwright viewport) to see Wide / Compact / Narrow.
 * Approximations: the blocked image is drawn through `renderLink` (the proposed
 * `MarkdownDocument.renderImage` does not exist yet).
 */

export type ReaderScenario =
  | 'reader'
  | 'specification-entry'
  | 'no-root-index'
  | 'loading'
  | 'not-configured'
  | 'skipped-one'
  | 'skipped-many'
  | 'empty-corpus'
  | 'forbidden'
  | 'workspace-unavailable'
  | 'unknown-document'
  | 'document-removed'
  | 'superseded-document'
  | 'index-building';

export interface ReaderMockProps {
  scenario: ReaderScenario;
  workspaceId?: string;
  documentId?: string;
  sectionId?: string;
  query?: string;
  includeNonAuthoritative?: boolean;
  /** Owner decision: a global navigation row, or contextual entries only. */
  navEntry?: 'global' | 'contextual';
  /** Entered from a standalone Session's Context: the way back and the Session's workspace. */
  from?: 'session';
  /** Only the project folder is registered: no picker. */
  singleWorkspace?: boolean;
  /**
   * The current workspace context remembered in this tab (sessionStorage in the product). An unknown
   * or unavailable id falls back to the project folder with a quiet notice.
   */
  rememberedWorkspaceId?: string;
  /** Owner variant: show the current workspace on the navigation's Documentation row. */
  contextIndicator?: boolean;
}

const noop = () => undefined;
const workspaceById = (id: string) => workspaces.find((w) => w.workspaceId === id)!;
const workspaceName = (w: MockWorkspace) => w.name;

/* ---------------------------------------------------------------------------------------- */
/* Navigation (composed like ProductNavigation, without the router)                          */
/* ---------------------------------------------------------------------------------------- */

function ReaderNavigation({
  entry,
  page,
  current,
  indicator,
  onDocumentation,
}: {
  entry: 'global' | 'contextual';
  page: 'docs' | 'specification';
  current: MockWorkspace;
  /** Variant: the current workspace on the Documentation row (only when it is not the project folder). */
  indicator?: boolean;
  onDocumentation: () => void;
}) {
  const link = (href: string, onClick?: () => void) => (children: ReactNode, className: string) => (
    <a
      className={className}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  );
  const spec = page === 'specification';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ paddingInline: APP_NAVIGATION_INLINE_PADDING }}
    >
      <div className="shrink-0 py-5 pr-12">
        <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" size="md" type="horizontal" />
      </div>
      <Separator />
      <nav aria-label="Product" className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1" contentClassName="py-4" tabIndex={-1}>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            <NavigationRow
              selectionTreatment="surface"
              label="Specifications"
              icon={FileText}
              renderLink={link('#/')}
            />
            {entry === 'global' && (
              <NavigationRow
                selectionTreatment="surface"
                label="Documentation"
                icon={BookOpen}
                active={!spec}
                trailing={
                  indicator && !current.isRuntimeWorkspace ? (
                    <span className="block max-w-28 truncate" title={current.name}>
                      {current.name}
                    </span>
                  ) : undefined
                }
                renderLink={link('#/docs', onDocumentation)}
              />
            )}
          </ul>
          {spec && (
            // Stand-in for the Specification section of the real navigation (switcher + views).
            <section className="mt-5 min-w-0" aria-label="Current specification">
              <div className="rounded-control bg-surface-subtle px-3 py-2">
                <Typography as="span" variant="body-sm" className="mb-1 block text-content-muted">
                  Current specification
                </Typography>
                <Typography as="span" variant="title-sm" className="block text-content-primary">
                  Single sign-on with the corporate identity provider
                </Typography>
                <Typography as="span" variant="body-sm" className="block text-content-secondary">
                  UI-1234
                </Typography>
              </div>
              <ul className="m-0 mt-2 grid list-none gap-0.5 p-0">
                {['Overview', 'Sessions', 'Tasks', 'Documents', 'Changes', 'Repository'].map(
                  (view) => (
                    <NavigationRow
                      key={view}
                      selectionTreatment="surface"
                      label={view}
                      active={view === 'Overview'}
                      renderLink={link(`#/specs/ui-1234/${view.toLowerCase()}`)}
                    />
                  ),
                )}
              </ul>
            </section>
          )}
        </ScrollArea>
      </nav>
      <Separator />
      <div className="box-content flex h-shell-footer shrink-0 items-center" />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Workspace switcher                                                                        */
/* ---------------------------------------------------------------------------------------- */

function workspaceDescription(w: MockWorkspace): string {
  if (!w.available) {
    return w.unavailableReason ?? 'Unavailable';
  }

  const kind = w.kind === 'main' ? 'Project folder' : 'Worktree';
  const spec = w.specifications[0] ? ` · ${w.specifications[0]}` : '';

  return `${kind}${spec}`;
}

/**
 * The workspace picker of the documentation tree pane, in the Specification switcher's anatomy
 * (navigation): a subtle surface with a quiet label, the name, one context line and the chevrons;
 * a popover listbox of rows (name, bound Specification or kind, Selected and a check). It exists only
 * with more than one workspace. No search field: a project has a handful of workspaces.
 */
function WorkspacePicker({
  current,
  list,
  sessionWorkspace,
  onChange,
}: {
  current: MockWorkspace;
  list: MockWorkspace[];
  sessionWorkspace?: boolean;
  onChange: (workspaceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (list.length < 2) {
    return null;
  }

  const context = [
    workspaceDescription(current),
    sessionWorkspace && current.isRuntimeWorkspace ? "this Session's workspace" : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-control bg-surface-subtle">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-description="Change workspace"
            title={current.folder}
            className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <Typography as="span" variant="body-sm" className="mb-1 block pr-5 text-content-muted">
              Workspace
            </Typography>
            <Typography
              as="span"
              variant="title-sm"
              className="block pr-5 text-content-primary [overflow-wrap:anywhere]"
            >
              {workspaceName(current)}
            </Typography>
            <Typography as="span" variant="body-sm" className="block text-content-secondary">
              {context}
            </Typography>
            {current.dirty && (
              <Typography as="span" variant="body-sm" className="block text-content-muted">
                Uncommitted changes are included
              </Typography>
            )}
            <Icon name={ChevronsUpDown} size="sm" className="absolute right-3 top-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Change workspace"
          className="w-80 p-2"
          onOpenAutoFocus={(event) => {
            // Focus the current workspace, as the Specification switcher focuses its first option.
            event.preventDefault();
            document
              .querySelector<HTMLElement>(
                '[aria-label="Workspaces"] [role="option"][aria-selected="true"]',
              )
              ?.focus();
          }}
        >
          <div role="listbox" aria-label="Workspaces" className="grid gap-1">
            {list.map((w) => (
              <button
                key={w.workspaceId}
                type="button"
                role="option"
                aria-selected={w.workspaceId === current.workspaceId}
                aria-disabled={!w.available || undefined}
                tabIndex={w.workspaceId === current.workspaceId ? 0 : -1}
                onKeyDown={(event) => {
                  const options = [
                    ...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                      '[role="option"]',
                    ) ?? []),
                  ];
                  const index = options.indexOf(event.currentTarget);
                  const next =
                    event.key === 'ArrowDown'
                      ? (index + 1) % options.length
                      : event.key === 'ArrowUp'
                        ? (index - 1 + options.length) % options.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? options.length - 1
                            : undefined;
                  if (next !== undefined) {
                    event.preventDefault();
                    options[next]?.focus();
                  }
                }}
                className={cn(
                  'flex min-h-11 items-start gap-2 rounded-control px-2 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus-ring aria-selected:bg-surface-selected',
                  w.available ? 'hover:bg-surface-hover' : 'cursor-not-allowed',
                )}
                onClick={() => {
                  if (w.available) {
                    onChange(w.workspaceId);
                    setOpen(false);
                  }
                }}
              >
                <span className="min-w-0 flex-1">
                  <Typography
                    as="span"
                    variant="title-sm"
                    className={cn(
                      'block [overflow-wrap:anywhere]',
                      w.available ? 'text-content-primary' : 'text-content-muted',
                    )}
                  >
                    {workspaceName(w)}
                  </Typography>
                  <Typography
                    as="span"
                    variant="body-sm"
                    className={cn(
                      'block',
                      w.available ? 'text-content-secondary' : 'text-status-attention',
                    )}
                  >
                    {workspaceDescription(w)}
                  </Typography>
                  {w.workspaceId === current.workspaceId && (
                    <Typography
                      as="span"
                      variant="body-sm"
                      className="block text-content-secondary"
                    >
                      Selected
                    </Typography>
                  )}
                </span>
                {w.workspaceId === current.workspaceId && <Icon name="check" size="sm" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Search field                                                                              */
/* ---------------------------------------------------------------------------------------- */

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="search" className="px-1">
      <InputGroup>
        <InputGroup.Addon>
          <Icon name="search" size="sm" />
        </InputGroup.Addon>
        <TextInput
          type="search"
          className="[&::-webkit-search-cancel-button]:appearance-none"
          aria-label="Search documentation"
          placeholder="Search documentation"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value) {
              event.preventDefault();
              onChange('');
            }
          }}
        />
        {value && (
          <InputGroup.Action>
            <IconButton
              aria-label="Clear search"
              icon="close"
              size="xs"
              onClick={() => onChange('')}
            />
          </InputGroup.Action>
        )}
      </InputGroup>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Tree                                                                                      */
/* ---------------------------------------------------------------------------------------- */

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  docs: MockDoc[];
}

function buildTree(docs: MockDoc[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], docs: [] };
  for (const d of docs) {
    const parts = d.path.split('/');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}${part}/` : `${part}/`;
      let next = node.folders.find((f) => f.name === part);
      if (!next) {
        next = { name: part, path, folders: [], docs: [] };
        node.folders.push(next);
      }

      node = next;
    }

    node.docs.push(d);
  }

  const sort = (node: FolderNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name));
    // A folder's hub (README) leads its documents; the rest by title.
    node.docs.sort((a, b) =>
      a.type === 'hub' && b.type !== 'hub'
        ? -1
        : b.type === 'hub' && a.type !== 'hub'
          ? 1
          : a.title.localeCompare(b.title),
    );
    node.folders.forEach(sort);
  };

  sort(root);

  return root;
}

const ancestors = (path: string) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, i, all) => `${all.slice(0, i + 1).join('/')}/`);

function DocsTree({
  root,
  activeId,
  expanded,
  onToggle,
  onOpen,
}: {
  root: FolderNode;
  activeId?: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (id: string) => void;
}) {
  // One Tab stop (roving tabindex): the open document when it is visible, else the first row.
  const find = (node: FolderNode): MockDoc | undefined =>
    node.docs.find((d) => d.id === activeId) ?? node.folders.map(find).find(Boolean);
  const activeDoc = activeId ? find(root) : undefined;
  const activeVisible = Boolean(
    activeDoc && ancestors(activeDoc.path).every((path) => expanded.has(path)),
  );
  const firstKey = root.folders[0]?.path ?? root.docs[0]?.id;
  const stop = (key: string) => ((activeVisible ? key === activeId : key === firstKey) ? 0 : -1);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-tree-item]')];
    const current = event.target as HTMLElement;
    const index = items.indexOf(current);
    if (index < 0) {
      return;
    }

    const focus = (next?: HTMLElement) => {
      if (next) {
        event.preventDefault();
        items.forEach((item) => item.setAttribute('tabindex', '-1'));
        next.setAttribute('tabindex', '0');
        next.focus();
      }
    };

    const folder = current.dataset.folderPath;
    switch (event.key) {
      case 'ArrowDown':
        return focus(items[index + 1]);
      case 'ArrowUp':
        return focus(items[index - 1]);
      case 'Home':
        return focus(items[0]);
      case 'End':
        return focus(items.at(-1));
      case 'ArrowRight':
        if (folder && !expanded.has(folder)) {
          event.preventDefault();
          onToggle(folder);
        } else if (folder) {
          focus(items[index + 1]);
        }

        return;
      case 'ArrowLeft':
        if (folder && expanded.has(folder)) {
          event.preventDefault();
          onToggle(folder);
        } else {
          focus(items.find((item) => item.dataset.folderPath === current.dataset.parent));
        }

        return;
    }
  };

  const level = (node: FolderNode, top: boolean): ReactNode => (
    <ul className={top ? treeRootClassName : treeBranchClassName}>
      {node.folders.map((folder) => {
        const open = expanded.has(folder.path);
        // nonAuthoritative is a path prefix: it is said once, on the folder that owns it.
        const marked = isNonAuthoritative(folder.path) && !isNonAuthoritative(node.path || ' ');

        return (
          <li key={folder.path} className={treeNodeClassName}>
            <div className={treeRowClassName}>
              <button
                type="button"
                className={treeItemClassName}
                aria-expanded={open}
                data-tree-item=""
                data-folder-path={folder.path}
                data-parent={node.path}
                tabIndex={stop(folder.path)}
                onClick={() => onToggle(folder.path)}
              >
                <span className={treeGlyphSlotClassName}>
                  <Icon name={open ? 'chevron-down' : 'chevron-right'} />
                </span>
                <Icon name="folder" />
                <span className={treeItemLabelTruncateClassName}>{folder.name}</span>
                {marked && <span className={treeStateLabelClassName}>Non-authoritative</span>}
              </button>
            </div>
            {open && level(folder, false)}
          </li>
        );
      })}
      {node.docs.map((d) => (
        <li key={d.id} className={treeNodeClassName}>
          <div className={treeRowClassName}>
            <button
              type="button"
              className={
                top && node.folders.length === 0 ? treeItemClassName : treeLeafItemClassName
              }
              aria-current={d.id === activeId ? 'page' : undefined}
              data-tree-item=""
              data-parent={node.path}
              tabIndex={stop(d.id)}
              title={`${d.title}\ndocs/${d.path}`}
              onClick={() => onOpen(d.id)}
            >
              <Icon name="file" className="self-start" />
              {/* Titles are the reader's names and are long: they wrap instead of truncating. */}
              <span className={treeItemLabelClassName}>{d.title}</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <nav aria-label="Documents" className="min-w-0" onKeyDown={onKeyDown}>
      {level(root, true)}
    </nav>
  );
}

function TreeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading documents" className="grid gap-2 px-2 pt-1">
      {[72, 56, 64, 48, 80, 60, 52].map((w, i) => (
        <Skeleton key={i} className="h-5" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Search results                                                                            */
/* ---------------------------------------------------------------------------------------- */

function Results({
  docs,
  query,
  includeNonAuthoritative,
  indexBuilding,
  activeId,
  onIncludeChange,
  onClear,
  onOpen,
}: {
  docs: MockDoc[];
  query: string;
  includeNonAuthoritative: boolean;
  indexBuilding: boolean;
  activeId?: string;
  onIncludeChange: (v: boolean) => void;
  onClear: () => void;
  onOpen: (id: string, sectionId?: string) => void;
}) {
  const { results, hiddenNonAuthoritative } = useMemo(
    () => search(docs, query, includeNonAuthoritative),
    [docs, query, includeNonAuthoritative],
  );
  const toggle =
    hiddenNonAuthoritative > 0 ? (
      <Button variant="ghost" size="sm" onClick={() => onIncludeChange(true)}>
        Include {hiddenNonAuthoritative} non-authoritative
      </Button>
    ) : includeNonAuthoritative ? (
      <Button variant="ghost" size="sm" onClick={() => onIncludeChange(false)}>
        Leave out non-authoritative
      </Button>
    ) : null;

  if (results.length === 0) {
    return (
      <div className="px-2">
        <EmptyState
          variant="inline"
          icon="search"
          title="No matching documents"
          description={
            hiddenNonAuthoritative > 0
              ? `Nothing in the agreed documentation matches. ${hiddenNonAuthoritative === 1 ? '1 non-authoritative document does' : `${hiddenNonAuthoritative} non-authoritative documents do`}.`
              : 'Try other words, or browse the tree.'
          }
          actions={
            <>
              {hiddenNonAuthoritative > 0 && (
                <Button variant="secondary" size="sm" onClick={() => onIncludeChange(true)}>
                  Show non-authoritative
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onClear}>
                Clear search
              </Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <section aria-label="Search results" className="grid gap-1">
      <div className="grid gap-0.5 px-2" role="status">
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {results.length} {results.length === 1 ? 'document' : 'documents'}
        </Typography>
        {indexBuilding ? (
          <Typography as="p" variant="body-sm" className="text-content-muted">
            Word matches only for now: the search index is being built (62%).
          </Typography>
        ) : null}
      </div>
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {results.map(({ doc: d, section, snippet }) => (
          <li key={d.id}>
            <button
              type="button"
              aria-current={d.id === activeId ? 'page' : undefined}
              onClick={() => onOpen(d.id, section?.sectionId)}
              className={cn(
                'grid w-full min-w-0 gap-0.5 rounded-control px-2 py-2 text-left',
                'hover:bg-surface-hover aria-[current=page]:bg-surface-selected',
              )}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="line-clamp-2 min-w-0 flex-1 text-title-sm text-content-primary">
                  {d.title}
                </span>
                {isNonAuthoritative(d.path) && (
                  <span className={treeStateLabelClassName}>Non-authoritative</span>
                )}
              </span>
              {section && (
                <span className="truncate text-body-sm text-content-secondary">
                  {section.headingPath.join(' › ')}
                </span>
              )}
              <span className="line-clamp-2 text-body-sm text-content-muted">{snippet}</span>
            </button>
          </li>
        ))}
      </ul>
      {toggle && <div className="px-1">{toggle}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Links and images                                                                          */
/* ---------------------------------------------------------------------------------------- */

type Resolved =
  | { kind: 'document'; doc: MockDoc; sectionId?: string }
  | { kind: 'section'; sectionId: string }
  | { kind: 'external'; href: string }
  | { kind: 'superseded'; title: string; successor?: MockDoc }
  | { kind: 'blocked'; reason: string; target: string }
  | { kind: 'image'; src: string };

function normalize(base: string, relative: string): string | null {
  const parts = base.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (part === '..') {
      if (parts.length === 0) {
        return null;
      }

      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }

  return parts.join('/');
}

function resolveLink(
  href: string,
  from: MockDoc,
  docs: MockDoc[],
  skipped: MockSkipped[],
): Resolved {
  if (href.startsWith('nevo-mock-image:')) {
    return { kind: 'image', src: href.slice('nevo-mock-image:'.length) };
  }

  if (href.startsWith('#')) {
    return { kind: 'section', sectionId: href.slice(1) };
  }

  if (/^(https?:|mailto:)/i.test(href)) {
    return { kind: 'external', href };
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (scheme) {
    return {
      kind: 'blocked',
      reason: `${scheme[1]}: links are not opened from the documentation.`,
      target: href,
    };
  }

  const [path = '', fragment] = href.split('#');
  // Resolved from the repository root, so the reason can name the real target.
  const repoPath = normalize(`docs/${from.path}`, path);
  if (repoPath === null) {
    return {
      kind: 'blocked',
      reason: 'The target is outside the project folder. The reader opens only documents.',
      target: href,
    };
  }

  const folder = path.endsWith('/') || !/\.[a-z0-9]+$/i.test(repoPath);
  if (!repoPath.startsWith('docs/')) {
    return {
      kind: 'blocked',
      reason: folder
        ? 'This is a folder outside the documentation (docs/). The reader opens only documents.'
        : 'This file is outside the documentation (docs/). The reader opens only documents.',
      target: folder ? `${repoPath}/` : repoPath,
    };
  }

  const resolved = repoPath.slice('docs/'.length);
  if (folder) {
    return {
      kind: 'blocked',
      reason: 'This is a folder, not a document. Choose a document in the tree.',
      target: `${repoPath}/`,
    };
  }

  if (!resolved.endsWith('.md')) {
    return {
      kind: 'blocked',
      reason: 'This file is not a Markdown document, so the reader does not open it.',
      target: repoPath,
    };
  }

  const skip = skipped.find((item) => item.path === resolved);
  if (skip) {
    return {
      kind: 'blocked',
      reason: `The reader skips this document: ${skip.error}`,
      target: repoPath,
    };
  }

  const target = docs.find((d) => d.path === resolved);
  if (target) {
    return { kind: 'document', doc: target, sectionId: fragment };
  }

  const inactive = inactiveDocs[resolved];
  if (inactive) {
    return {
      kind: 'superseded',
      title: inactive.title,
      successor: docs.find((d) => d.id === inactive.supersededBy),
    };
  }

  return {
    kind: 'blocked',
    reason: 'There is no active document at this path in this workspace.',
    target: `docs/${resolved}`,
  };
}

/** An inline reference the reader does not open: its text, and the reason on demand (keyboard and touch). */
function InertReference({
  children,
  icon,
  title,
  reason,
  target,
  action,
}: {
  children: ReactNode;
  icon?: 'unlink' | 'image';
  title: string;
  reason: string;
  target?: string;
  action?: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline cursor-pointer text-left text-content-secondary underline decoration-dotted underline-offset-4"
        >
          {icon && (
            <Icon name={icon} size="sm" className="mr-1 inline align-[-2px] text-content-muted" />
          )}
          {children}
          <span className="sr-only"> ({title})</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-[min(20rem,calc(100vw-2rem))] gap-2 p-3">
        <Typography as="p" variant="label-md">
          {title}
        </Typography>
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {reason}
        </Typography>
        {target && (
          <Typography
            as="code"
            variant="code-md"
            className="select-all break-all text-content-muted"
          >
            {target}
          </Typography>
        )}
        {action}
      </PopoverContent>
    </Popover>
  );
}

const imagesAsLinks = (source: string) =>
  source.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '[$1](nevo-mock-image:$2)');

/* ---------------------------------------------------------------------------------------- */
/* Article                                                                                   */
/* ---------------------------------------------------------------------------------------- */

function Article({
  doc,
  docs,
  skipped,
  sectionId,
  workspace,
  sheetOpen,
  onSheetOpenChange,
  onColumnChange,
  onOpen,
  scrollMemory,
}: {
  doc: MockDoc;
  docs: MockDoc[];
  skipped: MockSkipped[];
  sectionId?: string;
  workspace: MockWorkspace;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  onColumnChange: (shown: boolean) => void;
  onOpen: (id: string, sectionId?: string) => void;
  /** Narrow stack: the reading position to return to when Back comes back to this article. */
  scrollMemory?: { get: () => number | undefined; set: (top: number) => void };
}) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [activeLine, setActiveLine] = useState<number>();
  const headings = useMemo(() => markdownOutline(doc.body), [doc.body]);
  const sections = useMemo(() => sectionsOf(doc.body), [doc.body]);
  const wide = width >= outlineColumnMinWidth;
  useLayoutEffect(() => {
    if (!panel) {
      return;
    }

    const measure = () => setWidth(panel.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);

    return () => observer.disconnect();
  }, [panel]);
  useLayoutEffect(
    () => onColumnChange(wide && headings.length > 1),
    [wide, headings, onColumnChange],
  );

  const goTo = (line: number) => {
    const target = panel?.querySelector<HTMLElement>(`[data-source-line="${line}"]`);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
      setActiveLine(line);
    }
  };

  // A section deep link (from a search result or a URL fragment) opens at its heading.
  useLayoutEffect(() => {
    const remembered = scrollMemory?.get();
    if (panel && remembered !== undefined) {
      panel.scrollTop = remembered;

      return;
    }

    const line = sections.find((s) => s.sectionId === sectionId)?.line;
    if (line) {
      goTo(line);
    } else {
      panel?.scrollTo({ top: 0 });
      setActiveLine(undefined);
    }
  }, [doc.id, sectionId, panel]);
  useEffect(() => {
    if (!panel || !scrollMemory) {
      return;
    }

    const save = () => scrollMemory.set(panel.scrollTop);
    panel.addEventListener('scroll', save, { passive: true });

    return () => panel.removeEventListener('scroll', save);
  }, [panel, scrollMemory]);

  const renderLink = ({ children, href = '' }: MarkdownDocumentLinkProps): ReactNode => {
    const target = resolveLink(href, doc, docs, skipped);
    switch (target.kind) {
      case 'document':
        return (
          <Link
            href={`#/workspaces/${workspace.workspaceId}/docs/${target.doc.id}${target.sectionId ? `#${target.sectionId}` : ''}`}
            onClick={(event) => {
              event.preventDefault();
              onOpen(target.doc.id, target.sectionId);
            }}
          >
            {children}
          </Link>
        );
      case 'section':
        return (
          <Link
            href={`#${target.sectionId}`}
            onClick={(event) => {
              event.preventDefault();
              onOpen(doc.id, target.sectionId);
            }}
          >
            {children}
          </Link>
        );
      case 'external':
        return null;
      case 'image':
        return (
          <InertReference
            icon="image"
            title="Image not shown"
            reason="The reader does not load images from documents yet."
            target={target.src}
          >
            {children ?? 'Image'}
          </InertReference>
        );
      case 'superseded':
        return (
          <InertReference
            title="Superseded document"
            reason={`${target.title} is no longer current, so the reader does not open it.`}
            action={
              target.successor ? (
                <Link
                  href={`#/workspaces/${workspace.workspaceId}/docs/${target.successor.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpen(target.successor!.id);
                  }}
                >
                  Open {target.successor.title}
                </Link>
              ) : undefined
            }
          >
            {children}
          </InertReference>
        );
      case 'blocked':
        return (
          <InertReference title="Link not opened" reason={target.reason} target={target.target}>
            {children}
          </InertReference>
        );
    }
  };

  const nonAuthoritative = isNonAuthoritative(doc.path);
  const lead = nonAuthoritative ? (
    <InlineNote>
      Non-authoritative: the project keeps proposals and drafts under ideas/. This document is not
      part of the agreed documentation and default search leaves it out.
    </InlineNote>
  ) : undefined;
  const properties = [
    { key: 'Path', value: `docs/${doc.path}` },
    { key: 'Type', value: doc.type },
    { key: 'Status', value: doc.status },
    { key: 'Summary', value: doc.summary },
    { key: 'ID', value: doc.id },
  ];
  const related = (doc.related ?? []).map((id) => ({
    id,
    doc: docs.find((d) => d.id === id),
  }));
  const text = (
    <>
      <MarkdownDocument source={imagesAsLinks(doc.body)} sourceLines renderLink={renderLink} />
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-8 grid gap-2">
          <Separator />
          <Typography
            as="h2"
            id="related-heading"
            variant="section-label"
            className="pt-2 text-content-muted"
          >
            Related
          </Typography>
          <ul className="m-0 grid list-none gap-1 p-0">
            {related.map(({ id, doc: target }) => (
              <li key={id} className="text-body-md">
                {target ? (
                  <Link
                    href={`#/workspaces/${workspace.workspaceId}/docs/${id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpen(id);
                    }}
                  >
                    {target.title}
                  </Link>
                ) : (
                  <span className="text-content-muted">
                    {inactiveDocs['ideas/navigation-v1.md']?.id === id
                      ? 'Navigation proposal v1 (superseded)'
                      : id}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
  const columnWidth = outlineColumnWidth(width);

  return (
    <>
      <ScrollArea
        direction="both"
        className="min-h-0 flex-1"
        contentClassName="p-6"
        viewportRef={setPanel}
      >
        {wide && headings.length > 1 ? (
          <div
            className="mx-auto flex items-start gap-8"
            style={{ maxWidth: `calc(var(--spacing-content-narrow) + ${columnWidth + 32}px)` }}
          >
            <div className="min-w-0 max-w-content-narrow flex-1">
              {lead && <div className="mb-4">{lead}</div>}
              {text}
            </div>
            <aside
              aria-label="Contents and properties"
              className="sticky top-0 grid shrink-0 grid-cols-1 gap-4"
              style={{ width: columnWidth }}
            >
              <DocumentProperties properties={properties} anchored={false} />
              <DocumentOutline headings={headings} activeLine={activeLine} onSelect={goTo} />
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-content-narrow">
            {lead && <div className="mb-4">{lead}</div>}
            <DocumentProperties properties={properties} />
            {text}
          </div>
        )}
      </ScrollArea>
      <DocumentOutlineSheet
        open={sheetOpen}
        headings={headings}
        activeLine={activeLine}
        onOpenChange={onSheetOpenChange}
        onSelected={(line) => goTo(line)}
      />
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Article states                                                                            */
/* ---------------------------------------------------------------------------------------- */

/**
 * Split layouts only, when the documentation has no root index (`<docs.root>/README.md`): one plain
 * sentence that says what this is. No list of documents to choose from: the tree is beside it.
 */
function NoIndexArticle({ workspace }: { workspace: MockWorkspace }) {
  return (
    <div className="max-w-content-narrow p-6">
      <Typography as="p" variant="body-md" className="text-content-secondary">
        This is the project documentation of {workspaceName(workspace)}; open a document in the list
        or search it.
      </Typography>
    </div>
  );
}

function ArticleProblem({
  kind,
  documentId,
  workspace,
  successor,
  onOpen,
}: {
  kind: 'unknown' | 'removed' | 'superseded';
  documentId: string;
  workspace: MockWorkspace;
  successor?: MockDoc;
  onOpen: (id: string) => void;
}) {
  const name = workspaceName(workspace);
  const content =
    kind === 'superseded'
      ? {
          title: 'This document was superseded',
          description: `${documentId} is no longer current documentation, so it is not shown.`,
        }
      : kind === 'removed'
        ? {
            title: 'This document is no longer in the workspace',
            description: `The documentation in ${name} changed while you were reading, and ${documentId} is not in it any more. The tree shows the current documents.`,
          }
        : {
            title: 'Document not found',
            description: `There is no current document ${documentId} in ${name}. It may exist only in another workspace, or it was moved or removed.`,
          };

  return (
    <EmptyState
      variant="pane"
      icon="file-search"
      title={content.title}
      description={<span className="wrap-anywhere">{content.description}</span>}
      actions={
        successor ? (
          <Button variant="secondary" onClick={() => onOpen(successor.id)}>
            Open {successor.title}
          </Button>
        ) : undefined
      }
    />
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Reader workspace                                                                          */
/* ---------------------------------------------------------------------------------------- */

function primaryHeader() {
  return <WorkspaceHeader title="Documentation" labels={{ moreActions: 'More actions' }} />;
}

function CorpusProblem({
  scenario,
  workspace,
  onRetry,
}: {
  scenario: ReaderScenario;
  workspace: MockWorkspace;
  onRetry: () => void;
}) {
  const name = workspaceName(workspace);
  switch (scenario) {
    case 'not-configured':
      return (
        <EmptyState
          variant="inline"
          icon="book-open"
          title="No project documentation"
          description={
            <>
              {name} has no documentation folder. The reader shows the Markdown documents under the
              folder set as <code>docs.root</code> in .nevo/config.yaml (docs/ by default).
            </>
          }
        />
      );
    case 'empty-corpus':
      return (
        <EmptyState
          variant="inline"
          icon="book-open"
          title="No documents yet"
          description={`The documentation folder of ${name} has no current documents.`}
        />
      );
    case 'workspace-unavailable':
      return (
        <Alert
          tone="attention"
          title="This workspace is unavailable right now"
          actions={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          <p className="wrap-anywhere">
            The folder {workspace.folder} cannot be read, for example while its branch is being
            switched or after the folder was moved. Choose another workspace or try again.
          </p>
        </Alert>
      );
    default:
      return null;
  }
}

/** Documents the reader skips (invalid frontmatter...): said once, quietly, with each path and error. */
function SkippedDocuments({ skipped }: { skipped: MockSkipped[] }) {
  const list = (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {skipped.map((item) => (
        <li key={item.path} className="grid gap-0.5">
          <Typography as="code" variant="code-md" className="wrap-anywhere text-content-secondary">
            docs/{item.path}
          </Typography>
          <Typography as="span" variant="body-sm" className="text-content-muted">
            {item.error}
          </Typography>
        </li>
      ))}
    </ul>
  );
  const title =
    skipped.length === 1
      ? '1 document is skipped: it has errors'
      : `${skipped.length} documents are skipped: they have errors`;

  return (
    <div className="grid gap-2 px-2" role="note">
      {skipped.length === 1 ? (
        <>
          <span className="flex items-start gap-2 text-body-sm text-status-attention">
            <Icon name="triangle-alert" size="sm" className="mt-0.5 shrink-0" />
            {title}
          </span>
          {list}
        </>
      ) : (
        <Collapsible className="-ml-control-padding-compact">
          <Collapsible.Trigger className="px-0 text-status-attention">
            <span className="flex items-start gap-2 text-body-sm">
              <Icon name="triangle-alert" size="sm" className="mt-0.5 shrink-0" />
              {title}
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content className="pl-control-padding-compact">{list}</Collapsible.Content>
        </Collapsible>
      )}
    </div>
  );
}

interface ReaderArticleContext {
  docs: MockDoc[];
  skipped: MockSkipped[];
  workspace: MockWorkspace;
  problemKind?: 'unknown' | 'removed' | 'superseded';
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  setColumnShown: (shown: boolean) => void;
  /** Opens from the tree, results or a problem state: a new stack on Narrow. */
  open: (id: string, sectionId?: string) => void;
  /** Marks the document in the tree without opening anything (a link hop on Narrow). */
  select: (id: string) => void;
}

const ReaderContext = createContext<ReaderArticleContext | null>(null);

interface ArticlePages {
  article: Record<string, never>;
  /** A document reached by a link from the article below it in the stack. */
  linked: { documentId: string; sectionId?: string; depth: string };
}

/**
 * Narrow: the article is pushed over the tree as a Secondary stack screen (as Documents does). An
 * internal link pushes another article screen, so Back returns to the previous article; only the
 * first screen's Back returns to the documentation.
 */
const articleStack = defineSecondaryStack<
  { workspaceId: string; documentId: string; sectionId?: string },
  { documentId: string; sectionId?: string },
  ArticlePages
>({
  id: 'docs-reader-article',
  initial: 'article',
  useData: ({ documentId, sectionId }) => ({ status: 'ready', data: { documentId, sectionId } }),
  screens: {
    article: {
      title: 'Document',
      header: ({ data }) => <ArticleStackHeader documentId={data.documentId} />,
      actions: () => stackActions,
      component: ({ data }) => (
        <ArticleStackScreen documentId={data.documentId} sectionId={data.sectionId} depth="root" />
      ),
    },
    linked: {
      title: 'Document',
      header: ({ params }) => <ArticleStackHeader documentId={params.documentId} />,
      actions: () => stackActions,
      component: ({ params }) => (
        <ArticleStackScreen
          documentId={params.documentId}
          sectionId={params.sectionId}
          depth={params.depth}
        />
      ),
    },
  },
});

const stackActions: WorkspaceHeaderAction[] = [
  { id: 'copy-link', label: 'Copy link', onPress: noop },
  { id: 'copy-path', label: 'Copy path', onPress: noop },
];

/** The title of the screen's own document (never a previous screen's). */
function ArticleStackHeader({ documentId }: { documentId: string }) {
  const context = useContext(ReaderContext);
  if (!context) {
    return null;
  }

  const doc = context.problemKind ? undefined : context.docs.find((d) => d.id === documentId);
  const headings = doc ? markdownOutline(doc.body) : [];

  return (
    <span className="flex min-w-0 items-center gap-1">
      <Typography as="h2" variant="title-sm" className="min-w-0 truncate" title={doc?.title}>
        {doc?.title ?? 'Document'}
      </Typography>
      {headings.length > 1 && (
        <IconButton
          icon="list"
          size="sm"
          aria-label="Contents"
          title="Contents"
          onClick={() => context.setSheetOpen(true)}
        />
      )}
    </span>
  );
}

/** Reading positions of the Narrow article screens: the stack remounts a screen on Back. */
const stackScroll = new Map<string, number>();

function ArticleStackScreen({
  documentId,
  sectionId,
  depth,
}: {
  documentId: string;
  sectionId?: string;
  depth: string;
}) {
  const context = useContext(ReaderContext);
  const stack = useSecondaryStack<ArticlePages>();
  const [section, setSection] = useState(sectionId);
  const key = `${depth}:${documentId}`;
  const [memory] = useState(() => ({
    get: () => stackScroll.get(key),
    set: (top: number) => stackScroll.set(key, top),
  }));
  // The stack can outlive the reader for a moment (a page swap): render nothing without it.
  if (!context) {
    return null;
  }

  const doc = context.docs.find((d) => d.id === documentId);
  if (context.problemKind || !doc) {
    return (
      <ArticleProblem
        kind={context.problemKind ?? 'unknown'}
        documentId={documentId}
        workspace={context.workspace}
        successor={
          context.problemKind === 'superseded'
            ? context.docs.find((d) => d.id === 'product.specflow.ui.interaction-model')
            : undefined
        }
        onOpen={context.open}
      />
    );
  }

  return (
    <AppContent className="h-full w-full">
      <Article
        key={`${context.workspace.workspaceId}:${doc.id}`}
        doc={doc}
        docs={context.docs}
        skipped={context.skipped}
        sectionId={section}
        workspace={context.workspace}
        sheetOpen={context.sheetOpen}
        onSheetOpenChange={context.setSheetOpen}
        onColumnChange={context.setColumnShown}
        scrollMemory={memory}
        onOpen={(id, next) => {
          if (id === doc.id) {
            setSection(next);

            return;
          }

          context.select(id);
          // A new hop starts at its own top or section, not at a remembered position.
          stackScroll.delete(`${depth}/${id}:${id}`);
          void stack.navTo('linked', { documentId: id, sectionId: next, depth: `${depth}/${id}` });
        }}
      />
    </AppContent>
  );
}

function ReaderWorkspace(
  props: ReaderMockProps & {
    list: MockWorkspace[];
    fallbackNotice?: string;
    onWorkspaceChange: (workspaceId: string) => void;
  },
) {
  const { scenario } = props;
  const { supportsSplit, measured } = useWorkspaceCapabilities();
  const [workspaceId, setWorkspaceId] = useState(props.workspaceId ?? 'ws-main');
  const [documentId, setDocumentId] = useState<string | undefined>(props.documentId);
  const [sectionId, setSectionId] = useState<string | undefined>(props.sectionId);
  const [query, setQuery] = useState(props.query ?? '');
  const [debounced, setDebounced] = useState(props.query ?? '');
  const [includeNA, setIncludeNA] = useState(props.includeNonAuthoritative ?? false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [columnShown, setColumnShown] = useState(false);
  const [switchNote, setSwitchNote] = useState<string>();
  const workspace = workspaceById(workspaceId);
  const skipped = skippedDocsFor(scenario);
  const docs = docsFor(workspaceId).filter(
    (d) =>
      !skipped.some((k) => k.path === d.path) &&
      !(scenario === 'no-root-index' && d.path === 'README.md'),
  );
  // Split layouts open the documentation's root index when the route names no document; the
  // route stays `/workspaces/:id/docs`. Narrow keeps the tree as its first screen.
  const rootIndex = docs.find((d) => d.path === 'README.md');
  const shownId = documentId ?? (supportsSplit ? rootIndex?.id : undefined);
  const doc = docs.find((d) => d.id === shownId);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(doc ? ancestors(doc.path) : []),
  );
  const root = useMemo(() => buildTree(docs), [docs]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);

    return () => clearTimeout(timer);
  }, [query]);

  const navigation = useSecondaryNavigation();
  const select = (id: string) => {
    const target = docsFor(workspaceId).find((d) => d.id === id);
    setDocumentId(id);
    setSwitchNote(undefined);
    if (target) {
      setExpanded((current) => new Set([...current, ...ancestors(target.path)]));
    }
  };

  const open = (id: string, section?: string) => {
    if (measured && !supportsSplit) {
      stackScroll.clear();
      void navigation.open(articleStack, { workspaceId, documentId: id, sectionId: section });
    }

    select(id);
    setSectionId(section);
  };

  const switchWorkspace = (next: string) => {
    // The same document id and the same query are looked up again in the new workspace; nothing
    // from the previous workspace is shown under the new one.
    const nextDocs = docsFor(next);
    setWorkspaceId(next);
    // An explicit pick sets the current workspace context.
    props.onWorkspaceChange(next);
    const keeps = Boolean(documentId && nextDocs.some((d) => d.id === documentId));
    if (documentId && !keeps) {
      setSwitchNote(`${doc?.title ?? documentId} is not in ${workspaceName(workspaceById(next))}.`);
      setDocumentId(undefined);
      setSectionId(undefined);
    }

    // Narrow: the stack belongs to the previous workspace; reopen the same document in the new one.
    if (!supportsSplit && navigation.isOpen) {
      void navigation
        .close()
        .then(() =>
          keeps && documentId
            ? navigation.open(articleStack, { workspaceId: next, documentId })
            : undefined,
        );
    }
  };

  useEffect(() => {
    // Only once the shell has measured: before that `supportsSplit` is a guess. A deep link (or a
    // reload) on Narrow shows the article; a split layout never keeps the Narrow stack.
    if (!measured) {
      return;
    }

    if (supportsSplit) {
      if (navigation.isOpen) {
        void navigation.close();
      }
    } else if (documentId && !navigation.isOpen && scenario !== 'loading') {
      void navigation.open(articleStack, { workspaceId, documentId, sectionId });
    }
  }, [measured, supportsSplit]);

  const corpusProblem =
    scenario === 'not-configured' ||
    scenario === 'empty-corpus' ||
    scenario === 'workspace-unavailable';
  const loading = scenario === 'loading';
  const searching = debounced.length > 0 && !corpusProblem && !loading;

  const primary = (
    <AppWorkspace.Primary header={primaryHeader()}>
      <AppContent className="h-full w-full">
        <ScrollArea
          direction="vertical"
          className="min-h-0 flex-1"
          contentClassName="grid content-start gap-3 p-2"
        >
          {props.from === 'session' && (
            <div className="px-2">
              <Link
                href="#/sessions/s-42"
                onClick={(event) => event.preventDefault()}
                className="text-body-sm"
              >
                ← Session: Fix the login redirect after token refresh
              </Link>
            </div>
          )}
          <WorkspacePicker
            current={workspace}
            list={props.list}
            sessionWorkspace={props.from === 'session'}
            onChange={switchWorkspace}
          />
          {props.fallbackNotice && (
            <Typography
              as="p"
              variant="body-sm"
              role="status"
              className="px-2 text-content-secondary"
            >
              {props.fallbackNotice}
            </Typography>
          )}
          {skipped.length > 0 && <SkippedDocuments skipped={skipped} />}
          {corpusProblem ? (
            // Split layouts keep their geometry: the problem is said where the article would be.
            !supportsSplit && (
              <div className="px-2">
                <CorpusProblem scenario={scenario} workspace={workspace} onRetry={noop} />
              </div>
            )
          ) : (
            <>
              <SearchField value={query} onChange={setQuery} />
              {switchNote && (
                <Typography
                  as="p"
                  variant="body-sm"
                  role="status"
                  className="px-2 text-content-secondary"
                >
                  {switchNote}
                </Typography>
              )}
              {loading ? (
                <TreeSkeleton />
              ) : searching ? (
                <Results
                  docs={docs}
                  query={debounced}
                  includeNonAuthoritative={includeNA}
                  indexBuilding={scenario === 'index-building'}
                  activeId={doc?.id ?? documentId}
                  onIncludeChange={setIncludeNA}
                  onClear={() => setQuery('')}
                  onOpen={open}
                />
              ) : (
                <DocsTree
                  root={root}
                  activeId={doc?.id ?? documentId}
                  expanded={expanded}
                  onToggle={(path) =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(path)) {
                        next.delete(path);
                      } else {
                        next.add(path);
                      }

                      return next;
                    })
                  }
                  onOpen={(id) => open(id)}
                />
              )}
            </>
          )}
        </ScrollArea>
      </AppContent>
    </AppWorkspace.Primary>
  );

  const problemKind =
    scenario === 'unknown-document'
      ? 'unknown'
      : scenario === 'document-removed'
        ? 'removed'
        : scenario === 'superseded-document'
          ? 'superseded'
          : undefined;
  const articleOpen = Boolean(doc ?? documentId) && !corpusProblem;
  const headerActions: WorkspaceHeaderAction[] = doc
    ? [
        { id: 'copy-link', label: 'Copy link', onPress: noop },
        { id: 'copy-path', label: 'Copy path', onPress: noop },
      ]
    : [];
  const showContents = doc && !columnShown && markdownOutline(doc.body).length > 1;

  let secondaryBody: ReactNode;
  if (loading) {
    secondaryBody = (
      <div className="p-6">
        <LoadingPresentation shape="document" label="Loading the document" />
      </div>
    );
  } else if (doc && !problemKind) {
    secondaryBody = (
      <AppContent className="h-full w-full">
        <Article
          key={`${workspaceId}:${doc.id}`}
          doc={doc}
          docs={docs}
          skipped={skipped}
          sectionId={sectionId}
          workspace={workspace}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          onColumnChange={setColumnShown}
          onOpen={open}
        />
      </AppContent>
    );
  } else if (documentId && problemKind) {
    secondaryBody = (
      <ArticleProblem
        kind={problemKind}
        documentId={documentId}
        workspace={workspace}
        successor={
          problemKind === 'superseded'
            ? docs.find((d) => d.id === 'product.specflow.ui.interaction-model')
            : undefined
        }
        onOpen={open}
      />
    );
  }

  const context: ReaderArticleContext = {
    docs,
    skipped,
    workspace,
    problemKind,
    sheetOpen,
    setSheetOpen,
    setColumnShown,
    open,
    select,
  };

  return (
    <ReaderContext.Provider value={context}>
      <AppWorkspace
        scroll="content"
        fit="available"
        stackedSecondaryClose="hide"
        primaryMaxPx={360}
        split="secondary"
        labels={{ backToPrimary: 'Back to documentation', closeSecondary: 'Close document' }}
      >
        {primary}
        {articleOpen && supportsSplit && measured ? (
          // No Close: the article area always shows a document (the root index by default), so
          // closing would only lead back to the index.
          <AppWorkspace.Secondary
            open
            header={
              <WorkspaceHeader
                headingLevel={2}
                title={doc?.title ?? 'Document'}
                actions={headerActions}
                labels={{ moreActions: 'More actions' }}
                identityContent={
                  <span className="flex min-w-0 items-center gap-1">
                    <Typography
                      as="h2"
                      variant="title-sm"
                      className="min-w-0 truncate"
                      title={doc?.title}
                    >
                      {doc?.title ?? 'Document'}
                    </Typography>
                    {showContents && (
                      <IconButton
                        icon="list"
                        size="sm"
                        aria-label="Contents"
                        title="Contents"
                        onClick={() => setSheetOpen(true)}
                      />
                    )}
                  </span>
                }
              />
            }
          >
            {secondaryBody}
          </AppWorkspace.Secondary>
        ) : supportsSplit && corpusProblem ? (
          <AppWorkspace.Secondary header={<WorkspaceHeader headingLevel={2} title="Document" />}>
            <div className="max-w-content-narrow p-6">
              <CorpusProblem scenario={scenario} workspace={workspace} onRetry={noop} />
            </div>
          </AppWorkspace.Secondary>
        ) : supportsSplit ? (
          <AppWorkspace.Secondary header={<WorkspaceHeader headingLevel={2} title="Document" />}>
            <NoIndexArticle workspace={workspace} />
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
    </ReaderContext.Provider>
  );
}

function Forbidden() {
  return (
    <AppWorkspace scroll="content" fit="bounded">
      <AppWorkspace.Primary header={primaryHeader()}>
        <AppContent className="h-full w-full">
          <EmptyState
            variant="pane"
            icon={Lock}
            title="No access to the project documentation"
            description="Your role in this project does not include reading its documentation. Ask a project administrator for access."
          />
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Root                                                                                      */
/* ---------------------------------------------------------------------------------------- */

/**
 * Stand-in for the Specification Overview of a Specification bound to a worktree: entering it sets the
 * current workspace context. Only what the scenario needs (the real Overview is not reproduced).
 */
function SpecificationPlaceholder({
  onEnter,
  onDocumentation,
}: {
  onEnter: () => void;
  onDocumentation: () => void;
}) {
  const sso = workspaceById('ws-sso');
  // Entering a Specification sets the current workspace to the one it is bound to.
  useEffect(onEnter, []);

  return (
    <AppWorkspace scroll="content" fit="available">
      <AppWorkspace.Primary header={<WorkspaceHeader title="Overview" />}>
        <AppContent className="h-full w-full">
          <div className="grid max-w-content-narrow content-start gap-3 p-4">
            <Typography as="p" variant="body-sm" className="text-content-muted">
              Specification Overview (placeholder)
            </Typography>
            <Typography as="p" variant="title-sm">
              Workspace
            </Typography>
            <Typography as="p" variant="body-md" className="wrap-anywhere text-content-secondary">
              {sso.name} · Worktree
            </Typography>
            <div>
              <Button variant="secondary" size="sm" onClick={onDocumentation}>
                Documentation of this workspace
              </Button>
            </div>
          </div>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}

const PROJECT_FOLDER = 'ws-main';

/** The tab's current workspace: the last entered Specification's or the last explicit pick. */
function resolveContext(id: string | undefined): { workspaceId: string; notice?: string } {
  if (!id) {
    return { workspaceId: PROJECT_FOLDER };
  }

  const known = workspaces.find((w) => w.workspaceId === id);
  if (known?.available) {
    return { workspaceId: id };
  }

  const main = workspaceById(PROJECT_FOLDER).name;

  return {
    workspaceId: PROJECT_FOLDER,
    notice: known
      ? `${known.name} is unavailable right now, so this is the documentation of ${main}.`
      : `The workspace you were reading is no longer registered, so this is the documentation of ${main}.`,
  };
}

export function ReaderMock(props: ReaderMockProps): ReactNode {
  const [page, setPage] = useState<'docs' | 'specification'>(
    props.scenario === 'specification-entry' ? 'specification' : 'docs',
  );
  // An explicit deep link (`workspaceId`) wins; otherwise the remembered context, else the project folder.
  const [context, setContext] = useState(() =>
    resolveContext(props.workspaceId ?? props.rememberedWorkspaceId),
  );
  const list = props.singleWorkspace ? [workspaceById(PROJECT_FOLDER)] : workspaces;
  const current = workspaceById(context.workspaceId);

  return (
    <StoryLocalization locale="en">
      <div className="h-dvh w-full">
        <AppShell
          navigation={
            <ReaderNavigation
              entry={props.navEntry ?? 'global'}
              page={page}
              current={current}
              indicator={props.contextIndicator}
              onDocumentation={() => setPage('docs')}
            />
          }
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Navigation', closeNavigation: 'Close navigation' }}
        >
          <AppWorkspaceProvider scopeKey={`docs-${page}`}>
            {props.scenario === 'forbidden' ? (
              <Forbidden />
            ) : page === 'specification' ? (
              <SpecificationPlaceholder
                onEnter={() => setContext({ workspaceId: 'ws-sso' })}
                onDocumentation={() => {
                  setPage('docs');
                }}
              />
            ) : (
              <ReaderWorkspace
                {...props}
                scenario={props.scenario === 'specification-entry' ? 'reader' : props.scenario}
                workspaceId={context.workspaceId}
                list={list}
                fallbackNotice={context.notice}
                onWorkspaceChange={(workspaceId) => setContext({ workspaceId })}
              />
            )}
          </AppWorkspaceProvider>
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
