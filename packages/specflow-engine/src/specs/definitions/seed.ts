import { realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DefinitionKindRegistry } from './kind-registry';
import { createDefaultDefinitionRegistry } from './kinds';
import { createFilesystemDefinitionSource, type DefinitionSource } from './source';

/**
 * The default definitions the product ships. They are data files in the same layout as a project's
 * `.nevo/definitions` (`packages/specflow-engine/definitions/` in the repository; copied next to the CLI
 * bundle by the packaging step), used ONLY by `init` and `definitions install`: the Engine never
 * reads a seed to answer a catalogue request.
 */

export class DefinitionSeedError extends Error {
  readonly code: 'SEEDS_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'DefinitionSeedError';
    this.code = 'SEEDS_UNAVAILABLE';
  }
}

export interface LocateSeedOptions {
  /** The module to resolve from (default: this one). The CLI bundle's directory holds the seed folder. */
  readonly fromUrl?: string;
  /** Kinds whose folder identifies a seed root (default: the shipped kinds). */
  readonly registry?: DefinitionKindRegistry;
}

/**
 * Where the seed folder is, relative to the directory of the resolving module, in the three layouts
 * the product has: next to the CLI bundle (`<bundle>/bin.js` and `<bundle>/definitions`), in the built
 * Engine package (`dist/*.js` and `<package>/definitions`) and in the repository source tree
 * (`src/specs/definitions/seed.ts` and `<package>/definitions`). Nothing else is searched.
 */
const SEED_LAYOUTS: readonly string[] = ['.', '..', '../../..'];

/** The folder name of the seeds next to the bundle and in the package. */
export const SEED_DIRECTORY_NAME = 'definitions';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the seed folder: `definitions/` holding the folder of a registered kind, at one of the exact
 * {@link SEED_LAYOUTS} relative to this module.
 */
export async function locateSeedDirectory(options: LocateSeedOptions = {}): Promise<string> {
  const registry = options.registry ?? createDefaultDefinitionRegistry();
  const kinds = registry.loadOrder().map((kind) => kind.kind);
  const moduleDirectory = dirname(fileURLToPath(options.fromUrl ?? import.meta.url));
  for (const layout of SEED_LAYOUTS) {
    const candidate = join(moduleDirectory, layout, SEED_DIRECTORY_NAME);
    for (const kind of kinds) {
      if (await isDirectory(join(candidate, kind))) {
        return realpath(candidate);
      }
    }
  }

  throw new DefinitionSeedError('The default definitions are not available in this installation.');
}

export interface SeedSource {
  readonly directory: string;
  readonly source: DefinitionSource;
}

/** Open the seeds as a definitions tree. `directory` overrides the lookup (tests, packaging). */
export async function openSeedSource(
  options: LocateSeedOptions & { readonly directory?: string } = {},
): Promise<SeedSource> {
  const directory =
    options.directory !== undefined
      ? await realpath(options.directory)
      : await locateSeedDirectory(options);

  return { directory, source: createFilesystemDefinitionSource(directory) };
}
