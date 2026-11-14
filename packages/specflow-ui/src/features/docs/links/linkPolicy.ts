import type { WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';

/**
 * Why a reference in a document is not opened (the popover's payload). `target` is what the reader
 * shows: a path relative to `docs.root` for a reference inside it, the repository path for one
 * outside it, or the reference as written for a scheme.
 */
export type InertLinkReason =
  /** A deprecated or superseded document; `successor` when its `superseded_by` is a current one. */
  | {
      readonly reason: 'superseded';
      readonly target: string;
      readonly status: string;
      readonly successor?: { readonly documentId: string; readonly title: string };
    }
  /**
   * A file or folder outside `docs.root`; `target` is relative to the checkout (one above it keeps
   * its leading `../`).
   */
  | { readonly reason: 'outside-docs'; readonly target: string }
  | { readonly reason: 'folder'; readonly target: string }
  | { readonly reason: 'not-markdown'; readonly target: string }
  | { readonly reason: 'skipped'; readonly target: string; readonly error: string }
  | { readonly reason: 'missing'; readonly target: string }
  /**
   * Any scheme but `http:`, `https:` and `mailto:`. `scheme` is absent when the Markdown renderer
   * already emptied the address (it drops `javascript:`, `data:`, `file:` and the like).
   */
  | { readonly reason: 'unsafe-scheme'; readonly target: string; readonly scheme?: string };

export type DocsLinkTarget =
  /** Another current document of this workspace, at a section when the link names one. */
  | { readonly kind: 'document'; readonly documentId: string; readonly sectionId?: string }
  /** A section of the document being read (`#section`, or a link to this same document). */
  | { readonly kind: 'section'; readonly sectionId: string }
  /** `http:`, `https:` or `mailto:`: opened in a new tab with `noopener noreferrer`. */
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'inert'; readonly inert: InertLinkReason };

/** What the policy looks links up in: the tree's three lists, indexed by path under `docs.root`. */
export interface DocsLinkIndex {
  /** `docs.root` relative to the checkout, `''` when it is the checkout itself. */
  readonly docsRoot: string;
  readonly documents: ReadonlyMap<string, string>;
  readonly inactive: ReadonlyMap<string, WorkspaceDocsTree['inactive'][number]>;
  readonly skipped: ReadonlyMap<string, string>;
  /** Every folder that holds a listed file, `''` being `docs.root` itself. */
  readonly folders: ReadonlySet<string>;
  readonly titles: ReadonlyMap<string, string>;
}

/** The text before the first heading: the section a link to the document itself opens. */
export const topSectionId = '_top';

function foldersOf(paths: Iterable<string>): Set<string> {
  const folders = new Set<string>(['']);
  for (const path of paths) {
    const parts = path.split('/');
    for (let end = 1; end < parts.length; end++) {
      folders.add(parts.slice(0, end).join('/'));
    }
  }

  return folders;
}

