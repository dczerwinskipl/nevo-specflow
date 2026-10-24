/** What the strip shows of one open document. The label comes from the tree, never from a request. */
export interface DocumentTab {
  id: string;
  label: string;
  /** The full path: tooltip and the Opened menu. */
  path: string;
  dirty: boolean;
  state: 'ready' | 'loading' | 'missing';
}

export function fileNameOf(path: string) {
  const name = path.split('/').at(-1);
  return name === undefined || name === '' ? path : name;
}

/** The tab that takes over when `id` closes: right neighbour, else left; none for the last one. */
export function neighbourOf(ids: readonly string[], id: string): string | undefined {
  const index = ids.indexOf(id);
  if (index < 0) return undefined;
  return ids[index + 1] ?? ids[index - 1];
}

/** As `neighbourOf`, when several tabs close at once: the nearest tab that stays. */
export function survivorOf(ids: readonly string[], id: string, removed: readonly string[]) {
  const index = ids.indexOf(id);
  if (index < 0) return undefined;
  const stays = (candidate: string) => !removed.includes(candidate);
  return ids.slice(index + 1).find(stays) ?? ids.slice(0, index).reverse().find(stays);
}

export function documentTabs(options: {
  ids: readonly string[];
  tree:
    | {
        documents: readonly { id: string; path: string }[];
        /** Registry entries whose file is missing: their tab is missing but keeps the name. */
        dangling?: readonly { id: string; path: string }[];
      }
    | undefined;
  dirty: readonly string[];
  /** Documents the Runtime reported as gone although the tree may still list them. */
  unavailable?: readonly string[];
  /** The last path the tree had for a document: a missing tab keeps its name. */
  knownPaths?: Readonly<Record<string, string>>;
}): DocumentTab[] {
  const { ids, tree, dirty, unavailable = [], knownPaths = {} } = options;
  return ids.map((id) => {
    const entry = tree?.documents.find((document) => document.id === id);
    const dangling = tree?.dangling?.find((document) => document.id === id);
    const missing = unavailable.includes(id) || (tree !== undefined && !entry);
    const path = entry?.path ?? dangling?.path ?? knownPaths[id] ?? id;
    return {
      id,
      label: fileNameOf(path),
      path,
      dirty: dirty.includes(id),
      state: missing ? 'missing' : tree ? 'ready' : 'loading',
    };
  });
}
