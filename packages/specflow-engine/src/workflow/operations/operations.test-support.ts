import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadDefinitions } from '../../specs/definitions/loader';
import { createDefaultDefinitionRegistry } from '../../specs/definitions/kinds';
import { locateSeedDirectory, openSeedSource } from '../../specs/definitions/seed';
import { resolveExecutionCatalogue, type ExecutionCatalogue } from '../definitions/catalogue';
import { createMemoryWorkflowStore } from '../state/memory-store.test-support';
import type { ExecutorRecord } from '../state/model';
import type { WorkflowDependencies } from './loaded-execution';

/** The execution catalogue of the shipped seed definitions. */
export async function seedExecutionCatalogue(): Promise<ExecutionCatalogue> {
  const seeds = await openSeedSource();

  return resolveExecutionCatalogue(
    await loadDefinitions(seeds.source, createDefaultDefinitionRegistry()),
  );
}

/** Every shipped seed file by its path relative to the definitions folder, to copy and edit. */
export async function seedDefinitionFiles(): Promise<Record<string, string>> {
  const directory = await locateSeedDirectory();
  const files: Record<string, string> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(directory.length + 1).replaceAll('\\', '/')] = await readFile(path, 'utf8');
    }
  }

  return files;
}

/** Dependencies over an in-memory store with a clock that advances one second per reading. */
export function memoryDependencies(catalogue: ExecutionCatalogue): WorkflowDependencies & {
  readonly store: ReturnType<typeof createMemoryWorkflowStore>;
} {
  let tick = Date.parse('2026-11-05T10:00:00.000Z');
  let queue = Promise.resolve();

  return {
    store: createMemoryWorkflowStore(),
    catalogue,
    now: () => new Date((tick += 1000)),
    serialize: <T>(operation: () => Promise<T>) => {
      const result = queue.then(operation);
      queue = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}

export const agent = (provider: string, sessionId: string, model?: string): ExecutorRecord => ({
  kind: 'agent',
  provider,
  sessionId,
  ...(model !== undefined ? { model } : {}),
});

export const owner: ExecutorRecord = { kind: 'human', actorId: 'owner' };