export function createDocsLinkIndex(
  tree: Pick<WorkspaceDocsTree, 'docsRoot' | 'documents' | 'inactive' | 'skipped'>,
): DocsLinkIndex {
  return {
    docsRoot: resolvePath('', tree.docsRoot),
    documents: new Map(tree.documents.map((doc) => [doc.path, doc.documentId])),
    inactive: new Map(tree.inactive.map((doc) => [doc.path, doc])),
    skipped: new Map(tree.skipped.map((doc) => [doc.path, doc.error])),
    folders: foldersOf([
      ...tree.documents.map((doc) => doc.path),
      ...tree.inactive.map((doc) => doc.path),
      ...tree.skipped.map((doc) => doc.path),
    ]),
    titles: new Map(tree.documents.map((doc) => [doc.documentId, doc.title])),
  };
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * `relative` resolved against the folder of `fromPath`, both under `docs.root`. A result above
 * `docs.root` keeps its leading `../` segments.
 */
function resolvePath(fromPath: string, relative: string): string {
  const parts = fromPath.split('/').slice(0, -1);
  let above = 0;
  for (const part of relative.split('/')) {
    if (part === '..') {
      if (parts.length > 0) {
        parts.pop();
      } else {
        above++;
      }
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }

  return [...Array<string>(above).fill('..'), ...parts].join('/');
}

const externalScheme = /^(?:https?:\/\/|mailto:)/i;
const anyScheme = /^([a-z][a-z0-9+.-]*):/i;
const markdownFile = /\.md$/i;
const anyExtension = /\.[^./]+$/;

const inert = (reason: InertLinkReason): DocsLinkTarget => ({ kind: 'inert', inert: reason });

/**
 * Where a link of the document at `fromPath` (under `docs.root`) leads in the reader. Only the
 * current documents of this workspace open; everything else is inert with its reason.
 */
export function resolveDocsLink(
  href: string | undefined,
  context: {
    readonly fromPath: string;
    readonly fromDocumentId: string;
    readonly index: DocsLinkIndex;
  },
): DocsLinkTarget {
  const raw = href?.trim() ?? '';
  if (raw === '') {
    return inert({ reason: 'unsafe-scheme', target: '' });
  }

  if (raw.startsWith('#')) {
    return { kind: 'section', sectionId: decode(raw.slice(1)) || topSectionId };
  }

  if (externalScheme.test(raw)) {
    return { kind: 'external', href: raw };
  }

  const scheme = anyScheme.exec(raw);
  if (scheme || raw.startsWith('//')) {
    return inert({
      reason: 'unsafe-scheme',
      target: raw,
      ...(scheme ? { scheme: scheme[1]! } : {}),
    });
  }

  const hash = raw.indexOf('#');
  const pathPart = decode((hash === -1 ? raw : raw.slice(0, hash)).replace(/\?.*$/, ''));
  const fragment = hash === -1 ? undefined : decode(raw.slice(hash + 1)) || undefined;
  const { fromPath, fromDocumentId, index } = context;
  const asFolder = pathPart.endsWith('/');
  const outside = (repositoryPath: string) =>
    inert({
      reason: 'outside-docs',
      target: asFolder && repositoryPath !== '' ? `${repositoryPath}/` : repositoryPath || './',
    });
  const root = index.docsRoot;
  let path: string;
  if (pathPart.startsWith('/')) {
    // A repository-root path: inside the documentation only below `docs.root`.
    const repositoryPath = resolvePath('', pathPart);
    if (root !== '' && repositoryPath !== root && !repositoryPath.startsWith(`${root}/`)) {
      return outside(repositoryPath);
    }

    path = root === '' ? repositoryPath : repositoryPath.slice(root.length + 1);
  } else {
    path = resolvePath(fromPath, pathPart);
    if (path === '..' || path.startsWith('../')) {
      return outside(resolvePath(root === '' ? fromPath : `${root}/${fromPath}`, pathPart));
    }
  }

  if (asFolder || index.folders.has(path)) {
    return inert({ reason: 'folder', target: path === '' ? './' : `${path}/` });
  }

  if (!markdownFile.test(path)) {
    return inert({ reason: anyExtension.test(path) ? 'not-markdown' : 'missing', target: path });
  }

  const skipped = index.skipped.get(path);
  if (skipped !== undefined) {
    return inert({ reason: 'skipped', target: path, error: skipped });
  }

  const documentId = index.documents.get(path);
  if (documentId !== undefined) {
    if (documentId === fromDocumentId) {
      return { kind: 'section', sectionId: fragment ?? topSectionId };
    }

    return fragment === undefined
      ? { kind: 'document', documentId }
      : { kind: 'document', documentId, sectionId: fragment };
  }

  const inactive = index.inactive.get(path);
  if (inactive) {
    const successorTitle =
      inactive.supersededBy === undefined ? undefined : index.titles.get(inactive.supersededBy);

    return inert({
      reason: 'superseded',
      target: path,
      status: inactive.status,
      ...(inactive.supersededBy !== undefined && successorTitle !== undefined
        ? { successor: { documentId: inactive.supersededBy, title: successorTitle } }
        : {}),
    });
  }

  return inert({ reason: 'missing', target: path });
}
