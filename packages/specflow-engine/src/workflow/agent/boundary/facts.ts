import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TASK_MAIN_DOCUMENT } from '@nevo/specflow-contracts/documents';

import { EXECUTION_DIRECTORY } from '../../../specs/execution-paths';
import { parseSpecificationManifestText } from '../../../specs/model';
import type { UncleanPath } from '../../../specs/lifecycle/preflight';
import { parseTaskManifest } from '../../../tasks/resource/codec';
import { TASK_MANIFEST_FILE, TASKS_FOLDER } from '../../../tasks/resource/model';
import type {
  AttributionArea,
  AttributionFacts,
  DirtyPathFact,
  EngineWriteFact,
} from './attribution';
import { dirtySetOf } from './dirty-set';

/**
 * Where a checkout keeps what the Engine owns, checkout-relative with `/` separators, passed in by
 * the composition (never hardcoded here): the Specification root (the Engine's constant
 * `SPECIFICATION_ROOT`; `<root>/<location>/<slug>/` are Specification directories) and the Engine's
 * namespaces derived from the Project Home (its project folder, and the local state when it lies in
 * this checkout).
 */
export interface AttributionLayout {
  readonly specificationRoot: string;
  readonly namespaces: readonly string[];
}

/** The Engine's own uncommitted writes of the checkout by path, oldest first; one is `latest`. */
export interface EngineWrites {
  readonly byPath: ReadonlyMap<string, readonly EngineWriteFact[]>;
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
 * The paths a status reports as not in HEAD: untracked, staged as new, and the new side of a staged
 * rename or copy (`listUncleanPaths` reports it first, then its origin, with the same status).
 */
function addedPaths(unclean: readonly UncleanPath[]): ReadonlySet<string> {
  const added = new Set<string>();
  for (let index = 0; index < unclean.length; index += 1) {
    const { status, path } = unclean[index]!;
    if (status.includes('R') || status.includes('C')) {
      added.add(path);
      index += 1;
    } else if (status === '??' || status.startsWith('A')) {
      added.add(path);
    }
  }

  return added;
}

/**
 * Whether a file of a Specification directory is registered: listed by the Specification's
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
    // The registry file, and the main document every Task registers.
    if (relative === TASK_MANIFEST_FILE || relative === TASK_MAIN_DOCUMENT.path) {
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
 * (`dirtySetOf`, bounded), whether it is new, where it lies and which of the Engine's own uncommitted
 * writes touched it. Lock-free; reads only the checkout.
 */
export async function attributionFactsOf(
  root: string,
  unclean: readonly UncleanPath[],
  layout: AttributionLayout,
  writes: EngineWrites,
): Promise<AttributionFacts> {
  const added = addedPaths(unclean);
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
    if (entry.path.endsWith('/')) {
      // Git names an untracked nested repository as its folder; nothing in it can be attributed.
      area = { kind: 'nested-repository' };
    } else if (directory !== undefined) {
      area = {
        kind: 'specification',
        registered: await isRegistered(entry.path, directory, registries),
      };
    } else if (layout.namespaces.some((namespace) => under(entry.path, namespace))) {
      area = { kind: 'engine' };
    } else {
      area = { kind: 'code' };
    }

    const engine = writes.byPath.get(entry.path);
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
