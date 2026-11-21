import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { EXECUTION_DIRECTORY } from '../../../specs/execution-paths';
import { parseSpecificationManifestText } from '../../../specs/model';
import type { UncleanPath } from '../../../specs/lifecycle/preflight';
import { parseTaskManifest } from '../../../tasks/resource/codec';
import { TASK_MANIFEST_FILE, TASKS_FOLDER } from '../../../tasks/resource/model';
import type { AttributionArea, AttributionFacts, DirtyPathFact } from './attribution';
import { dirtySetOf } from './dirty-set';

/**
 * Where a checkout keeps what the Engine owns, checkout-relative with `/` separators, derived from
 * the configuration (never hardcoded at the call site): the Specification root (`<root>/<location>/
 * <slug>/` are Specification directories) and the Engine's namespaces (its project folder of the
 * Project Home, and the local state when it lies in this checkout).
 */
export interface AttributionLayout {
  readonly specificationRoot: string;
  readonly namespaces: readonly string[];
}

/** The Engine's own uncommitted writes of the checkout: post-images by path. */
export interface EngineWrites {
  readonly postImages: ReadonlyMap<string, readonly (string | null)[]>;
  /** A record of them could not be read in full: nothing is attributed (fail closed). */
  readonly complete: boolean;
}

const LOCATIONS: ReadonlySet<string> = new Set(['active', 'archive']);

function under(path: string, directory: string): boolean {
  return directory !== '' && path.startsWith(directory + '/');
}

/** The Specification directory a path lies in (`<root>/<location>/<slug>`), if any. */
function specificationDirectoryOf(path: string, root: string): string | undefined {
  if (!under(path, root)) {
    return undefined;
  }

  const [location, slug, ...rest] = path.slice(root.length + 1).split('/');

  return location !== undefined && LOCATIONS.has(location) && slug && rest.length > 0
    ? `${root}/${location}/${slug}`
    : undefined;
}

/** The registered document paths of a registry file, relative to its folder; `undefined` if unreadable. */
type RegistryReader = (
  directory: string,
  kind: 'specification' | 'task',
) => Promise<ReadonlySet<string> | undefined>;

function registryReader(root: string): RegistryReader {
  const known = new Map<string, Promise<ReadonlySet<string> | undefined>>();

  return (directory, kind) => {
    let read = known.get(directory);
    if (read === undefined) {
      read = (async () => {
        const segments = directory.split('/');
        try {
          const file = kind === 'specification' ? 'specification.yaml' : TASK_MANIFEST_FILE;
          const text = await readFile(join(root, ...segments, file), 'utf8');
          const documents =
            kind === 'specification'
              ? parseSpecificationManifestText(
                  text,
                  segments.at(-1)!,
                  segments.at(-2) as 'active' | 'archive',
                ).documents
              : parseTaskManifest(text, segments.at(-1)!).documents;

          return new Set(documents.map((document) => document.path));
        } catch {
          // A registry that cannot be read registers nothing; its own file is dirty or broken.
          return undefined;
        }
      })();
      known.set(directory, read);
    }

    return read;
  };
}

/**
 * Whether a new file of a Specification directory is registered: listed by the Specification's
 * manifest, or (below `tasks/<taskId>/`) by its Task's `task.yaml`. The registry files and the
 * execution state (`.execution/**`, `tasks/index.yaml`) are the Engine's own files, never documents.
 */
async function isRegistered(
  path: string,
  directory: string,
  registries: RegistryReader,
): Promise<boolean> {
  const inside = path.slice(directory.length + 1);
  const segments = inside.split('/');
  if (segments[0] === TASKS_FOLDER) {
    if (segments.length < 3) {
      return true;
    }

    const relative = segments.slice(2).join('/');
    if (relative === TASK_MANIFEST_FILE) {
      return true;
    }

    const listed = await registries(`${directory}/${TASKS_FOLDER}/${segments[1]!}`, 'task');

    return listed?.has(relative) ?? false;
  }

  if (inside === 'specification.yaml' || segments[0] === EXECUTION_DIRECTORY) {
    return true;
  }

  return (await registries(directory, 'specification'))?.has(inside) ?? false;
}

/**
 * The attribution facts of a checkout from what its Git status reports (`listUncleanPaths`: staged,
 * modified, removed and untracked paths, never ignored ones): each path's content hash now
 * (`dirtySetOf`, bounded), whether it is new, where it lies and which post-images the Engine's own
 * uncommitted writes left on it. Lock-free; reads only the checkout.
 */
export async function attributionFactsOf(
  root: string,
  unclean: readonly UncleanPath[],
  layout: AttributionLayout,
  writes: EngineWrites,
): Promise<AttributionFacts> {
  const added = new Set(
    unclean
      .filter((entry) => entry.status === '??' || entry.status.startsWith('A'))
      .map((entry) => entry.path),
  );
  const dirty = await dirtySetOf(
    root,
    unclean.map((entry) => entry.path),
  );
  const registries = registryReader(root);
  const paths: DirtyPathFact[] = [];
  for (const entry of dirty.paths) {
    const isAdded = added.has(entry.path);
    const directory = specificationDirectoryOf(entry.path, layout.specificationRoot);
    let area: AttributionArea;
    if (directory !== undefined) {
      area = {
        kind: 'specification',
        // Only a new file can be unregistered; a tracked one is judged by its bytes alone.
        registered: !isAdded || (await isRegistered(entry.path, directory, registries)),
      };
    } else if (layout.namespaces.some((namespace) => under(entry.path, namespace))) {
      area = { kind: 'engine' };
    } else {
      area = { kind: 'code' };
    }

    const engine = writes.postImages.get(entry.path);
    paths.push({
      path: entry.path,
      sha256: entry.sha256,
      ...(entry.oversize ? { oversize: true as const } : {}),
      added: isAdded,
      area,
      ...(engine !== undefined ? { engine } : {}),
    });
  }

  return { paths, incomplete: dirty.truncated || !writes.complete };
}
