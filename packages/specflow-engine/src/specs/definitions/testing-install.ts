import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { installProjectDefinitions } from './install-project';
import { createDefaultDefinitionRegistry } from './kinds';
import { loadDefinitions } from './loader';
import { resolveProjectCatalogue } from './project-catalogue';
import type { ResolvedCatalogue } from './resolved-catalogue';
import { openSeedSource } from './seed';
import { DEFINITIONS_RELATIVE_PATH } from './source';

const installing = new Map<string, Promise<void>>();

/**
 * Test helper: give a Project Home the shipped definitions when it has none, through the production
 * install path (so with Git enabled they are committed like `definitions install` commits them, and a
 * project on a protected branch is refused like any install). A project that already has a
 * definitions folder is left exactly as it is, so a test that edited or deleted a definition keeps its
 * change. Concurrent callers for one home share a single installation. Not used by production code.
 */
export function installDefinitionsForTesting(engine: SpecFlowEngine): Promise<void> {
  const homeRoot = engine.context.project.homeRoot;
  const running = installing.get(homeRoot);
  if (running) {
    return running;
  }

  const started = installWhenAbsent(engine).finally(() => installing.delete(homeRoot));
  installing.set(homeRoot, started);

  return started;
}

async function installWhenAbsent(engine: SpecFlowEngine): Promise<void> {
  const target = join(engine.context.project.homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/'));
  try {
    await stat(target);

    return;
  } catch {
    // No definitions folder yet.
  }

  await installProjectDefinitions(engine);
}

let seedCatalogue: Promise<ResolvedCatalogue> | undefined;

/**
 * Test helper: the catalogue the shipped definitions resolve to, for a unit test that builds a
 * scaffold or a projection without a project on disk. Not used by production code (the Engine never
 * reads the shipped definitions to answer a request).
 */
export function seedCatalogueForTesting(): Promise<ResolvedCatalogue> {
  seedCatalogue ??= (async () => {
    const seeds = await openSeedSource();
    const loaded = await loadDefinitions(seeds.source, createDefaultDefinitionRegistry());

    return resolveProjectCatalogue(loaded).catalogue;
  })();

  return seedCatalogue;
}
